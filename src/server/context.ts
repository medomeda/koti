import "server-only";
import { can, type Permission } from "@/lib/permissions";
import { todayISO } from "@/lib/utils/dates";
import type { DbState } from "@/server/db/store";
import { forbidden, notFound } from "@/server/errors";
import type { ISODate, Tontine, TontineMember } from "@/types/domain";

/** Contexte d'exécution d'un service : qui agit, et quand (injectable pour le seed et les tests). */
export interface Ctx {
  userId: string;
  now: Date;
}

export const ctxFor = (userId: string, now = new Date()): Ctx => ({ userId, now });
export const isoNow = (ctx: Ctx) => ctx.now.toISOString();
export const today = (ctx: Ctx): ISODate => todayISO(ctx.now);

export interface Access {
  tontine: Tontine;
  member: TontineMember;
}

/**
 * Cloisonnement (PRD §6.17) : session → adhésion active → rôle → permission.
 * Une tontine dont l'utilisateur n'est pas membre est signalée « introuvable »
 * pour ne pas révéler son existence à partir d'un identifiant deviné.
 */
export function requireAccess(s: Readonly<DbState>, ctx: Ctx, tontineId: string, permission: Permission = "tontine.view"): Access {
  const tontine = s.tontines.find((t) => t.id === tontineId);
  const member = tontine && s.tontineMembers.find((m) => m.tontineId === tontineId && m.userId === ctx.userId && m.status === "ACTIVE");
  if (!tontine || !member) throw notFound("Tontine introuvable ou accès non autorisé.");
  if (!can(member.role, permission)) throw forbidden();
  return { tontine, member };
}

export function findAccess(s: Readonly<DbState>, userId: string, tontineId: string): Access | null {
  const tontine = s.tontines.find((t) => t.id === tontineId);
  const member = tontine && s.tontineMembers.find((m) => m.tontineId === tontineId && m.userId === userId && m.status === "ACTIVE");
  return tontine && member ? { tontine, member } : null;
}

export function displayName(s: Readonly<DbState>, userId: string): string {
  return s.userProfiles.find((p) => p.userId === userId)?.fullName ?? "Utilisateur";
}
