import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import "@/server/bootstrap";
import { read, tx } from "@/server/db/store";
import { newToken, sha256 } from "@/server/ids";
import type { User, UserProfile } from "@/types/domain";

/**
 * Sessions côté serveur (phase frontend). Mêmes garanties que Better Auth :
 * - jeton aléatoire 256 bits dans un cookie httpOnly, SameSite=Lax, Secure en production ;
 * - seule l'empreinte SHA-256 du jeton est stockée ;
 * - expiration glissante non implémentée : durée fixe de 7 jours.
 */
export const SESSION_COOKIE = "koti_session";
const SESSION_TTL_MS = 7 * 24 * 3600 * 1000;

export interface SessionUser {
  id: string;
  email: string;
  fullName: string;
  phone: string;
  avatarUrl: string | null;
  createdAt: string;
}

export async function createSession(userId: string) {
  const token = newToken();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SESSION_TTL_MS);
  tx((s) => {
    // Nettoyage opportuniste des sessions expirées.
    s.sessions = s.sessions.filter((x) => new Date(x.expiresAt) > now);
    s.sessions.push({ tokenHash: sha256(token), userId, expiresAt: expiresAt.toISOString(), createdAt: now.toISOString() });
  });
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
  if (token) {
    const h = sha256(token);
    tx((s) => {
      s.sessions = s.sessions.filter((x) => x.tokenHash !== h);
    });
  }
  jar.delete(SESSION_COOKIE);
}

export function toSessionUser(user: User, profile: UserProfile | undefined): SessionUser {
  return {
    id: user.id,
    email: user.email,
    fullName: profile?.fullName ?? user.email,
    phone: profile?.phone ?? "",
    avatarUrl: profile?.avatarUrl ?? null,
    createdAt: user.createdAt,
  };
}

/** Session courante (mémoïsée par requête). */
export const getSession = cache(async (): Promise<SessionUser | null> => {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token || token.length > 100) return null;
  const h = sha256(token);
  return read((s) => {
    const session = s.sessions.find((x) => x.tokenHash === h);
    if (!session || new Date(session.expiresAt) <= new Date()) return null;
    const user = s.users.find((u) => u.id === session.userId);
    if (!user) return null;
    return toSessionUser(user, s.userProfiles.find((p) => p.userId === user.id));
  });
});

/** À utiliser dans les pages privées : redirige vers la connexion si nécessaire. */
export async function requireUser(next?: string): Promise<SessionUser> {
  const user = await getSession();
  if (!user) redirect(next ? `/login?next=${encodeURIComponent(next)}` : "/login");
  return user;
}
