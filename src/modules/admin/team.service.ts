import "server-only";
import { audit } from "@/modules/audit/audit.service";
import { isoNow, requirePlatform, type Ctx } from "@/server/context";
import { read, tx, type DbState } from "@/server/db/store";
import { conflict, forbidden, invalidState, notFound } from "@/server/errors";
import { newId, newToken, sha256 } from "@/server/ids";
import type { PlatformRole, StaffInvitation, User } from "@/types/domain";

/**
 * Gestion de l'équipe KOTI (collaborateurs et rôles), réservée au SUPER_ADMIN.
 * Un collaborateur arrive par invitation : le lien est à usage unique, expire au bout de 7 jours, et ne
 * fonctionne qu'avec un compte dont l'e-mail correspond. L'e-mail d'invitation sera envoyé en phase 2.
 */

export type StaffRole = Exclude<PlatformRole, "USER">;
export const STAFF_INVITATION_TTL_DAYS = 7;

const nameOf = (s: Readonly<DbState>, id: string) => s.userProfiles.find((p) => p.userId === id)?.fullName ?? "Utilisateur";
const effective = (i: StaffInvitation, now: Date) => (i.status === "PENDING" && new Date(i.expiresAt) <= now ? ("EXPIRED" as const) : i.status);
const activeSuperAdmins = (s: Readonly<DbState>) => s.users.filter((u) => u.platformRole === "SUPER_ADMIN" && u.status === "ACTIVE");

export function listTeam(ctx: Ctx) {
  return read((s) => {
    requirePlatform(s, ctx, "admin.view");
    const members = s.users
      .filter((u) => u.platformRole !== "USER")
      .map((u) => ({ userId: u.id, name: nameOf(s, u.id), email: u.email, role: u.platformRole as StaffRole, status: u.status, since: u.createdAt, isMe: u.id === ctx.userId }))
      .sort((a, b) => a.name.localeCompare(b.name, "fr"));
    const invitations = s.staffInvitations
      .map((i) => ({ id: i.id, email: i.email, role: i.role, status: effective(i, ctx.now), expiresAt: i.expiresAt, createdAt: i.createdAt, invitedByName: nameOf(s, i.invitedBy) }))
      .filter((i) => i.status === "PENDING" || i.status === "EXPIRED")
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return { members, invitations, superAdminCount: activeSuperAdmins(s).length };
  });
}

/** Renvoie le jeton brut UNE seule fois (pour l'afficher sous forme de lien) ; seule son empreinte est conservée. */
export function inviteStaff(ctx: Ctx, input: { email: string; role: StaffRole }): { token: string } {
  return tx((s) => {
    requirePlatform(s, ctx, "team.manage");
    const existing = s.users.find((u) => u.email === input.email);
    if (existing && existing.platformRole !== "USER") throw conflict("Cette personne fait déjà partie de l'équipe.");
    if (existing && (s.tontineMembers.some((m) => m.userId === existing.id) || s.tontines.some((t) => t.creatorId === existing.id))) {
      throw conflict("Cette adresse est déjà utilisée par un client qui a des tontines. Invitez une autre adresse, dédiée à l'équipe.");
    }
    if (s.staffInvitations.some((i) => i.email === input.email && effective(i, ctx.now) === "PENDING")) throw conflict("Une invitation est déjà en attente pour cette adresse.");
    const token = newToken();
    const inv: StaffInvitation = {
      id: newId(),
      email: input.email,
      role: input.role,
      tokenHash: sha256(token),
      status: "PENDING",
      invitedBy: ctx.userId,
      expiresAt: new Date(ctx.now.getTime() + STAFF_INVITATION_TTL_DAYS * 86_400_000).toISOString(),
      createdAt: isoNow(ctx),
      acceptedAt: null,
    };
    s.staffInvitations.push(inv);
    audit(s, ctx, { tontineId: null, action: "admin.team.invite", entityType: "staffInvitation", entityId: inv.id, newValues: { email: input.email, platformRole: input.role } });
    return { token };
  });
}

export function revokeStaffInvitation(ctx: Ctx, input: { id: string }) {
  tx((s) => {
    requirePlatform(s, ctx, "team.manage");
    const inv = s.staffInvitations.find((i) => i.id === input.id);
    if (!inv) throw notFound("Invitation introuvable.");
    if (effective(inv, ctx.now) !== "PENDING") throw invalidState("Cette invitation n'est plus en attente.");
    inv.status = "REVOKED";
    audit(s, ctx, { tontineId: null, action: "admin.team.revoke", entityType: "staffInvitation", entityId: inv.id, newValues: { email: inv.email } });
  });
}

/** Aperçu public d'un lien d'invitation (page d'arrivée). Ne révèle que le rôle, l'adresse invitée et l'auteur. */
export function previewStaffInvitation(token: string, now = new Date()) {
  return read((s) => {
    const inv = s.staffInvitations.find((i) => i.tokenHash === sha256(token));
    if (!inv) return null;
    return { email: inv.email, role: inv.role, status: effective(inv, now), expiresAt: inv.expiresAt, invitedByName: nameOf(s, inv.invitedBy) };
  });
}

/** Accepte l'invitation : le compte connecté doit avoir l'adresse invitée. Il devient membre de l'équipe avec le rôle prévu. */
export function acceptStaffInvitation(ctx: Ctx, token: string) {
  tx((s) => {
    const inv = s.staffInvitations.find((i) => i.tokenHash === sha256(token));
    if (!inv) throw notFound("Invitation introuvable.");
    const user = s.users.find((u) => u.id === ctx.userId);
    if (!user || user.status !== "ACTIVE") throw forbidden();
    if (effective(inv, ctx.now) !== "PENDING") throw invalidState("Cette invitation n'est plus valable.");
    if (user.email !== inv.email) throw forbidden("Cette invitation est destinée à une autre adresse e-mail.");
    if (user.platformRole !== "USER") throw conflict("Ce compte fait déjà partie de l'équipe.");
    user.platformRole = inv.role;
    inv.status = "ACCEPTED";
    inv.acceptedAt = isoNow(ctx);
    audit(s, ctx, { tontineId: null, action: "admin.team.join", entityType: "staffInvitation", entityId: inv.id, oldValues: { platformRole: "USER" }, newValues: { email: inv.email, platformRole: inv.role } });
  });
}

function targetMember(s: DbState, ctx: Ctx, userId: string): User {
  if (userId === ctx.userId) throw invalidState("Vous ne pouvez pas modifier votre propre accès. Demandez à un autre super-admin.");
  const u = s.users.find((x) => x.id === userId);
  if (!u || u.platformRole === "USER") throw notFound("Collaborateur introuvable.");
  return u;
}

export function changeStaffRole(ctx: Ctx, input: { userId: string; role: StaffRole; reason: string }) {
  tx((s) => {
    requirePlatform(s, ctx, "team.manage");
    const u = targetMember(s, ctx, input.userId);
    if (u.platformRole === input.role) throw conflict("Ce collaborateur a déjà ce rôle.");
    if (u.platformRole === "SUPER_ADMIN" && u.status === "ACTIVE" && activeSuperAdmins(s).length <= 1) throw invalidState("Il doit rester au moins un super-admin actif.");
    const before = u.platformRole;
    u.platformRole = input.role;
    audit(s, ctx, { tontineId: null, action: "admin.team.role", entityType: "user", entityId: u.id, oldValues: { platformRole: before }, newValues: { platformRole: input.role }, reason: input.reason });
  });
}

/** Désactive (déconnexion immédiate) ou réactive l'accès d'un collaborateur. */
export function setStaffStatus(ctx: Ctx, input: { userId: string; active: boolean; reason: string }) {
  tx((s) => {
    requirePlatform(s, ctx, "team.manage");
    const u = targetMember(s, ctx, input.userId);
    const next = input.active ? "ACTIVE" : "SUSPENDED";
    if (u.status === next) throw conflict(input.active ? "Cet accès est déjà actif." : "Cet accès est déjà désactivé.");
    if (!input.active && u.platformRole === "SUPER_ADMIN" && activeSuperAdmins(s).length <= 1) throw invalidState("Il doit rester au moins un super-admin actif.");
    const before = u.status;
    u.status = next;
    if (!input.active) s.sessions = s.sessions.filter((x) => x.userId !== u.id);
    audit(s, ctx, { tontineId: null, action: "admin.team.status", entityType: "user", entityId: u.id, oldValues: { status: before }, newValues: { status: next }, reason: input.reason });
  });
}
