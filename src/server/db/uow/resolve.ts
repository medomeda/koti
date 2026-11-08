import "server-only";
import { eq } from "drizzle-orm";
import { getDb, type Db } from "../client";
import { contributionObligations, invitations, notifications, payments } from "../schema";
import { sha256 } from "@/server/ids";

/**
 * Retrouve le périmètre d'une opération qui ne reçoit qu'un identifiant de ressource (échéance, paiement,
 * invitation…) : une lecture ciblée donne la tontine concernée, qui sera ensuite chargée et verrouillée.
 * Un identifiant inconnu renvoie null : le service lèvera alors lui-même l'erreur « introuvable ».
 */
export async function tontineOfObligation(id: string, db: Db = getDb()): Promise<string | null> {
  const [r] = await db.select({ t: contributionObligations.tontineId }).from(contributionObligations).where(eq(contributionObligations.id, id)).limit(1);
  return r?.t ?? null;
}

export async function tontineOfPayment(id: string, db: Db = getDb()): Promise<string | null> {
  const [r] = await db.select({ t: contributionObligations.tontineId }).from(payments).innerJoin(contributionObligations, eq(contributionObligations.id, payments.obligationId)).where(eq(payments.id, id)).limit(1);
  return r?.t ?? null;
}

export async function invitationRef(ref: { token: string } | { invitationId: string }, db: Db = getDb()): Promise<{ tontineId: string; invitedUserId: string | null } | null> {
  const where = "token" in ref ? eq(invitations.tokenHash, sha256(ref.token)) : eq(invitations.id, ref.invitationId);
  const [r] = await db.select({ t: invitations.tontineId, u: invitations.invitedUserId }).from(invitations).where(where).limit(1);
  return r ? { tontineId: r.t, invitedUserId: r.u } : null;
}

export async function notificationOwner(id: string, db: Db = getDb()): Promise<string | null> {
  const [r] = await db.select({ u: notifications.userId }).from(notifications).where(eq(notifications.id, id)).limit(1);
  return r?.u ?? null;
}
