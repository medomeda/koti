import "server-only";
import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { getDb } from "@/server/db/client";
import { ensureReady } from "@/server/db/ready";
import { userProfiles, users } from "@/server/db/schema";
import { getAuth } from "@/server/auth";

/**
 * Session courante, via Better Auth (cookie httpOnly « koti.session_token », session en base).
 * Un compte suspendu n'a plus de session valide, même si son cookie est encore présent.
 */
export interface SessionUser {
  id: string;
  email: string;
  fullName: string;
  phone: string;
  avatarUrl: string | null;
  createdAt: string;
}

/** Session courante (mémoïsée par requête). */
export const getSession = cache(async (): Promise<SessionUser | null> => {
  await ensureReady();
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session) return null;
  const [row] = await getDb().select({ u: users, p: userProfiles }).from(users).leftJoin(userProfiles, eq(userProfiles.userId, users.id)).where(eq(users.id, session.user.id)).limit(1);
  if (!row || row.u.status === "SUSPENDED") return null;
  return { id: row.u.id, email: row.u.email, fullName: row.p?.fullName ?? row.u.email, phone: row.p?.phone ?? "", avatarUrl: row.p?.avatarUrl ?? null, createdAt: row.u.createdAt.toISOString() };
});

/** À utiliser dans les pages privées : redirige vers la connexion si nécessaire. */
export async function requireUser(next?: string): Promise<SessionUser> {
  const user = await getSession();
  if (!user) redirect(next ? `/login?next=${encodeURIComponent(next)}` : "/login");
  return user;
}
