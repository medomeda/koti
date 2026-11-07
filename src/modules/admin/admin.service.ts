import "server-only";
import { audit } from "@/modules/audit/audit.service";
import { applyPlanChange, applyTrialGrant } from "@/modules/billing/billing.service";
import { PLANS } from "@/lib/marketing/plans";
import { activeMemberCount, allPlans, overages, planById, planOf, subscriptionOf, usageOf, COUNTED_STATUSES } from "@/modules/billing/quota";
import { effectiveObligationStatus } from "@/modules/contributions/contribution.service";
import { addDays, todayISO } from "@/lib/utils/dates";
import { formatFCFA } from "@/lib/utils/money";
import { activeTickets } from "@/modules/tickets/ticket.rules";
import { isoNow, requirePlatform, type Ctx } from "@/server/context";
import { read, tx, type DbState } from "@/server/db/store";
import { AppError, conflict, invalidState, notFound } from "@/server/errors";
import { newId } from "@/server/ids";
import type { ContactRequest, PlanId, Tontine, User } from "@/types/domain";

/**
 * Services de l'espace d'administration de la plateforme.
 * Confidentialité : l'équipe KOTI voit des AGRÉGATS et des métadonnées (nombre de membres, de tickets,
 * taux de retard, offre, facturation). Jamais le détail des paiements ni l'identité des autres membres d'une tontine.
 */

const normalize = (v: string) => v.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
const monthKey = (iso: string) => iso.slice(0, 7);

function clientsOf(s: Readonly<DbState>): User[] {
  return s.users.filter((u) => u.platformRole === "USER");
}

function nameOf(s: Readonly<DbState>, userId: string): string {
  return s.userProfiles.find((p) => p.userId === userId)?.fullName ?? "Utilisateur";
}

/** Dernière activité connue : dernière entrée d'audit dont l'utilisateur est l'auteur, sinon l'inscription. */
function lastActivityMap(s: Readonly<DbState>): Map<string, string> {
  const m = new Map<string, string>();
  for (const a of s.auditLogs) if ((m.get(a.actorId) ?? "") < a.createdAt) m.set(a.actorId, a.createdAt);
  return m;
}

/** Retards d'une tontine, en agrégat (aucun détail par membre). */
function lateStats(s: Readonly<DbState>, tontineId: string, todayDate: string) {
  const due = s.contributionObligations.filter((o) => o.tontineId === tontineId && o.dueDate <= todayDate);
  const late = due.filter((o) => effectiveObligationStatus(o, todayDate) === "LATE").length;
  const rate = due.length ? late / due.length : 0;
  const health: "OK" | "ATTENTION" | "CRITIQUE" | "NOUVELLE" = due.length === 0 ? "NOUVELLE" : rate > 0.4 ? "CRITIQUE" : rate > 0.2 ? "ATTENTION" : "OK";
  return { due: due.length, late, rate, health };
}

/* ------------------------------------------------------------------ Tableau de bord */

export function getPlatformOverview(ctx: Ctx) {
  return read((s) => {
    requirePlatform(s, ctx, "admin.view");
    const now = ctx.now;
    const nowIso = now.toISOString();
    const todayDate = todayISO(now);
    const clients = clientsOf(s);

    // 12 derniers mois, du plus ancien au plus récent.
    const months: string[] = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
      months.push(d.toISOString().slice(0, 7));
    }
    const signups = months.map((m) => clients.filter((u) => monthKey(u.createdAt) === m).length);
    const revenue = months.map((m) => s.invoices.filter((i) => monthKey(i.issuedAt) === m).reduce((n, i) => n + i.amount, 0));
    const tontinesCreated = months.map((m) => s.tontines.filter((t) => monthKey(t.createdAt) === m).length);

    const live = s.tontines.filter((t) => COUNTED_STATUSES.includes(t.status));
    const organizerIds = new Set(live.map((t) => t.creatorId));
    const paidSubs = s.subscriptions.filter((x) => planById(s, x.planId).monthlyPrice > 0 && clients.some((u) => u.id === x.userId));
    const mrr = paidSubs.filter((x) => x.status === "ACTIVE").reduce((n, x) => n + planById(s, x.planId).monthlyPrice, 0);
    const trials = paidSubs.filter((x) => x.status === "TRIAL").length;
    const thisMonth = months[months.length - 1]!;
    const lastMonth = months[months.length - 2]!;

    // Entonnoir : inscription → première tontine → tontine démarrée → premier paiement validé.
    const obligationTontine = new Map(s.contributionObligations.map((o) => [o.id, o.tontineId]));
    const tontinesWithValidatedPayment = new Set(s.payments.filter((p) => p.status === "PAID").map((p) => obligationTontine.get(p.obligationId)));
    const creators = new Set(s.tontines.map((t) => t.creatorId));
    const starters = new Set(s.tontines.filter((t) => t.status === "ACTIVE" || t.status === "PAUSED" || t.status === "COMPLETED").map((t) => t.creatorId));
    const validated = new Set(s.tontines.filter((t) => tontinesWithValidatedPayment.has(t.id)).map((t) => t.creatorId));
    const inClients = (set: Set<string>) => clients.filter((u) => set.has(u.id)).length;
    const funnel = [
      { label: "Inscrits", count: clients.length },
      { label: "Ont créé une tontine", count: inClients(creators) },
      { label: "Ont démarré une tontine", count: inClients(starters) },
      { label: "Ont validé un premier paiement", count: inClients(validated) },
    ];

    // Alertes.
    const alerts: Array<{ id: string; tone: "warning" | "danger" | "neutral"; title: string; detail: string; href: string }> = [];
    const memberUserIds = new Set(s.tontineMembers.map((m) => m.userId));
    const cutoff = addDays(todayDate, -30);
    const inactive = clients.filter((u) => u.status === "ACTIVE" && u.createdAt.slice(0, 10) <= cutoff && !memberUserIds.has(u.id));
    if (inactive.length > 0) alerts.push({ id: "inactive", tone: "warning", title: `${inactive.length} compte${inactive.length > 1 ? "s" : ""} inactif${inactive.length > 1 ? "s" : ""}`, detail: "Inscrits depuis plus de 30 jours, sans aucune tontine ni adhésion.", href: "/admin/clients?activity=inactive" });
    const atQuota = clients.filter((u) => {
      const plan = planOf(s, u.id);
      const owned = live.filter((t) => t.creatorId === u.id);
      return owned.length > 0 && (owned.length >= plan.limits.tontines || owned.some((t) => activeMemberCount(s, t.id) >= plan.limits.membersPerTontine));
    });
    if (atQuota.length > 0) alerts.push({ id: "quota", tone: "neutral", title: `${atQuota.length} client${atQuota.length > 1 ? "s" : ""} au maximum de leur offre`, detail: "Occasion de proposer une offre supérieure.", href: "/admin/clients?quota=1" });
    const soon = new Date(now.getTime() + 3 * 86_400_000).toISOString();
    const endingTrials = s.subscriptions.filter((x) => x.status === "TRIAL" && x.trialEndsAt && x.trialEndsAt >= nowIso && x.trialEndsAt <= soon);
    if (endingTrials.length > 0) alerts.push({ id: "trials", tone: "neutral", title: `${endingTrials.length} essai${endingTrials.length > 1 ? "s" : ""} gratuit${endingTrials.length > 1 ? "s" : ""} se termine${endingTrials.length > 1 ? "nt" : ""} sous 3 jours`, detail: "La première facture sera émise à leur terme.", href: "/admin/abonnements?status=TRIAL" });
    const newMessages = s.contactRequests.filter((c) => c.status === "NEW").length;
    if (newMessages > 0) alerts.push({ id: "messages", tone: "danger", title: `${newMessages} message${newMessages > 1 ? "s" : ""} à traiter`, detail: "Reçus par le formulaire de contact du site.", href: "/admin/messages" });
    const suspended = clients.filter((u) => u.status === "SUSPENDED").length;
    if (suspended > 0) alerts.push({ id: "suspended", tone: "neutral", title: `${suspended} compte${suspended > 1 ? "s" : ""} suspendu${suspended > 1 ? "s" : ""}`, detail: "Connexion refusée tant qu'ils ne sont pas réactivés.", href: "/admin/clients?status=SUSPENDED" });

    return {
      kpis: {
        signups: { total: clients.length, thisMonth: signups[signups.length - 1]!, lastMonth: signups[signups.length - 2]! },
        organizers: organizerIds.size,
        tontines: {
          active: s.tontines.filter((t) => t.status === "ACTIVE").length,
          draft: s.tontines.filter((t) => t.status === "DRAFT").length,
          paused: s.tontines.filter((t) => t.status === "PAUSED").length,
          completed: s.tontines.filter((t) => t.status === "COMPLETED").length,
        },
        tickets: live.reduce((n, t) => n + activeTickets(s, t.id).length, 0),
        mrr,
        payingClients: paidSubs.filter((x) => x.status === "ACTIVE").length,
        trials,
        invoicedThisMonth: revenue[revenue.length - 1]!,
        invoicedLastMonth: revenue[revenue.length - 2]!,
      },
      months,
      series: { signups, revenue, tontinesCreated },
      thisMonth,
      lastMonth,
      funnel,
      alerts,
    };
  });
}

/* ------------------------------------------------------------------ Clients */

export interface ClientFilters {
  q?: string;
  plan?: PlanId;
  status?: "ACTIVE" | "SUSPENDED" | "TRIAL";
  type?: "organizer" | "member";
  activity?: "inactive";
  quota?: boolean;
  page?: number;
  pageSize?: number;
}

export function listClients(ctx: Ctx, f: ClientFilters = {}) {
  return read((s) => {
    requirePlatform(s, ctx, "admin.view");
    const last = lastActivityMap(s);
    const todayDate = todayISO(ctx.now);
    const cutoff = addDays(todayDate, -30);
    const memberUserIds = new Set(s.tontineMembers.map((m) => m.userId));
    const q = f.q ? normalize(f.q.trim()) : "";
    const rows = clientsOf(s)
      .map((u) => {
        const sub = subscriptionOf(s, u.id);
        const plan = planById(s, sub?.planId ?? "FREE");
        const owned = s.tontines.filter((t) => t.creatorId === u.id);
        const live = owned.filter((t) => COUNTED_STATUSES.includes(t.status));
        const profile = s.userProfiles.find((p) => p.userId === u.id);
        const atQuota = live.length > 0 && (live.length >= plan.limits.tontines || live.some((t) => activeMemberCount(s, t.id) >= plan.limits.membersPerTontine));
        return {
          id: u.id,
          name: profile?.fullName ?? u.email,
          email: u.email,
          phone: profile?.phone ?? "",
          createdAt: u.createdAt,
          lastActivityAt: last.get(u.id) ?? u.createdAt,
          accountStatus: u.status,
          planId: plan.id,
          planName: plan.name,
          subscriptionStatus: sub?.status ?? "ACTIVE",
          organizedCount: owned.length,
          liveCount: live.length,
          isOrganizer: owned.length > 0,
          inactive: u.status === "ACTIVE" && u.createdAt.slice(0, 10) <= cutoff && !memberUserIds.has(u.id),
          atQuota,
        };
      })
      .filter((r) => (q ? normalize(r.name).includes(q) || normalize(r.email).includes(q) : true))
      .filter((r) => (f.plan ? r.planId === f.plan : true))
      .filter((r) => (f.status === "SUSPENDED" ? r.accountStatus === "SUSPENDED" : f.status === "TRIAL" ? r.subscriptionStatus === "TRIAL" : f.status === "ACTIVE" ? r.accountStatus === "ACTIVE" : true))
      .filter((r) => (f.type === "organizer" ? r.isOrganizer : f.type === "member" ? !r.isOrganizer : true))
      .filter((r) => (f.activity === "inactive" ? r.inactive : true))
      .filter((r) => (f.quota ? r.atQuota : true))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const pageSize = f.pageSize ?? 15;
    const pages = Math.max(1, Math.ceil(rows.length / pageSize));
    const page = Math.min(Math.max(1, f.page ?? 1), pages);
    return { rows: rows.slice((page - 1) * pageSize, page * pageSize), total: rows.length, page, pages, plans: allPlans(s).map((p) => ({ id: p.id, name: p.name })) };
  });
}

const TIMELINE_LABELS: Record<string, string> = {
  "tontine.create": "A créé une tontine",
  "tontine.activate": "A démarré une tontine",
  "tontine.pause": "A suspendu une tontine",
  "tontine.resume": "A repris une tontine",
  "tontine.close": "A clôturé une tontine",
  "subscription.change": "A changé d'offre",
};

export function getClient(ctx: Ctx, userId: string) {
  return read((s) => {
    requirePlatform(s, ctx, "admin.view");
    const user = clientsOf(s).find((u) => u.id === userId);
    if (!user) throw notFound("Client introuvable.");
    const profile = s.userProfiles.find((p) => p.userId === userId);
    const sub = subscriptionOf(s, userId);
    const plan = planById(s, sub?.planId ?? "FREE");
    const todayDate = todayISO(ctx.now);
    const owned = s.tontines.filter((t) => t.creatorId === userId).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const tontines = owned.map((t) => ({
      id: t.id,
      name: t.name,
      status: t.status,
      createdAt: t.createdAt,
      frequency: t.frequency,
      contributionAmount: t.contributionAmount,
      members: activeMemberCount(s, t.id),
      tickets: activeTickets(s, t.id).length,
      multipleTickets: t.multipleTicketsAllowed,
      ...lateStats(s, t.id, todayDate),
    }));
    const memberships = s.tontineMembers.filter((m) => m.userId === userId && m.status === "ACTIVE" && m.role === "MEMBER").length;
    const invoices = s.invoices.filter((i) => i.userId === userId).sort((a, b) => b.issuedAt.localeCompare(a.issuedAt));
    const notes = s.adminNotes.filter((n) => n.userId === userId).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map((n) => ({ ...n, authorName: nameOf(s, n.authorId) }));

    // Chronologie : événements du compte uniquement (aucun détail de paiement).
    const timeline: Array<{ at: string; label: string; detail?: string }> = [{ at: user.createdAt, label: "Inscription" }];
    for (const a of s.auditLogs) {
      if (a.actorId === userId && TIMELINE_LABELS[a.action]) {
        const t = a.tontineId ? s.tontines.find((x) => x.id === a.tontineId) : null;
        const planChange = a.action === "subscription.change" ? ` : ${planById(s, (a.oldValues?.planId as PlanId) ?? "FREE").name} → ${planById(s, (a.newValues?.planId as PlanId) ?? "FREE").name}` : "";
        timeline.push({ at: a.createdAt, label: `${TIMELINE_LABELS[a.action]}${t ? ` « ${t.name} »` : ""}${planChange}` });
      } else if (a.action.startsWith("admin.") && (a.entityId === userId || a.oldValues?.userId === userId)) {
        const labels: Record<string, string> = { "admin.user.suspend": "Compte suspendu", "admin.user.reactivate": "Compte réactivé", "admin.subscription.change": "Offre modifiée par l'équipe", "admin.trial.grant": "Essai offert par l'équipe", "admin.note.add": "Note interne ajoutée" };
        timeline.push({ at: a.createdAt, label: `${labels[a.action] ?? a.action} (${nameOf(s, a.actorId)})`, detail: a.reason ?? undefined });
      }
    }
    for (const i of invoices) timeline.push({ at: i.issuedAt, label: `Facture ${i.number}`, detail: formatFCFA(i.amount) });
    timeline.sort((a, b) => b.at.localeCompare(a.at));

    const last = lastActivityMap(s).get(userId) ?? user.createdAt;
    return {
      user: { id: user.id, name: profile?.fullName ?? user.email, email: user.email, phone: profile?.phone ?? "", createdAt: user.createdAt, status: user.status, lastActivityAt: last },
      subscription: sub,
      plan,
      usage: usageOf(s, userId),
      plans: allPlans(s),
      tontines,
      memberships,
      invoices,
      notes,
      timeline: timeline.slice(0, 40),
    };
  });
}

function targetClient(s: Readonly<DbState>, ctx: Ctx, userId: string): User {
  const target = s.users.find((u) => u.id === userId);
  if (!target || target.platformRole !== "USER") throw notFound("Client introuvable.");
  if (target.id === ctx.userId) throw invalidState("Vous ne pouvez pas agir sur votre propre compte.");
  return target;
}

export function suspendUser(ctx: Ctx, input: { userId: string; reason: string }) {
  tx((s) => {
    requirePlatform(s, ctx, "client.suspend");
    const target = targetClient(s, ctx, input.userId);
    if (target.status === "SUSPENDED") throw conflict("Ce compte est déjà suspendu.");
    target.status = "SUSPENDED";
    s.sessions = s.sessions.filter((x) => x.userId !== target.id); // déconnexion immédiate
    audit(s, ctx, { tontineId: null, action: "admin.user.suspend", entityType: "user", entityId: target.id, oldValues: { status: "ACTIVE" }, newValues: { status: "SUSPENDED" }, reason: input.reason });
  });
}

export function reactivateUser(ctx: Ctx, input: { userId: string; reason: string }) {
  tx((s) => {
    requirePlatform(s, ctx, "client.suspend");
    const target = targetClient(s, ctx, input.userId);
    if (target.status === "ACTIVE") throw conflict("Ce compte est déjà actif.");
    target.status = "ACTIVE";
    audit(s, ctx, { tontineId: null, action: "admin.user.reactivate", entityType: "user", entityId: target.id, oldValues: { status: "SUSPENDED" }, newValues: { status: "ACTIVE" }, reason: input.reason });
  });
}

export function changeClientPlan(ctx: Ctx, input: { userId: string; planId: PlanId; reason: string }) {
  tx((s) => {
    requirePlatform(s, ctx, "client.plan");
    const target = targetClient(s, ctx, input.userId);
    applyPlanChange(s, ctx, target.id, input.planId, "admin.subscription.change", input.reason);
  });
}

export function grantTrial(ctx: Ctx, input: { userId: string; planId: PlanId; days: number; reason: string }) {
  tx((s) => {
    requirePlatform(s, ctx, "client.trial");
    const target = targetClient(s, ctx, input.userId);
    applyTrialGrant(s, ctx, target.id, input.planId, input.days, input.reason);
  });
}

export function addClientNote(ctx: Ctx, input: { userId: string; text: string }) {
  tx((s) => {
    requirePlatform(s, ctx, "client.note");
    const target = s.users.find((u) => u.id === input.userId && u.platformRole === "USER");
    if (!target) throw notFound("Client introuvable.");
    s.adminNotes.push({ id: newId(), userId: target.id, authorId: ctx.userId, text: input.text, createdAt: isoNow(ctx) });
    audit(s, ctx, { tontineId: null, action: "admin.note.add", entityType: "user", entityId: target.id });
  });
}

/* ------------------------------------------------------------------ Tontines, abonnements, messages */

export function listAdminTontines(ctx: Ctx, f: { q?: string; status?: Tontine["status"]; health?: string; page?: number; pageSize?: number } = {}) {
  return read((s) => {
    requirePlatform(s, ctx, "admin.view");
    const todayDate = todayISO(ctx.now);
    const q = f.q ? normalize(f.q.trim()) : "";
    const rows = s.tontines
      .map((t) => {
        const stats = lateStats(s, t.id, todayDate);
        return {
          id: t.id,
          name: t.name,
          status: t.status,
          createdAt: t.createdAt,
          creatorId: t.creatorId,
          creatorName: nameOf(s, t.creatorId),
          frequency: t.frequency,
          contributionAmount: t.contributionAmount,
          members: activeMemberCount(s, t.id),
          tickets: activeTickets(s, t.id).length,
          ...stats,
        };
      })
      .filter((r) => (q ? normalize(r.name).includes(q) || normalize(r.creatorName).includes(q) : true))
      .filter((r) => (f.status ? r.status === f.status : true))
      .filter((r) => (f.health ? r.health === f.health : true))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const pageSize = f.pageSize ?? 15;
    const pages = Math.max(1, Math.ceil(rows.length / pageSize));
    const page = Math.min(Math.max(1, f.page ?? 1), pages);
    return { rows: rows.slice((page - 1) * pageSize, page * pageSize), total: rows.length, page, pages };
  });
}

export function listPlatformSubscriptions(ctx: Ctx, f: { plan?: PlanId; status?: "ACTIVE" | "TRIAL"; page?: number; pageSize?: number } = {}) {
  return read((s) => {
    requirePlatform(s, ctx, "admin.view");
    const clientIds = new Set(clientsOf(s).map((u) => u.id));
    const subs = s.subscriptions.filter((x) => clientIds.has(x.userId));
    const breakdown = allPlans(s).map((p) => {
      const mine = subs.filter((x) => x.planId === p.id);
      return { planId: p.id, name: p.name, price: p.monthlyPrice, clients: mine.length, trials: mine.filter((x) => x.status === "TRIAL").length, mrr: mine.filter((x) => x.status === "ACTIVE").length * p.monthlyPrice };
    });
    const rows = subs
      .filter((x) => (f.plan ? x.planId === f.plan : true))
      .filter((x) => (f.status ? x.status === f.status : true))
      .map((x) => ({
        userId: x.userId,
        clientName: nameOf(s, x.userId),
        email: s.users.find((u) => u.id === x.userId)?.email ?? "",
        planId: x.planId,
        planName: planById(s, x.planId).name,
        price: planById(s, x.planId).monthlyPrice,
        status: x.status,
        startedAt: x.startedAt,
        trialEndsAt: x.trialEndsAt,
        nextBilling: x.currentPeriodEnd,
        canceledAt: x.canceledAt,
      }))
      .sort((a, b) => b.price - a.price || b.startedAt.localeCompare(a.startedAt));
    const recentInvoices = s.invoices
      .filter((i) => clientIds.has(i.userId))
      .sort((a, b) => b.issuedAt.localeCompare(a.issuedAt))
      .slice(0, 12)
      .map((i) => ({ ...i, clientName: nameOf(s, i.userId) }));
    const pageSize = f.pageSize ?? 15;
    const pages = Math.max(1, Math.ceil(rows.length / pageSize));
    const page = Math.min(Math.max(1, f.page ?? 1), pages);
    return { breakdown, rows: rows.slice((page - 1) * pageSize, page * pageSize), total: rows.length, page, pages, recentInvoices, mrr: breakdown.reduce((n, b) => n + b.mrr, 0) };
  });
}

export function listContactRequests(ctx: Ctx): ContactRequest[] {
  return read((s) => {
    requirePlatform(s, ctx, "admin.view");
    return [...s.contactRequests].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  });
}

export function countNewMessages(ctx: Ctx): number {
  return read((s) => {
    try {
      requirePlatform(s, ctx, "admin.view");
    } catch {
      return 0;
    }
    return s.contactRequests.filter((c) => c.status === "NEW").length;
  });
}

/** Rôle plateforme de l'utilisateur courant (null si client ordinaire). Sert à afficher le lien « Administration ». */
export function platformRoleOf(userId: string) {
  return read((s) => {
    const u = s.users.find((x) => x.id === userId);
    return u && u.status === "ACTIVE" && (u.platformRole === "SUPPORT" || u.platformRole === "SUPER_ADMIN") ? u.platformRole : null;
  });
}

/* ------------------------------------------------------------------ Offres (réglage depuis l'administration) */

export interface PlanInput {
  planId: PlanId;
  name: string;
  tagline: string;
  monthlyPrice: number;
  limits: { tontines: number; membersPerTontine: number; ticketsPerTontine: number; multipleTickets: boolean };
}

function validatePlanInput(s: Readonly<DbState>, i: PlanInput) {
  const errors: Record<string, string> = {};
  if (!PLANS.some((p) => p.id === i.planId)) throw notFound("Offre introuvable.");
  if (i.name.trim().length < 2 || i.name.length > 40) errors.name = "Entre 2 et 40 caractères.";
  if (i.tagline.length > 120) errors.tagline = "120 caractères maximum.";
  if (!Number.isInteger(i.monthlyPrice) || i.monthlyPrice < 0 || i.monthlyPrice > 1_000_000) errors.monthlyPrice = "Montant entier entre 0 et 1 000 000 FCFA.";
  else if (i.planId === "FREE" && i.monthlyPrice !== 0) errors.monthlyPrice = "L'offre gratuite reste à 0 FCFA.";
  else if (i.planId !== "FREE" && i.monthlyPrice === 0) errors.monthlyPrice = "Une offre payante doit avoir un prix supérieur à 0.";
  const l = i.limits;
  if (!Number.isInteger(l.tontines) || l.tontines < 1 || l.tontines > 500) errors.tontines = "Entre 1 et 500.";
  if (!Number.isInteger(l.membersPerTontine) || l.membersPerTontine < 2 || l.membersPerTontine > 1000) errors.membersPerTontine = "Entre 2 et 1 000.";
  if (!Number.isInteger(l.ticketsPerTontine) || l.ticketsPerTontine < 1 || l.ticketsPerTontine > 5000) errors.ticketsPerTontine = "Entre 1 et 5 000.";
  else if (!errors.membersPerTontine && l.ticketsPerTontine < l.membersPerTontine) errors.ticketsPerTontine = "Au moins autant de tickets que de membres (chaque membre a un ticket).";
  if (Object.keys(errors).length > 0) throw new AppError("VALIDATION", "Certains réglages sont invalides.", errors);
  void s;
}

/** Offres telles que vues par l'équipe : valeurs effectives, valeurs d'origine, clients concernés, historique des modifications. */
export function listPlansAdmin(ctx: Ctx) {
  return read((s) => {
    requirePlatform(s, ctx, "admin.view");
    const clientIds = new Set(clientsOf(s).map((u) => u.id));
    const effective = allPlans(s);
    const history = s.auditLogs
      .filter((a) => a.action === "admin.plan.update")
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, 30)
      .map((a) => ({ id: a.id, at: a.createdAt, by: nameOf(s, a.actorId), planId: a.entityId as PlanId, reason: a.reason ?? "", before: a.oldValues as Record<string, unknown> | null, after: a.newValues as Record<string, unknown> | null }));
    return {
      plans: effective.map((p) => {
        const subs = s.subscriptions.filter((x) => x.planId === p.id && clientIds.has(x.userId));
        const def = PLANS.find((d) => d.id === p.id)!;
        const setting = s.planSettings.find((x) => x.planId === p.id);
        return {
          plan: p,
          defaults: { name: def.name, tagline: def.tagline, monthlyPrice: def.monthlyPrice, limits: def.limits },
          customized: !!setting,
          updatedAt: setting?.updatedAt ?? null,
          updatedBy: setting ? nameOf(s, setting.updatedBy) : null,
          clients: subs.length,
          trials: subs.filter((x) => x.status === "TRIAL").length,
          mrr: subs.filter((x) => x.status === "ACTIVE").length * p.monthlyPrice,
        };
      }),
      history,
    };
  });
}

/**
 * Impact d'un réglage AVANT de l'enregistrer : combien de clients de cette offre dépassent les nouvelles limites
 * (leurs tontines existantes ne sont pas bloquées, mais ils ne pourront plus en créer ni en agrandir) et effet sur le revenu récurrent.
 */
export function previewPlanImpact(ctx: Ctx, input: PlanInput) {
  return read((s) => {
    requirePlatform(s, ctx, "admin.view");
    validatePlanInput(s, input);
    const current = planById(s, input.planId);
    const proposed = { ...current, name: input.name.trim(), tagline: input.tagline.trim(), monthlyPrice: input.monthlyPrice, limits: { ...input.limits } };
    const clientIds = new Set(clientsOf(s).map((u) => u.id));
    const subs = s.subscriptions.filter((x) => x.planId === input.planId && clientIds.has(x.userId));
    const over = subs
      .map((x) => ({ userId: x.userId, name: nameOf(s, x.userId), problems: overages(usageOf(s, x.userId), proposed) }))
      .filter((x) => x.problems.length > 0);
    const active = subs.filter((x) => x.status === "ACTIVE").length;
    return {
      clients: subs.length,
      overLimit: over.length,
      examples: over.slice(0, 5).map((o) => ({ userId: o.userId, name: o.name, problems: o.problems })),
      mrrBefore: active * current.monthlyPrice,
      mrrAfter: active * proposed.monthlyPrice,
      changed: JSON.stringify({ n: current.name, t: current.tagline, p: current.monthlyPrice, l: current.limits }) !== JSON.stringify({ n: proposed.name, t: proposed.tagline, p: proposed.monthlyPrice, l: proposed.limits }),
    };
  });
}

/**
 * Modification d'une offre (SUPER_ADMIN, motif obligatoire, journalisée). Effets :
 * - quotas : s'appliquent aux nouvelles créations ; aucune tontine existante n'est bloquée ni supprimée ;
 * - prix : s'applique aux factures émises à partir de maintenant ; les factures passées ne changent jamais.
 */
export function updatePlan(ctx: Ctx, input: PlanInput & { reason: string }) {
  tx((s) => {
    requirePlatform(s, ctx, "plan.edit");
    validatePlanInput(s, input);
    const before = planById(s, input.planId);
    const next: PlanInput = { planId: input.planId, name: input.name.trim(), tagline: input.tagline.trim(), monthlyPrice: input.monthlyPrice, limits: { ...input.limits } };
    const same = before.name === next.name && before.tagline === next.tagline && before.monthlyPrice === next.monthlyPrice && JSON.stringify(before.limits) === JSON.stringify(next.limits);
    if (same) throw conflict("Aucun changement à enregistrer.");
    const existing = s.planSettings.find((x) => x.planId === input.planId);
    const setting = { planId: input.planId, name: next.name, tagline: next.tagline, monthlyPrice: next.monthlyPrice, limits: next.limits, updatedAt: isoNow(ctx), updatedBy: ctx.userId };
    if (existing) Object.assign(existing, setting);
    else s.planSettings.push(setting);
    audit(s, ctx, {
      tontineId: null,
      action: "admin.plan.update",
      entityType: "plan",
      entityId: input.planId,
      oldValues: { name: before.name, tagline: before.tagline, monthlyPrice: before.monthlyPrice, ...before.limits },
      newValues: { name: next.name, tagline: next.tagline, monthlyPrice: next.monthlyPrice, ...next.limits },
      reason: input.reason,
    });
  });
}

/** Retour aux valeurs d'origine d'une offre (SUPER_ADMIN). */
export function resetPlan(ctx: Ctx, input: { planId: PlanId; reason: string }) {
  tx((s) => {
    requirePlatform(s, ctx, "plan.edit");
    const i = s.planSettings.findIndex((x) => x.planId === input.planId);
    if (i < 0) throw conflict("Cette offre a déjà ses valeurs d'origine.");
    const before = planById(s, input.planId);
    s.planSettings.splice(i, 1);
    const def = planById(s, input.planId);
    audit(s, ctx, { tontineId: null, action: "admin.plan.update", entityType: "plan", entityId: input.planId, oldValues: { name: before.name, tagline: before.tagline, monthlyPrice: before.monthlyPrice, ...before.limits }, newValues: { name: def.name, tagline: def.tagline, monthlyPrice: def.monthlyPrice, ...def.limits }, reason: `Retour aux valeurs d'origine : ${input.reason}` });
  });
}
