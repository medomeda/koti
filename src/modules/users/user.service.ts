import "server-only";
import { hashPassword } from "@/lib/auth/password";
import { ensureSubscription } from "@/modules/billing/billing.service";
import { read, type DbState } from "@/server/db/store";
import type { Ctx } from "@/server/context";
import { AppError } from "@/server/errors";
import { newId } from "@/server/ids";

/** Création de compte DANS l'état en mémoire : uniquement pour construire le jeu de démonstration (`seed.ts`). Les comptes réels passent par `user.pg.ts`. */
export function registerUser(s: DbState, input: { fullName: string; email: string; phone: string; password: string; now: Date; passwordHash?: string }): string {
  if (s.users.some((u) => u.email === input.email)) throw new AppError("CONFLICT", "Un compte existe déjà avec cet e-mail.", { email: "Adresse déjà utilisée." });
  if (s.userProfiles.some((p) => p.phone === input.phone)) throw new AppError("CONFLICT", "Ce numéro est déjà associé à un compte.", { phone: "Numéro déjà utilisé." });
  const id = newId();
  const now = input.now.toISOString();
  s.users.push({ id, email: input.email, emailVerified: false, platformRole: "USER", status: "ACTIVE", createdAt: now });
  ensureSubscription(s, id, input.now);
  s.credentials.push({ userId: id, passwordHash: input.passwordHash ?? hashPassword(input.password) });
  s.userProfiles.push({ userId: id, fullName: input.fullName, phone: input.phone, avatarUrl: null, createdAt: now, updatedAt: now });
  // Phase backend : Better Auth envoie l'e-mail de vérification.
  return id;
}

export function getProfileStats(ctx: Ctx) {
  return read((s) => {
    const memberships = s.tontineMembers.filter((m) => m.userId === ctx.userId && m.status === "ACTIVE");
    return { tontines: memberships.length, adminOf: memberships.filter((m) => m.role === "ADMIN").length };
  });
}
