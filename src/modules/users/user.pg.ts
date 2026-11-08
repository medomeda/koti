import "server-only";
import { eq } from "drizzle-orm";
import { hashPassword } from "@/lib/auth/password";
import { getDb, transaction, type Db, type Executor } from "@/server/db/client";
import { ensureReady } from "@/server/db/ready";
import { uniqueViolation } from "@/server/db/pg-errors";
import { accounts, subscriptions, userProfiles, users } from "@/server/db/schema";
import type { Ctx } from "@/server/context";
import { AppError } from "@/server/errors";
import type { PlatformRole, User } from "@/types/domain";

/**
 * Comptes sur PostgreSQL. La création du compte (utilisateur, profil, mot de passe, abonnement gratuit) est faite ici,
 * en une transaction ; la connexion, les sessions, la vérification d'adresse et le mot de passe oublié sont gérés par
 * Better Auth (`server/auth.ts`). L'unicité de l'e-mail et du téléphone est garantie par la base : deux inscriptions
 * simultanées ne peuvent pas créer deux comptes.
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

export const toUser = (r: typeof users.$inferSelect): User => ({
  id: r.id,
  name: r.name,
  email: r.email,
  image: r.image,
  emailVerified: r.emailVerified,
  platformRole: r.platformRole as PlatformRole,
  status: r.status,
  createdAt: r.createdAt.toISOString(),
  updatedAt: r.updatedAt.toISOString(),
});

/** Crée le compte, son profil, son mot de passe (compte « credential » de Better Auth) et son abonnement gratuit. */
export async function registerUser(tx: Executor, input: { fullName: string; email: string; phone: string; passwordHash: string; now: Date; platformRole?: PlatformRole; emailVerified?: boolean }): Promise<string> {
  try {
    const [user] = await tx
      .insert(users)
      .values({ email: input.email, name: input.fullName, emailVerified: input.emailVerified ?? false, platformRole: input.platformRole ?? "USER", createdAt: input.now, updatedAt: input.now })
      .returning({ id: users.id });
    const id = user!.id;
    await tx.insert(userProfiles).values({ userId: id, fullName: input.fullName, phone: input.phone, createdAt: input.now, updatedAt: input.now });
    await tx.insert(accounts).values({ accountId: id, providerId: "credential", userId: id, password: input.passwordHash, createdAt: input.now, updatedAt: input.now });
    await tx.insert(subscriptions).values({ userId: id, planId: "FREE", status: "ACTIVE", startedAt: input.now });
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

export async function updateProfile(ctx: Ctx, input: { fullName: string; phone: string }, db: Db = getDb()): Promise<void> {
  try {
    await transaction(async (tx) => {
      const updated = await tx.update(userProfiles).set({ fullName: input.fullName, phone: input.phone, updatedAt: ctx.now }).where(eq(userProfiles.userId, ctx.userId)).returning({ id: userProfiles.userId });
      if (updated.length === 0) throw new AppError("NOT_FOUND", "Profil introuvable.");
      await tx.update(users).set({ name: input.fullName, updatedAt: ctx.now }).where(eq(users.id, ctx.userId));
    }, db);
  } catch (err) {
    throw conflictFrom(err) ?? err;
  }
}
