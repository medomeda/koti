import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { createSessionRow, deleteSessionByToken, findSessionUser, type SessionUser } from "@/modules/users/session.pg";

/**
 * Sessions côté serveur : jeton aléatoire de 256 bits dans un cookie httpOnly, SameSite=Lax, Secure en production ;
 * seule l'empreinte SHA-256 du jeton est stockée en base (voir `modules/users/session.pg.ts`).
 * Durée fixe de 7 jours. Better Auth prendra le relais (même contrat : cookie httpOnly, jeton haché).
 */
export const SESSION_COOKIE = "koti_session";
export type { SessionUser };

export async function createSession(userId: string) {
  const { token, expiresAt } = await createSessionRow(userId);
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  });
}

export async function destroySession() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await deleteSessionByToken(token);
  jar.delete(SESSION_COOKIE);
}

/** Session courante (mémoïsée par requête). */
export const getSession = cache(async (): Promise<SessionUser | null> => {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return findSessionUser(token);
});

/** À utiliser dans les pages privées : redirige vers la connexion si nécessaire. */
export async function requireUser(next?: string): Promise<SessionUser> {
  const user = await getSession();
  if (!user) redirect(next ? `/login?next=${encodeURIComponent(next)}` : "/login");
  return user;
}
