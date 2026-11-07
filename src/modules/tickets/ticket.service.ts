import "server-only";
import { audit } from "@/modules/audit/audit.service";
import { appendRotationSlot, compactRotation } from "@/modules/rotations/rotation.service";
import { isoNow, requireAccess, type Ctx } from "@/server/context";
import { read, tx, type DbState } from "@/server/db/store";
import { AppError, conflict, invalidState, notFound } from "@/server/errors";
import { newId } from "@/server/ids";
import type { Tontine, TontineTicket } from "@/types/domain";
import { formatTicketNumber, memberActiveTickets } from "./ticket.rules";

/**
 * Émet un ticket pour une adhésion (numérotation serveur, jamais réutilisée) et lui réserve un tour.
 * Usage INTERNE : l'appelant a déjà contrôlé les droits, le statut de la tontine et le plafond
 * (création de tontine, acceptation d'invitation, ajout par l'administrateur).
 */
export function issueTicket(s: DbState, ctx: Ctx, tontine: Tontine, memberId: string): TontineTicket {
  const ticket: TontineTicket = {
    id: newId(),
    tontineId: tontine.id,
    memberId,
    ticketNumber: tontine.nextTicketNumber,
    status: "ACTIVE",
    createdBy: ctx.userId,
    createdAt: isoNow(ctx),
    deletedAt: null,
  };
  tontine.nextTicketNumber += 1;
  s.tontineTickets.push(ticket);
  appendRotationSlot(s, ctx, tontine, ticket);
  return ticket;
}

/**
 * Attribution d'un ticket supplémentaire (administrateur uniquement, tontine en brouillon).
 * Contrôles serveur : droits, statut DRAFT, tickets multiples autorisés, membre actif, plafond.
 * Tout se passe dans une transaction ; en PostgreSQL le plafond sera protégé par un verrou
 * (SELECT … FOR UPDATE sur l'adhésion) pour résister aux créations concurrentes.
 */
export function createTicket(ctx: Ctx, input: { tontineId: string; memberId: string }): string {
  return tx((s) => {
    const { tontine } = requireAccess(s, ctx, input.tontineId, "ticket.create");
    if (tontine.status !== "DRAFT") throw invalidState("Les tickets ne peuvent être créés qu'avant le démarrage de la tontine.");
    if (!tontine.multipleTicketsAllowed) throw invalidState("Les tickets multiples ne sont pas autorisés dans cette tontine.");
    const member = s.tontineMembers.find((m) => m.id === input.memberId && m.tontineId === tontine.id && m.status === "ACTIVE");
    if (!member) throw notFound("Membre introuvable.");
    const before = memberActiveTickets(s, member.id).length;
    if (before >= tontine.maxTicketsPerMember) throw conflict(`Ce membre a déjà atteint le maximum de ${tontine.maxTicketsPerMember} ticket${tontine.maxTicketsPerMember > 1 ? "s" : ""}.`);
    const ticket = issueTicket(s, ctx, tontine, member.id);
    audit(s, ctx, { tontineId: tontine.id, action: "ticket.create", entityType: "ticket", entityId: ticket.id, newValues: { memberId: member.id, ticketNumber: formatTicketNumber(ticket.ticketNumber), ticketsAfter: before + 1 } });
    return ticket.id;
  });
}

/**
 * Suppression logique d'un ticket avant démarrage. Le numéro n'est jamais réattribué,
 * le ticket reste en base (deletedAt) et l'opération est journalisée. Un membre garde toujours son ticket initial.
 */
export function deleteTicket(ctx: Ctx, input: { tontineId: string; ticketId: string }) {
  tx((s) => {
    const { tontine } = requireAccess(s, ctx, input.tontineId, "ticket.delete");
    if (tontine.status !== "DRAFT") throw invalidState("Aucun ticket ne peut être supprimé après le démarrage de la tontine.");
    const ticket = s.tontineTickets.find((t) => t.id === input.ticketId && t.tontineId === tontine.id && t.status === "ACTIVE" && !t.deletedAt);
    if (!ticket) throw notFound("Ticket introuvable.");
    if (memberActiveTickets(s, ticket.memberId).length <= 1) throw new AppError("INVALID_STATE", "Un membre doit conserver au moins un ticket. Retirez le membre pour supprimer sa participation.");
    ticket.status = "INACTIVE";
    ticket.deletedAt = isoNow(ctx);
    s.rotationSlots = s.rotationSlots.filter((x) => x.ticketId !== ticket.id);
    compactRotation(s, ctx, tontine);
    audit(s, ctx, { tontineId: tontine.id, action: "ticket.delete", entityType: "ticket", entityId: ticket.id, oldValues: { ticketNumber: formatTicketNumber(ticket.ticketNumber), memberId: ticket.memberId } });
  });
}

export interface TicketView {
  id: string;
  number: number;
  label: string;
  status: TontineTicket["status"];
}

export function listMemberTickets(ctx: Ctx, tontineId: string, memberId: string): TicketView[] {
  return read((s) => {
    const { member } = requireAccess(s, ctx, tontineId, "ticket.view");
    if (member.role !== "ADMIN" && member.id !== memberId) throw notFound("Membre introuvable.");
    return memberActiveTickets(s, memberId).map((t) => ({ id: t.id, number: t.ticketNumber, label: formatTicketNumber(t.ticketNumber), status: t.status }));
  });
}
