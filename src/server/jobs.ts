import "server-only";
import { runBilling } from "@/modules/billing/billing.service";
import { ensureObligations, isOverdue } from "@/modules/contributions/contribution.service";
import { notify } from "@/modules/notifications/notification.service";
import { addDays, formatDate, todayISO } from "@/lib/utils/dates";
import { formatFCFA } from "@/lib/utils/money";
import type { Ctx } from "@/server/context";
import { read, tx } from "@/server/db/store";

const SYSTEM: Ctx["userId"] = "system";
const DUE_SOON_DAYS = 2;
const ROTATION_SOON_DAYS = 3;

/**
 * Tâches planifiées (PRD §6.32) : génération des échéances, rappels avant échéance,
 * alertes de retard, tour de main approchant.
 * - Idempotentes : chaque notification porte une clé de déduplication.
 * - Protégées contre les exécutions multiples : verrou par créneau horaire dans `jobRuns`.
 * En production : déclenchées par un cron externe via POST /api/v1/jobs/run.
 */
export const hourlySlotKey = (now: Date) => `hourly:${now.toISOString().slice(0, 13)}`;

export function runScheduledJobs(now = new Date(), opts: { force?: boolean } = {}) {
  const slotKey = hourlySlotKey(now);
  if (!opts.force && read((s) => s.jobRuns.some((r) => r.key === slotKey))) return { skipped: true as const };

  return tx((s) => {
    if (!opts.force && s.jobRuns.some((r) => r.key === slotKey)) return { skipped: true as const };
    s.jobRuns = [...s.jobRuns.filter((r) => r.ranAt > new Date(now.getTime() - 7 * 86_400_000).toISOString()), { key: slotKey, ranAt: now.toISOString() }];
    const ctx: Ctx = { userId: SYSTEM, now };
    const today = todayISO(now);
    let generated = 0;
    let reminders = 0;
    // Facturation des abonnements (simulée) : fins d'essai et périodes échues.
    const invoices = runBilling(s, now);

    for (const tontine of s.tontines) {
      if (tontine.status !== "ACTIVE") continue;
      generated += ensureObligations(s, ctx, tontine);
      const members = s.tontineMembers.filter((m) => m.tontineId === tontine.id && m.status === "ACTIVE");

      for (const o of s.contributionObligations) {
        if (o.tontineId !== tontine.id) continue;
        const member = members.find((m) => m.id === o.memberId);
        if (!member || o.status === "PAID" || o.status === "DECLARED") continue;
        if (isOverdue(o, today)) {
          if (notify(s, ctx, { userId: member.userId, tontineId: tontine.id, type: "DUE_OVERDUE", title: "Cotisation en retard", message: `Votre cotisation de ${formatFCFA(o.expectedAmount)} (« ${tontine.name} ») était due le ${formatDate(o.dueDate)}.`, resourceType: "obligation", resourceId: o.id, dedupeKey: `overdue:${o.id}` })) reminders++;
        } else if (o.dueDate <= addDays(today, DUE_SOON_DAYS)) {
          if (notify(s, ctx, { userId: member.userId, tontineId: tontine.id, type: "DUE_SOON", title: "Échéance à venir", message: `${formatFCFA(o.expectedAmount)} à régler pour « ${tontine.name} » avant le ${formatDate(o.dueDate)}.`, resourceType: "obligation", resourceId: o.id, dedupeKey: `due-soon:${o.id}` })) reminders++;
        }
      }

      for (const slot of s.rotationSlots) {
        if (slot.tontineId !== tontine.id || slot.status === "CANCELLED" || !slot.scheduledDate) continue;
        if (slot.scheduledDate < today || slot.scheduledDate > addDays(today, ROTATION_SOON_DAYS)) continue;
        const member = members.find((m) => m.id === slot.memberId);
        if (!member) continue;
        if (notify(s, ctx, { userId: member.userId, tontineId: tontine.id, type: "ROTATION_SOON", title: "Votre tour de main approche", message: `Vous êtes bénéficiaire de « ${tontine.name} » le ${formatDate(slot.scheduledDate)}.`, resourceType: "rotation", resourceId: slot.id, dedupeKey: `rotation-soon:${slot.id}:${slot.scheduledDate}` })) reminders++;
      }
    }
    return { skipped: false as const, generated, reminders, invoices };
  });
}
