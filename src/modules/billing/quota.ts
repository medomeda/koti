import { PLANS, type Plan } from "@/lib/marketing/plans";
import type { DbState } from "@/server/db/store";
import { AppError } from "@/server/errors";
import type { PlanId, Subscription, Tontine, TontineStatus } from "@/types/domain";
import { activeTickets } from "@/modules/tickets/ticket.rules";

/**
 * Quotas des offres, appliqués CÔTÉ SERVEUR. Le propriétaire d'une tontine (son créateur) en porte l'offre :
 * les limites de membres et de tickets s'apprécient avec l'offre du créateur, pas celle de l'invité.
 * Les tontines déjà créées au-delà d'un quota ne sont jamais bloquées rétroactivement : seules les
 * nouvelles créations et les extensions sont refusées.
 */
export const COUNTED_STATUSES: TontineStatus[] = ["DRAFT", "ACTIVE", "PAUSED"];

export const planById = (id: PlanId): Plan => PLANS.find((p) => p.id === id) ?? PLANS[0]!;

export function subscriptionOf(s: Readonly<DbState>, userId: string): Subscription | null {
  return s.subscriptions.find((x) => x.userId === userId) ?? null;
}

export function planOf(s: Readonly<DbState>, userId: string): Plan {
  const sub = subscriptionOf(s, userId);
  return planById(sub?.planId ?? "FREE");
}

/** Tontines non clôturées créées par l'utilisateur (celles qui comptent dans le quota). */
export function ownedLiveTontines(s: Readonly<DbState>, userId: string): Tontine[] {
  return s.tontines.filter((t) => t.creatorId === userId && COUNTED_STATUSES.includes(t.status));
}

export function activeMemberCount(s: Readonly<DbState>, tontineId: string): number {
  return s.tontineMembers.filter((m) => m.tontineId === tontineId && m.status === "ACTIVE").length;
}

function nextPlan(plan: Plan): Plan | null {
  const i = PLANS.findIndex((p) => p.id === plan.id);
  return PLANS[i + 1] ?? null;
}

/** Phrase d'invitation à changer d'offre, ajoutée à chaque refus de quota. */
function upgradeHint(plan: Plan): string {
  const next = nextPlan(plan);
  return next ? ` Passez à l'offre « ${next.name} » depuis « Mon abonnement ».` : " Contactez-nous pour une offre sur mesure.";
}

const plural = (n: number, one: string, many: string) => `${n} ${n > 1 ? many : one}`;

export function assertCanCreateTontine(s: Readonly<DbState>, userId: string) {
  const plan = planOf(s, userId);
  const used = ownedLiveTontines(s, userId).length;
  if (used >= plan.limits.tontines) {
    throw new AppError("INVALID_STATE", `Votre offre « ${plan.name} » permet ${plural(plan.limits.tontines, "tontine", "tontines")} en cours : vous en avez déjà ${used}.${upgradeHint(plan)}`);
  }
}

/** Paramètres d'une tontine (création ou modification en brouillon) au regard de l'offre de son créateur. */
export function assertSettingsFit(
  s: Readonly<DbState>,
  ownerId: string,
  next: { expectedMemberCount: number; multipleTicketsAllowed: boolean },
  previous?: { expectedMemberCount: number; multipleTicketsAllowed: boolean },
) {
  const plan = planOf(s, ownerId);
  if (next.expectedMemberCount > plan.limits.membersPerTontine && next.expectedMemberCount > (previous?.expectedMemberCount ?? 0)) {
    throw new AppError("VALIDATION", `Votre offre « ${plan.name} » est limitée à ${plan.limits.membersPerTontine} membres par tontine.${upgradeHint(plan)}`, {
      expectedMemberCount: `Maximum : ${plan.limits.membersPerTontine} avec votre offre.`,
    });
  }
  if (next.multipleTicketsAllowed && !plan.limits.multipleTickets && !previous?.multipleTicketsAllowed) {
    throw new AppError("VALIDATION", `Les tickets multiples ne sont pas inclus dans l'offre « ${plan.name} ».${upgradeHint(plan)}`, {
      multipleTicketsAllowed: "Non inclus dans votre offre.",
    });
  }
}

/** Ajout d'un membre (invitation ou acceptation) : plafond de l'offre du créateur de la tontine. */
export function assertMemberCapacity(s: Readonly<DbState>, tontine: Tontine) {
  const plan = planOf(s, tontine.creatorId);
  if (activeMemberCount(s, tontine.id) >= plan.limits.membersPerTontine) {
    throw new AppError("INVALID_STATE", `Cette tontine a atteint la limite de ${plan.limits.membersPerTontine} membres de l'offre « ${plan.name} » de son organisateur.`);
  }
}

/** Création d'un ticket : plafond de l'offre du créateur de la tontine. */
export function assertTicketCapacity(s: Readonly<DbState>, tontine: Tontine) {
  const plan = planOf(s, tontine.creatorId);
  if (activeTickets(s, tontine.id).length >= plan.limits.ticketsPerTontine) {
    throw new AppError("INVALID_STATE", `Cette tontine a atteint la limite de ${plan.limits.ticketsPerTontine} tickets de l'offre « ${plan.name} » de son organisateur.`);
  }
}

export interface TontineUsage {
  id: string;
  name: string;
  status: TontineStatus;
  members: number;
  tickets: number;
  multipleTickets: boolean;
}

export function usageOf(s: Readonly<DbState>, userId: string) {
  const tontines: TontineUsage[] = ownedLiveTontines(s, userId).map((t) => ({
    id: t.id,
    name: t.name,
    status: t.status,
    members: activeMemberCount(s, t.id),
    tickets: activeTickets(s, t.id).length,
    multipleTickets: t.multipleTicketsAllowed,
  }));
  return { tontines };
}

/** Éléments de l'usage qui dépassent une offre cible (vide = l'usage tient dans l'offre). */
export function overages(usage: ReturnType<typeof usageOf>, plan: Plan): string[] {
  const out: string[] = [];
  if (usage.tontines.length > plan.limits.tontines) out.push(`${plural(usage.tontines.length, "tontine en cours", "tontines en cours")} (maximum ${plan.limits.tontines})`);
  for (const t of usage.tontines) {
    if (t.members > plan.limits.membersPerTontine) out.push(`« ${t.name} » a ${t.members} membres (maximum ${plan.limits.membersPerTontine})`);
    if (t.tickets > plan.limits.ticketsPerTontine) out.push(`« ${t.name} » a ${t.tickets} tickets (maximum ${plan.limits.ticketsPerTontine})`);
    if (t.multipleTickets && !plan.limits.multipleTickets) out.push(`« ${t.name} » autorise les tickets multiples (non inclus)`);
  }
  return out;
}
