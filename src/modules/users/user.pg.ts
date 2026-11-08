import "server-only";
import { eq, sql } from "drizzle-orm";
import { DUMMY_HASH, hashPassword, verifyPassword } from "@/lib/auth/password";
import { getDb, transaction, type Db, type Executor } from "@/server/db/client";
import { ensureReady } from "@/server/db/ready";
import { uniqueViolation } from "@/server/db/pg-errors";
import { credentials, sessions, subscriptions, userProfiles, users } from "@/server/db/schema";
import type { Ctx } from "@/server/context";
import { AppError } from "@/server/errors";
import type { PlatformRole, User } from "@/types/domain";

/**
 * Comptes sur PostgreSQL (phase 2, étape 2). Version asynchrone de `user.service.ts`, qui reste en service
 * jusqu'au basculement de l'interface. Mêmes règles, mêmes messages ; en plus, l'unicité de l'e-mail et du
 * téléphone est garantie par la base (deux inscriptions simultanées ne peuvent pas créer deux comptes).
 */

const EMAIL_TAKEN = () => new AppError("CONFLICT", "Un compte existe déjà avec cet e-mail.", { email: "Adresse déjà utilisée." });
const PHONE_TAKEN = () => new AppError("CONFLICT", "Ce numéro est déjà associé à un compte.", { phone: "Numéro déjà utilisé." });

function conflictFrom(err: unknown): AppError | null {
  const c = uniqueViolation(err);
  if (c === undefined) return null;
  if (c.includes("users_email")) return EMAIL_TAKEN();
  if (c.includes("phone")) return PHONE_TAKEN();
  return null;
}

export const toUser = (r: typeof users.$inferSelect): User => ({ id: r.id, email: r.email, emailVerified: r.emailVerified, platformRole: r.platformRole as PlatformRole, status: r.status, createdAt: r.createdAt.toISOString() });

/** Crée le compte, son profil, son mot de passe et son abonnement gratuit, dans la transaction de l'appelant. */
export async function registerUser(tx: Executor, input: { fullName: string; email: string; phone: string; passwordHash: string; now: Date; platformRole?: PlatformRole }): Promise<string> {
  try {
    const [user] = await tx.insert(users).values({ email: input.email, platformRole: input.platformRole ?? "USER", createdAt: input.now }).returning({ id: users.id });
    const id = user!.id;
    await tx.insert(userProfiles).values({ userId: id, fullName: input.fullName, phone: input.phone, createdAt: input.now, updatedAt: input.now });
    await tx.insert(credentials).values({ userId: id, passwordHash: input.passwordHash });
    await tx.insert(subscriptions).values({ userId: id, planId: "FREE", status: "ACTIVE", startedAt: input.now });
    // Phase suivante : Better Auth envoie l'e-mail de vérification.
    return id;
  } catch (err) {
    throw conflictFrom(err) ?? err;
  }
}

export async function signUp(input: { fullName: string; email: string; phone: string; password: string }, db: Db = getDb()): Promise<string> {
  await ensureReady();
  const passwordHash = hashPassword(input.password); // hors transaction : opération coûteuse
  return transaction((tx) => registerUser(tx, { ...input, passwordHash, now: new Date() }), db);
}

/** Renvoie l'id utilisateur ou null. Message générique côté appelant (pas d'énumération de comptes). */
export async function authenticate(email: string, password: string, db: Db = getDb()): Promise<string | null> {
  await ensureReady();
  const [found] = await db
    .select({ id: users.id, status: users.status, hash: credentials.passwordHash })
    .from(users)
    .innerJoin(credentials, eq(credentials.userId, users.id))
    .where(sql`lower(${users.email}) = lower(${email})`)
    .limit(1);
  const ok = verifyPassword(password, found?.hash ?? DUMMY_HASH);
  if (!ok || !found) return null;
  // Compte suspendu par l'équipe KOTI : connexion refusée (mot de passe pourtant correct).
  if (found.status === "SUSPENDED") throw new AppError("FORBIDDEN", "Ce compte est suspendu. Contactez l'équipe KOTI pour en savoir plus.");
  return found.id;
}

export async function updateProfile(ctx: Ctx, input: { fullName: string; phone: string }, db: Db = getDb()): Promise<void> {
  try {
    const updated = await db.update(userProfiles).set({ fullName: input.fullName, phone: input.phone, updatedAt: ctx.now }).where(eq(userProfiles.userId, ctx.userId)).returning({ id: userProfiles.userId });
    if (updated.length === 0) throw new AppError("NOT_FOUND", "Profil introuvable.");
  } catch (err) {
    throw conflictFrom(err) ?? err;
  }
}

export async function changePassword(ctx: Ctx, input: { currentPassword: string; newPassword: string }, db: Db = getDb()): Promise<void> {
  const [current] = await db.select({ hash: credentials.passwordHash }).from(credentials).where(eq(credentials.userId, ctx.userId));
  if (!current || !verifyPassword(input.currentPassword, current.hash)) throw new AppError("VALIDATION", "Mot de passe actuel incorrect.", { currentPassword: "Mot de passe incorrect." });
  const next = hashPassword(input.newPassword);
  await transaction(async (tx) => {
    await tx.update(credentials).set({ passwordHash: next }).where(eq(credentials.userId, ctx.userId));
    // Révoque toutes les autres sessions : la session courante sera recréée par l'action.
    await tx.delete(sessions).where(eq(sessions.userId, ctx.userId));
  }, db);
}
