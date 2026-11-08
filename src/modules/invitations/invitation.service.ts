import "server-only";
import { audit } from "@/modules/audit/audit.service";
import { ensureObligations } from "@/modules/contributions/contribution.service";
import { notify } from "@/modules/notifications/notification.service";
import { assertMemberCapacity } from "@/modules/billing/quota";
import { hasFreeSlot } from "@/modules/rotations/rotation.service";
import { issueTicket } from "@/modules/tickets/ticket.service";
import { FREQUENCY_UNIT } from "@/lib/constants/labels";
import { formatFCFA } from "@/lib/utils/money";
import { assertClientAccount, displayName, isoNow, requireAccess, type Ctx } from "@/server/context";
import { read, tx, type DbState } from "@/server/db/store";
import { AppError, conflict, invalidState, notFound } from "@/server/errors";
import { newId, newToken, sha256 } from "@/server/ids";
import type { Invitation, InvitationStatus } from "@/types/domain";

export const INVITATION_TTL_DAYS = 7;

function isExpired(inv: Invitation, now: Date) {
  return inv.status === "PENDING" && new Date(inv.expiresAt) <= now;
}

function effectiveStatus(inv: Invitation, now: Date): InvitationStatus {
  return isExpired(inv, now) ? "EXPIRED" : inv.status;
}

function findUserByContact(s: Readonly<DbState>, email: string | null, phone: string | null) {
  if (email) return s.users.find((u) => u.email === email) ?? null;
  if (phone) {
    const p = s.userProfiles.find((x) => x.phone === phone);
    return p ? (s.users.find((u) => u.id === p.userId) ?? null) : null;
  }
  return null;
}

/**
 * Crée une invitation. Le jeton brut n'est renvoyé qu'UNE fois (pour l'afficher / l'envoyer) ;
 * seule son empreinte SHA-256 est stockée.
 */
export function createInvitation(ctx: Ctx, input: { tontineId: string; email: string | null; phone: string | null }): { token: string; invitationId: string } {
  return tx((s) => {
    const { tontine } = requireAccess(s, ctx, input.tontineId, "member.invite");
    if (tontine.status === "COMPLETED" || tontine.status === "CANCELLED") throw invalidState("Impossible d'inviter dans une tontine clôturée.");

    if (s.tontineMembers.filter((m) => m.tontineId === tontine.id && m.status === "ACTIVE").length >= tontine.expectedMemberCount) {
      throw invalidState("Toutes les places prévues sont occupées. Augmentez le nombre de membres prévu (en brouillon) pour inviter davantage.");
    }
    if (!hasFreeSlot(s, ctx, tontine)) throw invalidState("Tous les tours du cycle sont attribués : aucune place n'est disponible pour un nouveau membre.");
    assertMemberCapacity(s, tontine);
    const existingUser = findUserByContact(s, input.email, input.phone);
    if (existingUser && existingUser.platformRole !== "USER") throw conflict("Cette adresse appartient à l'équipe KOTI : invitez une autre personne.");
    if (existingUser && s.tontineMembers.some((m) => m.tontineId === tontine.id && m.userId === existingUser.id && m.status === "ACTIVE")) {
      throw conflict("Cette personne est déjà membre de la tontine.");
    }
    const duplicate = s.invitations.some(
      (i) => i.tontineId === tontine.id && effectiveStatus(i, ctx.now) === "PENDING" && ((input.email && i.invitedEmail === input.email) || (input.phone && i.invitedPhone === input.phone)),
    );
    if (duplicate) throw conflict("Une invitation est déjà en attente pour ce contact.");

    const token = newToken();
    const id = newId();
    s.invitations.push({
      id,
      tontineId: tontine.id,
      invitedEmail: input.email,
      invitedPhone: input.phone,
      invitedUserId: existingUser?.id ?? null,
      tokenHash: sha256(token),
      status: "PENDING",
      invitedBy: ctx.userId,
      expiresAt: new Date(ctx.now.getTime() + INVITATION_TTL_DAYS * 86_400_000).toISOString(),
      respondedAt: null,
      createdAt: isoNow(ctx),
    });
    if (existingUser) {
      notify(s, ctx, {
        userId: existingUser.id,
        tontineId: null,
        type: "INVITATION_RECEIVED",
        title: `Invitation à rejoindre « ${tontine.name} »`,
        message: `${displayName(s, ctx.userId)} vous invite : ${formatFCFA(tontine.contributionAmount)} / ${FREQUENCY_UNIT[tontine.frequency]}.`,
        resourceType: "invitation",
        resourceId: id,
      });
    }
    audit(s, ctx, { tontineId: tontine.id, action: "invitation.create", entityType: "invitation", entityId: id, newValues: { email: input.email, phone: input.phone } });
    // Phase backend : envoi de l'e-mail / SMS contenant le lien.
    return { token, invitationId: id };
  });
}

export function cancelInvitation(ctx: Ctx, input: { tontineId: string; invitationId: string }) {
  tx((s) => {
    const { tontine } = requireAccess(s, ctx, input.tontineId, "member.invite");
    const inv = s.invitations.find((i) => i.id === input.invitationId && i.tontineId === tontine.id);
    if (!inv) throw notFound("Invitation introuvable.");
    if (effectiveStatus(inv, ctx.now) !== "PENDING") throw invalidState("Cette invitation n'est plus en attente.");
    inv.status = "CANCELLED";
    inv.respondedAt = isoNow(ctx);
    audit(s, ctx, { tontineId: tontine.id, action: "invitation.cancel", entityType: "invitation", entityId: inv.id });
  });
}

export function listTontineInvitations(ctx: Ctx, tontineId: string) {
  return read((s) => {
    requireAccess(s, ctx, tontineId, "member.invite");
    return s.invitations
      .filter((i) => i.tontineId === tontineId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((i) => ({ id: i.id, contact: i.invitedEmail ?? i.invitedPhone ?? "", channel: i.invitedEmail ? ("EMAIL" as const) : ("PHONE" as const), status: effectiveStatus(i, ctx.now), expiresAt: i.expiresAt, createdAt: i.createdAt, invitedByName: displayName(s, i.invitedBy) }));
  });
}

/**
 * Le contact invité correspond-il à l'utilisateur ?
 * - si l'invitation visait un compte existant, seul CE compte peut répondre ;
 * - un numéro de téléphone n'est pas vérifié : une invitation par téléphone sans compte cible
 *   n'est utilisable qu'avec le jeton reçu par SMS (`viaToken`), jamais depuis la liste des alertes.
 */
function contactMatches(s: Readonly<DbState>, inv: Invitation, userId: string, viaToken = false) {
  if (inv.invitedUserId && inv.invitedUserId !== userId) return false;
  if (inv.invitedPhone && !inv.invitedUserId && !viaToken) return false;
  const user = s.users.find((u) => u.id === userId);
  const profile = s.userProfiles.find((p) => p.userId === userId);
  if (inv.invitedEmail) return user?.email === inv.invitedEmail;
  if (inv.invitedPhone) return profile?.phone === inv.invitedPhone;
  return false;
}

/** Invitations en attente adressées à l'utilisateur connecté (page Alertes). */
export function listMyInvitations(ctx: Ctx) {
  return read((s) =>
    s.invitations
      .filter((i) => effectiveStatus(i, ctx.now) === "PENDING" && contactMatches(s, i, ctx.userId))
      .map((i) => {
        const t = s.tontines.find((x) => x.id === i.tontineId)!;
        return {
          id: i.id,
          tontineName: t.name,
          contributionAmount: t.contributionAmount,
          frequency: t.frequency,
          memberCount: s.tontineMembers.filter((m) => m.tontineId === t.id && m.status === "ACTIVE").length,
          invitedByName: displayName(s, i.invitedBy),
          expiresAt: i.expiresAt,
          createdAt: i.createdAt,
        };
      }),
  );
}

/** Aperçu public d'une invitation via son jeton (page /invite/[token]). N'expose que le strict nécessaire. */
export function previewInvitation(token: string, now = new Date()) {
  return read((s) => {
    const inv = s.invitations.find((i) => i.tokenHash === sha256(token));
    if (!inv) return null;
    const t = s.tontines.find((x) => x.id === inv.tontineId)!;
    return {
      status: effectiveStatus(inv, now),
      tontineName: t.name,
      contributionAmount: t.contributionAmount,
      frequency: t.frequency,
      invitedByName: displayName(s, inv.invitedBy),
      expiresAt: inv.expiresAt,
      channel: inv.invitedEmail ? ("EMAIL" as const) : ("PHONE" as const),
    };
  });
}

type RespondRef = { token: string } | { invitationId: string };

function locate(s: DbState, ref: RespondRef) {
  return "token" in ref ? s.invitations.find((i) => i.tokenHash === sha256(ref.token)) : s.invitations.find((i) => i.id === ref.invitationId);
}

/** Acceptation (PRD §6.14) : 8 étapes, dans une seule transaction. */
export function acceptInvitation(ctx: Ctx, ref: RespondRef): string {
  return tx((s) => {
    assertClientAccount(s, ctx.userId);
    const inv = locate(s, ref);
    if (!inv) throw notFound("Invitation introuvable ou lien invalide.");
    if (!contactMatches(s, inv, ctx.userId, "token" in ref)) throw new AppError("FORBIDDEN", "Cette invitation est destinée à un autre contact. Connectez-vous avec le compte correspondant.");
    if (isExpired(inv, ctx.now)) throw invalidState("Cette invitation a expiré. Demandez-en une nouvelle à l'administrateur.");
    if (inv.status !== "PENDING") throw invalidState("Cette invitation a déjà été utilisée ou annulée.");
    const tontine = s.tontines.find((t) => t.id === inv.tontineId)!;
    if (tontine.status === "COMPLETED" || tontine.status === "CANCELLED") throw invalidState("Cette tontine est clôturée.");

    const existing = s.tontineMembers.find((m) => m.tontineId === tontine.id && m.userId === ctx.userId);
    if (existing?.status === "ACTIVE") throw conflict("Vous êtes déjà membre de cette tontine.");
    const activeCount = s.tontineMembers.filter((m) => m.tontineId === tontine.id && m.status === "ACTIVE").length;
    if (activeCount >= tontine.expectedMemberCount) throw invalidState("Cette tontine est complète : toutes les places prévues sont occupées.");
    // Tontine démarrée : le nombre de tickets est figé, un nouveau membre ne peut reprendre qu'un tour libéré.
    if (!hasFreeSlot(s, ctx, tontine)) throw invalidState("Cette tontine est complète : tous les tours du cycle sont attribués.");
    assertMemberCapacity(s, tontine);
    let memberId: string;
    if (existing) {
      // Contrainte unique (tontine, user) : une ancienne adhésion est réactivée, son historique conservé.
      existing.status = "ACTIVE";
      existing.joinedAt = isoNow(ctx);
      existing.role = "MEMBER";
      memberId = existing.id;
    } else {
      memberId = newId();
      s.tontineMembers.push({ id: memberId, tontineId: tontine.id, userId: ctx.userId, role: "MEMBER", status: "ACTIVE", joinedAt: isoNow(ctx), createdAt: isoNow(ctx) });
    }
    inv.status = "ACCEPTED";
    inv.invitedUserId = ctx.userId;
    inv.respondedAt = isoNow(ctx);
    // Ticket initial de l'adhésion (un seul : les tickets supplémentaires relèvent de l'administrateur, avant démarrage).
    issueTicket(s, ctx, tontine, memberId);
    ensureObligations(s, ctx, tontine);
    notify(s, ctx, {
      userId: inv.invitedBy,
      tontineId: tontine.id,
      type: "INVITATION_ACCEPTED",
      title: "Invitation acceptée",
      message: `${displayName(s, ctx.userId)} a rejoint « ${tontine.name} ».`,
      resourceType: "member",
      resourceId: memberId,
    });
    audit(s, ctx, { tontineId: tontine.id, action: "invitation.accept", entityType: "invitation", entityId: inv.id, newValues: { memberId } });
    return tontine.id;
  });
}

export function refuseInvitation(ctx: Ctx, ref: RespondRef) {
  tx((s) => {
    const inv = locate(s, ref);
    if (!inv) throw notFound("Invitation introuvable ou lien invalide.");
    if (!contactMatches(s, inv, ctx.userId, "token" in ref)) throw new AppError("FORBIDDEN", "Cette invitation est destinée à un autre contact.");
    if (effectiveStatus(inv, ctx.now) !== "PENDING") throw invalidState("Cette invitation n'est plus en attente.");
    const tontine = s.tontines.find((t) => t.id === inv.tontineId)!;
    inv.status = "REFUSED";
    inv.invitedUserId = ctx.userId;
    inv.respondedAt = isoNow(ctx);
    notify(s, ctx, { userId: inv.invitedBy, tontineId: tontine.id, type: "INVITATION_REFUSED", title: "Invitation refusée", message: `${displayName(s, ctx.userId)} a décliné l'invitation à « ${tontine.name} ».`, resourceType: "invitation", resourceId: inv.id });
    audit(s, ctx, { tontineId: tontine.id, action: "invitation.refuse", entityType: "invitation", entityId: inv.id });
  });
}
