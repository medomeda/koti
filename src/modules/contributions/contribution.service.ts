import "server-only";
import { isoNow, today, type Ctx } from "@/server/context";
import type { DbState } from "@/server/db/store";
import { newId } from "@/server/ids";
import { activeTickets, cycleLength } from "@/modules/tickets/ticket.rules";
import type { ContributionObligation, ISODate, ObligationStatus, Tontine, TontineMember } from "@/types/domain";
import { dueDateForPeriod, periodsDueBy } from "./frequency";

/**
 * LATE n'est pas stocké : il se déduit de la date d'échéance quand le paiement n'est
 * ni confirmé ni en cours de validation (PRD §6.20).
 */
export function effectiveObligationStatus(o: Pick<ContributionObligation, "status" | "dueDate">, todayDate: ISODate): ObligationStatus {
  if (o.status === "PAID" || o.status === "DECLARED") return o.status;
  if (o.dueDate < todayDate) return "LATE";
  return o.status;
}

export function isOverdue(o: Pick<ContributionObligation, "status" | "dueDate">, todayDate: ISODate): boolean {
  return o.status !== "PAID" && o.dueDate < todayDate;
}

/** Échéance tombée pendant une suspension : la période est clôturée sans obligation. */
export function isInPause(tontine: Pick<Tontine, "pauses">, dueDate: ISODate): boolean {
  return (tontine.pauses ?? []).some((p) => dueDate >= p.from && (p.to === null || dueDate < p.to));
}

/**
 * Un membre doit une période si :
 * - il a rejoint avant (ou le jour du) démarrage → toutes les périodes ;
 * - sinon → les périodes dont l'échéance est postérieure ou égale à sa date d'adhésion.
 */
export function memberOwesPeriod(member: TontineMember, tontine: Tontine, dueDate: ISODate): boolean {
  const joined = member.joinedAt.slice(0, 10);
  return joined <= tontine.startDate || dueDate >= joined;
}

/**
 * Génère les périodes échues + la prochaine, et UNE obligation par ticket actif et par période.
 * Idempotente : unicité (tontine, n° de période) et (période, ticket) vérifiées avant insertion.
 * Ne fait rien si la tontine n'est pas ACTIVE (suspension = plus de nouvelles échéances).
 * Ne modifie jamais une obligation existante.
 */
export function ensureObligations(s: DbState, ctx: Ctx, tontine: Tontine): number {
  if (tontine.status !== "ACTIVE") return 0;
  const length = cycleLength(s, tontine);
  const due = periodsDueBy(tontine.frequency, tontine.startDate, today(ctx), length, tontine.frequencyConfig);
  const target = Math.min(length, due + 1);
  const members = s.tontineMembers.filter((m) => m.tontineId === tontine.id && m.status === "ACTIVE");
  const tickets = activeTickets(s, tontine.id);
  const existing = new Set(s.contributionObligations.filter((o) => o.tontineId === tontine.id).map((o) => `${o.periodId}:${o.ticketId}`));
  let created = 0;

  for (let n = 1; n <= target; n++) {
    let period = s.contributionPeriods.find((p) => p.tontineId === tontine.id && p.periodNumber === n);
    if (!period) {
      const dueDate = dueDateForPeriod(tontine.frequency, tontine.startDate, n, tontine.frequencyConfig);
      period = { id: newId(), tontineId: tontine.id, periodNumber: n, dueDate, status: isInPause(tontine, dueDate) ? "CLOSED" : "OPEN", createdAt: isoNow(ctx) };
      s.contributionPeriods.push(period);
    }
    if (period.status === "CLOSED") continue;
    for (const ticket of tickets) {
      const m = members.find((x) => x.id === ticket.memberId);
      if (!m || !memberOwesPeriod(m, tontine, period.dueDate)) continue;
      const key = `${period.id}:${ticket.id}`;
      if (existing.has(key)) continue;
      existing.add(key);
      s.contributionObligations.push({
        id: newId(),
        tontineId: tontine.id,
        periodId: period.id,
        memberId: m.id,
        ticketId: ticket.id,
        expectedAmount: tontine.contributionAmount,
        dueDate: period.dueDate,
        status: "PENDING",
        createdAt: isoNow(ctx),
        updatedAt: isoNow(ctx),
      });
      created++;
    }
  }
  return created;
}

/** Prochaine date d'échéance théorique (null si cycle terminé ou tontine non active). */
export function nextDueDate(tontine: Tontine, todayDate: ISODate, length: number = tontine.expectedMemberCount): ISODate | null {
  if (tontine.status === "DRAFT") return tontine.startDate >= todayDate ? tontine.startDate : null;
  if (tontine.status !== "ACTIVE") return null;
  for (let n = 1; n <= length; n++) {
    const d = dueDateForPeriod(tontine.frequency, tontine.startDate, n, tontine.frequencyConfig);
    if (d >= todayDate && !isInPause(tontine, d)) return d;
  }
  return null;
}
