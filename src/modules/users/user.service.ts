import "server-only";
import { DUMMY_HASH, hashPassword, verifyPassword } from "@/lib/auth/password";
import { isoNow, type Ctx } from "@/server/context";
import { read, tx, type DbState } from "@/server/db/store";
import { AppError } from "@/server/errors";
import { newId } from "@/server/ids";

export function registerUser(s: DbState, input: { fullName: string; email: string; phone: string; password: string; now: Date; passwordHash?: string }): string {
  if (s.users.some((u) => u.email === input.email)) throw new AppError("CONFLICT", "Un compte existe déjà avec cet e-mail.", { email: "Adresse déjà utilisée." });
  if (s.userProfiles.some((p) => p.phone === input.phone)) throw new AppError("CONFLICT", "Ce numéro est déjà associé à un compte.", { phone: "Numéro déjà utilisé." });
  const id = newId();
  const now = input.now.toISOString();
  s.users.push({ id, email: input.email, emailVerified: false, createdAt: now });
  s.credentials.push({ userId: id, passwordHash: input.passwordHash ?? hashPassword(input.password) });
  s.userProfiles.push({ userId: id, fullName: input.fullName, phone: input.phone, avatarUrl: null, createdAt: now, updatedAt: now });
  // Phase backend : Better Auth envoie l'e-mail de vérification.
  return id;
}

export function signUp(input: { fullName: string; email: string; phone: string; password: string }): string {
  const passwordHash = hashPassword(input.password); // hors transaction : opération coûteuse
  return tx((s) => registerUser(s, { ...input, passwordHash, now: new Date() }));
}

/** Renvoie l'id utilisateur ou null. Message d'erreur générique côté appelant (pas d'énumération de comptes). */
export function authenticate(email: string, password: string): string | null {
  const found = read((s) => {
    const user = s.users.find((u) => u.email === email);
    const cred = user && s.credentials.find((c) => c.userId === user.id);
    return user && cred ? { id: user.id, hash: cred.passwordHash } : null;
  });
  const ok = verifyPassword(password, found?.hash ?? DUMMY_HASH);
  return ok && found ? found.id : null;
}

export function updateProfile(ctx: Ctx, input: { fullName: string; phone: string }) {
  tx((s) => {
    if (s.userProfiles.some((p) => p.phone === input.phone && p.userId !== ctx.userId)) throw new AppError("CONFLICT", "Ce numéro est déjà associé à un autre compte.", { phone: "Numéro déjà utilisé." });
    const profile = s.userProfiles.find((p) => p.userId === ctx.userId);
    if (!profile) throw new AppError("NOT_FOUND", "Profil introuvable.");
    profile.fullName = input.fullName;
    profile.phone = input.phone;
    profile.updatedAt = isoNow(ctx);
  });
}

export function changePassword(ctx: Ctx, input: { currentPassword: string; newPassword: string }) {
  const current = read((s) => s.credentials.find((c) => c.userId === ctx.userId)?.passwordHash);
  if (!current || !verifyPassword(input.currentPassword, current)) throw new AppError("VALIDATION", "Mot de passe actuel incorrect.", { currentPassword: "Mot de passe incorrect." });
  const next = hashPassword(input.newPassword);
  tx((s) => {
    const cred = s.credentials.find((c) => c.userId === ctx.userId)!;
    cred.passwordHash = next;
    // Révoque toutes les autres sessions : la session courante sera recréée par l'action.
    s.sessions = s.sessions.filter((x) => x.userId !== ctx.userId);
  });
}

export function getProfileStats(ctx: Ctx) {
  return read((s) => {
    const memberships = s.tontineMembers.filter((m) => m.userId === ctx.userId && m.status === "ACTIVE");
    return { tontines: memberships.length, adminOf: memberships.filter((m) => m.role === "ADMIN").length };
  });
}
