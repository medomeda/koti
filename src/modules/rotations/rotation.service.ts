import "server-only";
import { audit } from "@/modules/audit/audit.service";
import { dueDateForPeriod } from "@/modules/contributions/frequency";
import { activeTickets, cycleLength, cycleOf, formatTicketNumber } from "@/modules/tickets/ticket.rules";
import { displayName, isoNow, requireAccess, today, type Ctx } from "@/server/context";
import { read, tx, type DbState } from "@/server/db/store";
import { AppError, invalidState } from "@/server/errors";
import { newId } from "@/server/ids";
import type { ISODate, RotationSlot, RotationStatus, Tontine, TontineTicket } from "@/types/domain";

/** Statut affiché : CANCELLED est stocké, les autres se déduisent du calendrier. */
export function effectiveRotationStatus(slot: RotationSlot, tontine: Tontine, currentSlotId: string | null, todayDate: ISODate): RotationStatus {
  if (slot.status === "CANCELLED") return "CANCELLED";
  if (tontine.status === "DRAFT" || !slot.scheduledDate) return "UPCOMING";
  if (slot.id === currentSlotId) return "CURRENT";
  return slot.scheduledDate < todayDate ? "COMPLETED" : "UPCOMING";
}

/** Bénéficiaire en cours : premier tour actif dont la date est aujourd'hui ou à venir. */
function currentSlotId(slots: RotationSlot[], tontine: Tontine, todayDate: ISODate): string | null {
  if (tontine.status !== "ACTIVE" && tontine.status !== "PAUSED") return null;
  return slots.filter((x) => x.status !== "CANCELLED" && x.scheduledDate && x.scheduledDate >= todayDate).sort((a, b) => a.position - b.position)[0]?.id ?? null;
}

function sortedSlots(s: Readonly<DbState>, tontineId: string) {
  return s.rotationSlots.filter((x) => x.tontineId === tontineId).sort((a, b) => a.position - b.position);
}

/** Recalcule les dates prévues à partir de la position (position n ↔ échéance n). */
export function recomputeRotationDates(s: DbState, ctx: Ctx, tontine: Tontine) {
  for (const slot of sortedSlots(s, tontine.id)) {
    const date = dueDateForPeriod(tontine.frequency, tontine.startDate, slot.position, tontine.frequencyConfig);
    if (slot.scheduledDate !== date) {
      slot.scheduledDate = date;
      slot.updatedAt = isoNow(ctx);
    }
  }
}

/** Une place du cycle est-elle libre ? (tontine démarrée : seul un tour annulé et à venir peut être repris.) */
export function hasFreeSlot(s: Readonly<DbState>, ctx: Ctx, tontine: Tontine): boolean {
  if (tontine.status === "DRAFT") return true;
  const slots = s.rotationSlots.filter((x) => x.tontineId === tontine.id);
  const todayDate = today(ctx);
  for (let p = 1; p <= cycleLength(s, tontine); p++) {
    const occupant = slots.find((x) => x.position === p);
    const date = dueDateForPeriod(tontine.frequency, tontine.startDate, p, tontine.frequencyConfig);
    if (!occupant || (occupant.status === "CANCELLED" && date >= todayDate)) return true;
  }
  return false;
}

/** Réserve un tour à un ticket (création de tontine, acceptation d'invitation, ajout d'un ticket). */
export function appendRotationSlot(s: DbState, ctx: Ctx, tontine: Tontine, ticket: TontineTicket) {
  if (s.rotationSlots.some((x) => x.ticketId === ticket.id && x.status !== "CANCELLED")) return;
  // Première position du cycle sans bénéficiaire actif ; un tour annulé qui l'occupait est repoussé en fin de liste.
  const slots = s.rotationSlots.filter((x) => x.tontineId === tontine.id);
  const maxPos = Math.max(0, ...slots.map((x) => x.position));
  const todayDate = today(ctx);
  let position = maxPos + 1;
  for (let p = 1; p <= cycleLength(s, tontine); p++) {
    const occupant = slots.find((x) => x.position === p);
    const date = dueDateForPeriod(tontine.frequency, tontine.startDate, p, tontine.frequencyConfig);
    if (!occupant || (occupant.status === "CANCELLED" && (tontine.status === "DRAFT" || date >= todayDate))) {
      if (occupant) occupant.position = maxPos + 1;
      position = p;
      break;
    }
  }
  s.rotationSlots.push({
    id: newId(),
    tontineId: tontine.id,
    cycleId: cycleOf(s, tontine.id)?.id ?? null,
    memberId: ticket.memberId,
    ticketId: ticket.id,
    position,
    scheduledDate: dueDateForPeriod(tontine.frequency, tontine.startDate, position, tontine.frequencyConfig),
    status: "UPCOMING",
    createdAt: isoNow(ctx),
    updatedAt: isoNow(ctx),
  });
}

/** Brouillon : renumérote les tours actifs 1..n (les tours annulés passent après) et recalcule les dates. */
export function compactRotation(s: DbState, ctx: Ctx, tontine: Tontine) {
  const all = sortedSlots(s, tontine.id);
  const active = all.filter((x) => x.status !== "CANCELLED");
  const cancelled = all.filter((x) => x.status === "CANCELLED");
  [...active, ...cancelled].forEach((x, i) => {
    if (x.position !== i + 1) {
      x.position = i + 1;
      x.updatedAt = isoNow(ctx);
    }
  });
  recomputeRotationDates(s, ctx, tontine);
}

/**
 * Démarrage : fige la participation et crée le cycle initial. Appelée DANS la transaction d'activation ;
 * toute anomalie lève une erreur et annule l'ensemble du démarrage.
 * Contrôles : chaque membre actif a au moins un ticket, chaque ticket actif a exactement un tour,
 * aucun tour ne subsiste pour un ticket inactif, positions uniques.
 */
export function startCycle(s: DbState, ctx: Ctx, tontine: Tontine) {
  if (cycleOf(s, tontine.id)) throw new AppError("CONFLICT", "Un cycle de rotation existe déjà pour cette tontine.");
  const tickets = activeTickets(s, tontine.id);
  if (tickets.length === 0) throw invalidState("Impossible de démarrer une tontine sans ticket.");
  const members = s.tontineMembers.filter((m) => m.tontineId === tontine.id && m.status === "ACTIVE");
  for (const m of members) {
    if (!tickets.some((t) => t.memberId === m.id)) throw invalidState(`${displayName(s, m.userId)} n'a aucun ticket : la tontine ne peut pas démarrer.`);
  }
  const live = s.rotationSlots.filter((x) => x.tontineId === tontine.id && x.status !== "CANCELLED");
  for (const t of tickets) {
    const n = live.filter((x) => x.ticketId === t.id).length;
    if (n !== 1) throw new AppError("CONFLICT", `Le ticket ${formatTicketNumber(t.ticketNumber)} doit avoir exactement un tour de main (trouvé : ${n}).`);
  }
  if (live.some((x) => !tickets.some((t) => t.id === x.ticketId))) throw new AppError("CONFLICT", "Un tour de main est rattaché à un ticket inactif.");

  compactRotation(s, ctx, tontine);
  const cycle = { id: newId(), tontineId: tontine.id, status: "ACTIVE" as const, size: tickets.length, createdAt: isoNow(ctx) };
  s.rotationCycles.push(cycle);
  for (const slot of s.rotationSlots.filter((x) => x.tontineId === tontine.id)) slot.cycleId = cycle.id;

  const positions = s.rotationSlots.filter((x) => x.tontineId === tontine.id && x.status !== "CANCELLED").map((x) => x.position);
  if (new Set(positions).size !== positions.length || positions.some((p) => p < 1 || p > cycle.size)) throw new AppError("CONFLICT", "Positions de rotation incohérentes.");
  return cycle;
}

export interface RotationView {
  slotId: string;
  memberId: string;
  ticketId: string;
  ticketNumber: number;
  ticketLabel: string;
  userId: string;
  name: string;
  avatarUrl: string | null;
  position: number;
  scheduledDate: ISODate | null;
  status: RotationStatus;
  isMe: boolean;
  /** Montant indicatif de la cagnotte : cotisation × tickets actifs. */
  potAmount: number;
}

export function listRotation(ctx: Ctx, tontineId: string) {
  return read((s) => {
    const { tontine, member } = requireAccess(s, ctx, tontineId, "rotation.view");
    const t = today(ctx);
    const slots = sortedSlots(s, tontineId);
    const current = currentSlotId(slots, tontine, t);
    const activeCount = activeTickets(s, tontineId).length;
    const rows: RotationView[] = slots.map((slot) => {
      const m = s.tontineMembers.find((x) => x.id === slot.memberId)!;
      const ticket = s.tontineTickets.find((x) => x.id === slot.ticketId)!;
      const profile = s.userProfiles.find((p) => p.userId === m.userId);
      return {
        slotId: slot.id,
        memberId: slot.memberId,
        ticketId: slot.ticketId,
        ticketNumber: ticket.ticketNumber,
        ticketLabel: formatTicketNumber(ticket.ticketNumber),
        userId: m.userId,
        name: profile?.fullName ?? "Membre",
        avatarUrl: profile?.avatarUrl ?? null,
        position: slot.position,
        scheduledDate: slot.scheduledDate,
        status: effectiveRotationStatus(slot, tontine, current, t),
        isMe: slot.memberId === member.id,
        potAmount: tontine.contributionAmount * activeCount,
      };
    });
    const mySlots = rows.filter((r) => r.isMe && r.status !== "CANCELLED");
    return { tontine, role: member.role, rows, mySlot: mySlots[0] ?? null, mySlots };
  });
}

/**
 * Réorganise l'ordre de passage.
 * - Brouillon : réorganisation libre.
 * - Active / suspendue : seuls les tours à venir peuvent être permutés entre eux, avec motif
 *   obligatoire ; les tours passés ou en cours sont figés. Chaque changement est historisé.
 * - Clôturée / annulée : lecture seule.
 */
export function reorderRotation(ctx: Ctx, input: { tontineId: string; ticketIds: string[]; reason?: string }) {
  tx((s) => {
    const { tontine } = requireAccess(s, ctx, input.tontineId, "rotation.update");
    if (tontine.status === "COMPLETED" || tontine.status === "CANCELLED") throw invalidState("Cette tontine est clôturée : le calendrier n'est plus modifiable.");

    const t = today(ctx);
    const slots = sortedSlots(s, tontine.id).filter((x) => x.status !== "CANCELLED");
    const current = currentSlotId(slots, tontine, t);
    const started = tontine.status !== "DRAFT";
    const movable = started ? slots.filter((x) => effectiveRotationStatus(x, tontine, current, t) === "UPCOMING") : slots;

    const expected = new Set(movable.map((x) => x.ticketId));
    if (input.ticketIds.length !== expected.size || new Set(input.ticketIds).size !== input.ticketIds.length || !input.ticketIds.every((id) => expected.has(id))) {
      throw new AppError("CONFLICT", "Le calendrier a été modifié entre-temps. Rechargez la page et recommencez.");
    }
    if (started && (!input.reason || input.reason.trim().length < 3)) {
      throw new AppError("VALIDATION", "Un motif est obligatoire pour modifier un calendrier démarré.", { reason: "Motif requis (3 caractères minimum)." });
    }

    const describe = (x: RotationSlot) => ({
      ticketId: x.ticketId,
      ticket: formatTicketNumber(s.tontineTickets.find((tk) => tk.id === x.ticketId)!.ticketNumber),
      position: x.position,
      name: displayName(s, s.tontineMembers.find((m) => m.id === x.memberId)!.userId),
    });
    const before = slots.map(describe);
    // Les positions disponibles sont celles des tours déplaçables, dans l'ordre.
    const positions = movable.map((x) => x.position).sort((a, b) => a - b);
    const bySlotTicket = new Map(movable.map((x) => [x.ticketId, x]));
    // Libère temporairement les positions pour respecter l'unicité (tontine, position).
    movable.forEach((x, i) => (x.position = -1 - i));
    input.ticketIds.forEach((ticketId, i) => {
      const slot = bySlotTicket.get(ticketId)!;
      slot.position = positions[i]!;
      slot.updatedAt = isoNow(ctx);
    });
    // Les tours annulés sont repoussés après les tours actifs.
    const maxActive = Math.max(0, ...slots.map((x) => x.position));
    s.rotationSlots
      .filter((x) => x.tontineId === tontine.id && x.status === "CANCELLED")
      .forEach((x, i) => (x.position = maxActive + 1 + i));

    const all = s.rotationSlots.filter((x) => x.tontineId === tontine.id).map((x) => x.position);
    if (new Set(all).size !== all.length) throw new AppError("CONFLICT", "Positions en double détectées.");
    recomputeRotationDates(s, ctx, tontine);

    const after = sortedSlots(s, tontine.id)
      .filter((x) => x.status !== "CANCELLED")
      .map(describe);
    audit(s, ctx, { tontineId: tontine.id, action: "rotation.reorder", entityType: "rotation", entityId: null, oldValues: { order: before }, newValues: { order: after }, reason: input.reason?.trim() || null });
  });
}
