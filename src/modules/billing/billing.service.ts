import "server-only";
import type { Plan } from "@/lib/marketing/plans";
import { addDays, parseISODate, toISODate, todayISO } from "@/lib/utils/dates";
import { audit } from "@/modules/audit/audit.service";
import { isoNow, today, type Ctx } from "@/server/context";
import { read, tx, type DbState } from "@/server/db/store";
import { AppError, conflict } from "@/server/errors";
import { newId } from "@/server/ids";
import type { Invoice, ISODate, PlanId, Subscription } from "@/types/domain";
import { allPlans, overages, planById, subscriptionOf, usageOf } from "./quota";

export const TRIAL_DAYS = 14;

/** Ajoute des mois calendaires (le 31 + 1 mois = dernier jour du mois suivant). */
export function addMonths(date: ISODate, months: number): ISODate {
  const d = parseISODate(date);
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + months);
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, last));
  return toISODate(d);
}

/** Abonnement gratuit créé avec le compte. */
export function ensureSubscription(s: DbState, userId: string, now: Date): Subscription {
  const existing = subscriptionOf(s, userId);
  if (existing) return existing;
  const sub: Subscription = { id: newId(), userId, planId: "FREE", status: "ACTIVE", startedAt: now.toISOString(), trialEndsAt: null, trialUsed: false, currentPeriodStart: null, currentPeriodEnd: null, canceledAt: null };
  s.subscriptions.push(sub);
  return sub;
}

function invoiceFor(s: DbState, sub: Subscription, plan: Plan, periodStart: ISODate, now: Date): Invoice | null {
  // Idempotence : une seule facture par client et par début de période.
  if (s.invoices.some((i) => i.userId === sub.userId && i.periodStart === periodStart)) return null;
  // Rattrapage : une période échue est datée de son premier jour (8 h), jamais dans le futur.
  const due = new Date(parseISODate(periodStart).getTime() + 8 * 3600_000);
  const issued = due.getTime() <= now.getTime() ? due : now;
  const invoice: Invoice = {
    id: newId(),
    userId: sub.userId,
    subscriptionId: sub.id,
    number: `KOTI-${issued.getUTCFullYear()}-${String(s.invoices.length + 1).padStart(4, "0")}`,
    planId: plan.id,
    planName: plan.name,
    amount: plan.monthlyPrice,
    periodStart,
    periodEnd: addMonths(periodStart, 1),
    issuedAt: issued.toISOString(),
  };
  s.invoices.push(invoice);
  return invoice;
}

/**
 * Changement d'offre (SIMULÉ : aucun paiement réel).
 * - vers une offre plus petite : refusé si l'usage actuel dépasse ses limites (le message liste quoi) ;
 * - première offre payante : essai gratuit de 14 jours, sans facture ;
 * - ensuite : facturation immédiate de la période, sans prorata (simplification de la démonstration) ;
 * - retour au gratuit : effectif tout de suite, les factures déjà émises sont conservées.
 */
export function changePlan(ctx: Ctx, planId: PlanId) {
  tx((s) => applyPlanChange(s, ctx, ctx.userId, planId, "subscription.change"));
}

/**
 * Cœur du changement d'offre, utilisé par le client (changePlan) et par l'équipe KOTI (au nom d'un client).
 * `ctx.userId` est l'auteur (audit), `targetUserId` le client concerné.
 */
export function applyPlanChange(s: DbState, ctx: Ctx, targetUserId: string, planId: PlanId, auditAction: string, reason?: string) {
  const sub = subscriptionOf(s, targetUserId);
  if (!sub) throw new AppError("NOT_FOUND", "Abonnement introuvable.");
  if (sub.planId === planId) throw conflict(targetUserId === ctx.userId ? "Vous êtes déjà sur cette offre." : "Ce client est déjà sur cette offre.");
  const target = planById(s, planId);
  const bad = overages(usageOf(s, targetUserId), target);
  if (bad.length > 0) {
    const whose = targetUserId === ctx.userId ? "votre usage actuel" : "l'usage actuel du client";
    throw new AppError("INVALID_STATE", `L'offre « ${target.name} » ne couvre pas ${whose} : ${bad.join(" ; ")}. Il faut d'abord le réduire (clôturer une tontine, retirer des membres ou des tickets).`);
  }
  const before = sub.planId;
  const nowIso = isoNow(ctx);
  const day = today(ctx);
  sub.planId = planId;
  if (target.monthlyPrice === 0) {
    sub.status = "ACTIVE";
    sub.trialEndsAt = null;
    sub.currentPeriodStart = null;
    sub.currentPeriodEnd = null;
    sub.canceledAt = nowIso;
  } else if (sub.status === "TRIAL") {
    // Changement d'offre pendant l'essai : l'essai continue, la première facture suivra à son terme.
  } else if (!sub.trialUsed) {
    sub.status = "TRIAL";
    sub.trialUsed = true;
    sub.canceledAt = null;
    sub.trialEndsAt = new Date(ctx.now.getTime() + TRIAL_DAYS * 86_400_000).toISOString();
    sub.currentPeriodStart = null;
    sub.currentPeriodEnd = addDays(day, TRIAL_DAYS);
  } else {
    sub.status = "ACTIVE";
    sub.canceledAt = null;
    sub.currentPeriodStart = day;
    sub.currentPeriodEnd = addMonths(day, 1);
    const upgraded = planById(s, before).monthlyPrice < target.monthlyPrice || before === "FREE";
    // Descente entre deux offres payantes : le nouveau prix s'applique à la prochaine période.
    if (upgraded) invoiceFor(s, sub, target, day, ctx.now);
  }
  audit(s, ctx, { tontineId: null, action: auditAction, entityType: "subscription", entityId: sub.id, oldValues: { userId: targetUserId, planId: before }, newValues: { userId: targetUserId, planId, status: sub.status }, reason: reason ?? null });
}

/** Essai offert par l'équipe KOTI (même si le client a déjà consommé son essai). L'usage doit tenir dans l'offre. */
export function applyTrialGrant(s: DbState, ctx: Ctx, targetUserId: string, planId: PlanId, days: number, reason?: string) {
  const sub = subscriptionOf(s, targetUserId);
  if (!sub) throw new AppError("NOT_FOUND", "Abonnement introuvable.");
  const target = planById(s, planId);
  if (target.monthlyPrice === 0) throw new AppError("VALIDATION", "Un essai s'offre sur une offre payante.");
  const bad = overages(usageOf(s, targetUserId), target);
  if (bad.length > 0) throw new AppError("INVALID_STATE", `L'offre « ${target.name} » ne couvre pas l'usage actuel : ${bad.join(" ; ")}.`);
  const before = { planId: sub.planId, status: sub.status };
  sub.planId = planId;
  sub.status = "TRIAL";
  sub.trialUsed = true;
  sub.canceledAt = null;
  sub.trialEndsAt = new Date(ctx.now.getTime() + days * 86_400_000).toISOString();
  sub.currentPeriodStart = null;
  sub.currentPeriodEnd = addDays(today(ctx), days);
  audit(s, ctx, { tontineId: null, action: "admin.trial.grant", entityType: "subscription", entityId: sub.id, oldValues: { userId: targetUserId, ...before }, newValues: { userId: targetUserId, planId, days }, reason: reason ?? null });
}

/**
 * Facturation périodique (appelée par les tâches planifiées, idempotente) : fin d'essai → première facture ;
 * période échue → facture suivante. Rattrape plusieurs périodes manquées.
 */
export function runBilling(s: DbState, now: Date): number {
  const day = todayISO(now);
  let issued = 0;
  for (const sub of s.subscriptions) {
    const plan = planById(s, sub.planId);
    if (plan.monthlyPrice === 0) continue;
    if (sub.status === "TRIAL" && sub.trialEndsAt && sub.trialEndsAt <= now.toISOString()) {
      sub.status = "ACTIVE";
      sub.currentPeriodStart = sub.currentPeriodEnd ?? day;
      sub.currentPeriodEnd = addMonths(sub.currentPeriodStart, 1);
      if (invoiceFor(s, sub, plan, sub.currentPeriodStart, now)) issued++;
    }
    while (sub.status === "ACTIVE" && sub.currentPeriodEnd && sub.currentPeriodEnd <= day) {
      sub.currentPeriodStart = sub.currentPeriodEnd;
      sub.currentPeriodEnd = addMonths(sub.currentPeriodStart, 1);
      if (invoiceFor(s, sub, plan, sub.currentPeriodStart, now)) issued++;
    }
  }
  return issued;
}

/** Offres affichées sur le site public (valeurs effectives, y compris les réglages de l'équipe). */
export function getPublicPlans(): Plan[] {
  return read((s) => allPlans(s));
}

export function getAccount(ctx: Ctx) {
  return read((s) => {
    const sub = subscriptionOf(s, ctx.userId);
    const plan = planById(s, sub?.planId ?? "FREE");
    const usage = usageOf(s, ctx.userId);
    const invoices = s.invoices.filter((i) => i.userId === ctx.userId).sort((a, b) => b.issuedAt.localeCompare(a.issuedAt));
    const trialDaysLeft = sub?.status === "TRIAL" && sub.trialEndsAt ? Math.max(0, Math.ceil((new Date(sub.trialEndsAt).getTime() - ctx.now.getTime()) / 86_400_000)) : null;
    return {
      plan,
      subscription: sub,
      usage,
      invoices,
      trialDaysLeft,
      /** Pour chaque offre : ce qui empêcherait d'y passer (vide = possible). */
      plans: allPlans(s),
      blockers: Object.fromEntries(allPlans(s).map((p) => [p.id, overages(usage, p)])) as Record<PlanId, string[]>,
    };
  });
}
