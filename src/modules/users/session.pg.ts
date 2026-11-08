import "server-only";
import { and, eq, gt, lte, ne } from "drizzle-orm";
import { getDb, type Db } from "@/server/db/client";
import { sessions, userProfiles, users } from "@/server/db/schema";
import { newToken, sha256 } from "@/server/ids";

/**
 * Sessions sur PostgreSQL : jeton aléatoire de 256 bits (le cookie), seule son empreinte SHA-256 est stockée.
 * Cette couche ne connaît pas les cookies : `lib/auth/session.ts` les gère et appelle ces fonctions.
 */
export const SESSION_TTL_MS = 7 * 24 * 3600 * 1000;

export interface SessionUser {
  id: string;
  email: string;
  fullName: string;
  phone: string;
  avatarUrl: string | null;
  createdAt: string;
}

export async function createSessionRow(userId: string, now = new Date(), db: Db = getDb()): Promise<{ token: string; expiresAt: Date }> {
  const token = newToken();
  const expiresAt = new Date(now.getTime() + SESSION_TTL_MS);
  // Nettoyage opportuniste des sessions expirées (toutes, pas seulement celles de l'utilisateur).
  await db.delete(sessions).where(lte(sessions.expiresAt, now));
  await db.insert(sessions).values({ tokenHash: sha256(token), userId, expiresAt, createdAt: now });
  return { token, expiresAt };
}

/** L'utilisateur de la session, ou null : jeton inconnu, session expirée, compte suspendu. */
export async function findSessionUser(token: string, now = new Date(), db: Db = getDb()): Promise<SessionUser | null> {
  if (!token || token.length > 100) return null;
  const [row] = await db
    .select({ u: users, p: userProfiles })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .leftJoin(userProfiles, eq(userProfiles.userId, users.id))
    .where(and(eq(sessions.tokenHash, sha256(token)), gt(sessions.expiresAt, now)))
    .limit(1);
  if (!row || row.u.status === "SUSPENDED") return null;
  return { id: row.u.id, email: row.u.email, fullName: row.p?.fullName ?? row.u.email, phone: row.p?.phone ?? "", avatarUrl: row.p?.avatarUrl ?? null, createdAt: row.u.createdAt.toISOString() };
}

export async function deleteSessionByToken(token: string, db: Db = getDb()): Promise<void> {
  await db.delete(sessions).where(eq(sessions.tokenHash, sha256(token)));
}

/** Ferme toutes les sessions d'un utilisateur (suspension, changement de mot de passe), sauf éventuellement une. */
export async function deleteUserSessions(userId: string, exceptToken?: string, db: Db = getDb()): Promise<void> {
  await db.delete(sessions).where(exceptToken ? and(eq(sessions.userId, userId), ne(sessions.tokenHash, sha256(exceptToken))) : eq(sessions.userId, userId));
}
