import type { DbState } from "@/server/db/store";
import type { RotationCycle, Tontine, TontineTicket } from "@/types/domain";

/** Numéro affiché d'un ticket : « TKT-001 ». */
export const formatTicketNumber = (n: number) => `TKT-${String(n).padStart(3, "0")}`;

/** Tickets participant réellement à la tontine : actifs et non supprimés. */
export const isLiveTicket = (t: Pick<TontineTicket, "status" | "deletedAt">) => t.status === "ACTIVE" && !t.deletedAt;

export function activeTickets(s: Readonly<DbState>, tontineId: string): TontineTicket[] {
  return s.tontineTickets.filter((t) => t.tontineId === tontineId && isLiveTicket(t));
}

export function memberActiveTickets(s: Readonly<DbState>, memberId: string): TontineTicket[] {
  return s.tontineTickets.filter((t) => t.memberId === memberId && isLiveTicket(t)).sort((a, b) => a.ticketNumber - b.ticketNumber);
}

export function cycleOf(s: Readonly<DbState>, tontineId: string): RotationCycle | null {
  return s.rotationCycles.find((c) => c.tontineId === tontineId) ?? null;
}

/**
 * Nombre de tours du cycle (= nombre de périodes de cotisation).
 * - tontine démarrée : taille figée du cycle ;
 * - brouillon : estimation = max(membres prévus, tickets actuels).
 */
export function cycleLength(s: Readonly<DbState>, tontine: Pick<Tontine, "id" | "expectedMemberCount">): number {
  const cycle = cycleOf(s, tontine.id);
  if (cycle) return cycle.size;
  return Math.max(tontine.expectedMemberCount, activeTickets(s, tontine.id).length);
}
