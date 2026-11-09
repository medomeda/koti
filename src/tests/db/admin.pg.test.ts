/* eslint-disable @typescript-eslint/no-explicit-any -- formes JSON héritées (v5) manipulées volontairement sans typage */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { platformCan } from "@/lib/permissions/platform";
import { runBilling } from "@/modules/billing/billing.service";
import { addDays, todayISO } from "@/lib/utils/dates";
import { ctxFor } from "@/server/context";
import type { DbState } from "@/server/db/store";
import * as pg from "@/server/pg/services";
import { useConnection, type Connection } from "@/server/db/client";
import { pgTx } from "@/server/db/uow";
import { hasTestDb, openTestDb } from "./helpers";
import { authenticate, resetWithDemo, snapshot } from "./pg-harness";

let conn: Connection;
let demo: DbState;
const snap = <T,>(fn: (s: DbState) => T) => snapshot(conn, fn);
const txn = <T,>(fn: (s: DbState) => T) => pgTx({ everything: true }, fn, conn.db);

describe.skipIf(!hasTestDb)("Parité PostgreSQL : admin.test.ts", () => {
beforeAll(async () => { conn = await openTestDb(); useConnection(conn); });
afterAll(async () => { useConnection(null); await conn?.close(); });

// L'activité fictive de la plateforme (≈ 60 clients) n'est générée que sur demande : elle ralentirait chaque test.
beforeAll(async () => {
  process.env.KOTI_SEED_PLATFORM = "1";
  (demo = await resetWithDemo(conn));
});
afterAll(async () => {
  delete process.env.KOTI_SEED_PLATFORM;
});

const id = (email: string) => demo.users.find((u) => u.email === email)!.id;
const admin = () => ctxFor(id("operateur@koti.demo"));
const support = () => ctxFor(id("support@koti.demo"));

describe("Espace admin — accès", () => {
  it("n'est accessible qu'à l'équipe KOTI : un client ordinaire obtient « introuvable »", async () => {
    for (const email of ["ahmed@koti.demo", "awa@koti.demo"]) {
      await expect((async () => (await pg.getPlatformOverview(ctxFor(id(email)))))()).rejects.toThrow(/introuvable/i);
      await expect((async () => (await pg.listClients(ctxFor(id(email)))))()).rejects.toThrow(/introuvable/i);
      await expect((async () => (await pg.listContactRequests(ctxFor(id(email)))))()).rejects.toThrow(/introuvable/i);
    }
    await expect((async () => { (await pg.getPlatformOverview(admin())); })()).resolves.toBeUndefined();
    await expect((async () => { (await pg.getPlatformOverview(support())); })()).resolves.toBeUndefined();
  });

  it("le support consulte et annote, mais ne peut ni suspendre, ni changer d'offre, ni offrir d'essai", async () => {
    const awa = id("awa@koti.demo");
    expect(platformCan("SUPPORT", "client.note")).toBe(true);
    expect(platformCan("SUPPORT", "client.suspend")).toBe(false);
    await expect((async () => { (await pg.addClientNote(support(), { userId: awa, text: "Appel émis, pas de réponse." })); })()).resolves.toBeUndefined();
    await expect((async () => (await pg.suspendUser(support(), { userId: awa, reason: "Test" })))()).rejects.toThrow(/droits/);
    await expect((async () => (await pg.changeClientPlan(support(), { userId: awa, planId: "PRO", reason: "Test" })))()).rejects.toThrow(/droits/);
  });

  it("un compte de l'équipe suspendu perd l'accès à l'espace d'administration", async () => {
    const op = admin();
    await txn((s) => {
      s.users.find((u) => u.id === op.userId)!.status = "SUSPENDED";
    });
    await expect((async () => (await pg.getPlatformOverview(op)))()).rejects.toThrow(/introuvable/i);
    await txn((s) => {
      s.users.find((u) => u.id === op.userId)!.status = "ACTIVE";
    });
    await expect((async () => { (await pg.getPlatformOverview(op)); })()).resolves.toBeUndefined();
  });
});

describe("Espace admin — données de démonstration", () => {
  it("contient une soixantaine de clients répartis sur 12 mois avec tous les cas de figure", async () => {
    const clients = await snap((s) => s.users.filter((u) => u.platformRole === "USER"));
    expect(clients.length).toBeGreaterThanOrEqual(55);
    const months = new Set(clients.map((u) => u.createdAt.slice(0, 7)));
    expect(months.size).toBeGreaterThanOrEqual(10);
    const o = (await pg.getPlatformOverview(admin()));
    expect(o.months).toHaveLength(12);
    expect(o.series.signups.reduce((a, b) => a + b, 0)).toBeGreaterThan(40);
    expect(o.series.revenue.some((v) => v > 0)).toBe(true);
    expect(o.kpis.tontines.active).toBeGreaterThan(10);
    expect(o.kpis.mrr).toBeGreaterThan(0);
    expect(o.kpis.payingClients).toBeGreaterThan(5);
    expect(o.alerts.find((a) => a.id === "messages")).toBeTruthy();
    // Entonnoir décroissant.
    const counts = o.funnel.map((f) => f.count);
    expect([...counts].sort((a, b) => b - a)).toEqual(counts);
    expect(counts[3]).toBeGreaterThan(0);
  });

  it("le revenu mensuel récurrent correspond aux abonnements payants actifs", async () => {
    const o = (await pg.getPlatformOverview(admin()));
    const subs = (await pg.listPlatformSubscriptions(admin()));
    expect(subs.mrr).toBe(o.kpis.mrr);
    expect(subs.breakdown.reduce((n, b) => n + b.clients, 0)).toBe(o.kpis.signups.total);
  });
});

describe("Espace admin — clients", () => {
  it("recherche sans accent ni casse, filtres par offre et par statut, pagination", async () => {
    const all = (await pg.listClients(admin(), { pageSize: 10 }));
    expect(all.total).toBeGreaterThanOrEqual(55);
    expect(all.rows).toHaveLength(10);
    expect(all.pages).toBeGreaterThan(5);
    const byName = (await pg.listClients(admin(), { q: "TRAORE" }));
    expect(byName.rows.some((r) => r.email === "ahmed@koti.demo")).toBe(true);
    const pro = (await pg.listClients(admin(), { plan: "PRO", pageSize: 100 }));
    expect(pro.rows.length).toBeGreaterThan(0);
    expect(pro.rows.every((r) => r.planId === "PRO")).toBe(true);
    const suspended = (await pg.listClients(admin(), { status: "SUSPENDED" }));
    expect(suspended.total).toBe(2);
    // L'équipe n'apparaît jamais dans la liste des clients.
    expect((await pg.listClients(admin(), { q: "koti.demo", pageSize: 100 })).rows.some((r) => r.email === "operateur@koti.demo")).toBe(false);
  });

  it("la fiche client donne des agrégats : offre, usage, tontines (comptes, retards), factures, chronologie", async () => {
    const f = (await pg.getClient(admin(), id("ahmed@koti.demo")));
    expect(f.plan.id).toBe("PRO");
    expect(f.tontines.length).toBeGreaterThanOrEqual(3);
    for (const t of f.tontines) expect(t).toEqual(expect.objectContaining({ members: expect.any(Number), tickets: expect.any(Number), late: expect.any(Number) }));
    expect(f.invoices.length).toBeGreaterThanOrEqual(3);
    expect(f.timeline[0]!.at >= f.timeline[f.timeline.length - 1]!.at).toBe(true);
    expect(f.timeline.at(-1)!.label).toBe("Inscription");
    // Confidentialité : aucun détail de paiement ni nom d'un autre membre dans la fiche.
    const json = JSON.stringify(f);
    expect(json).not.toMatch(/paymentMethod|reference|rejectionReason/);
    expect(json).not.toMatch(/Mariam Koné|Awa Diallo/);
  });

  it("refuse la fiche d'un membre de l'équipe ou d'un identifiant inconnu", async () => {
    await expect((async () => (await pg.getClient(admin(), id("operateur@koti.demo"))))()).rejects.toThrow(/introuvable/i);
    await expect((async () => (await pg.getClient(admin(), "00000000-0000-4000-8000-000000000000")))()).rejects.toThrow(/introuvable/i);
  });
});

describe("Espace admin — actions sur un compte", () => {
  it("suspendre : connexion refusée et sessions fermées, journalisé ; réactiver : accès rétabli", async () => {
    const awa = id("awa@koti.demo");
    expect((await authenticate(conn, "awa@koti.demo", "Koti2026"))).toBe(awa);
    (await pg.suspendUser(admin(), { userId: awa, reason: "Test de suspension" }));
    await expect((async () => (await authenticate(conn, "awa@koti.demo", "Koti2026")))()).rejects.toThrow(/suspendu/);
    await expect((async () => (await pg.suspendUser(admin(), { userId: awa, reason: "Encore" })))()).rejects.toThrow(/déjà suspendu/);
    const log = await snap((s) => s.auditLogs.filter((a) => a.action === "admin.user.suspend" && a.entityId === awa));
    expect(log.at(-1)).toMatchObject({ reason: "Test de suspension", actorId: admin().userId });
    expect((await pg.getClient(admin(), awa)).timeline[0]!.label).toMatch(/Compte suspendu/);
    (await pg.reactivateUser(admin(), { userId: awa, reason: "Erreur de manipulation" }));
    expect((await authenticate(conn, "awa@koti.demo", "Koti2026"))).toBe(awa);
  });

  it("on ne peut agir ni sur l'équipe, ni sur soi-même", async () => {
    await expect((async () => (await pg.suspendUser(admin(), { userId: id("support@koti.demo"), reason: "Test" })))()).rejects.toThrow(/introuvable/i);
    await expect((async () => (await pg.suspendUser(admin(), { userId: admin().userId, reason: "Test" })))()).rejects.toThrow(/introuvable/i);
  });

  it("changer l'offre au nom du client respecte les quotas d'usage, et le journal garde le motif", async () => {
    const ahmed = id("ahmed@koti.demo");
    await expect((async () => (await pg.changeClientPlan(admin(), { userId: ahmed, planId: "FREE", reason: "Test" })))()).rejects.toThrow(/ne couvre pas l'usage actuel du client/);
    (await pg.changeClientPlan(admin(), { userId: ahmed, planId: "ASSOCIATION", reason: "Demande du client par téléphone" }));
    expect((await pg.getClient(admin(), ahmed)).plan.id).toBe("ASSOCIATION");
    const log = await snap((s) => s.auditLogs.filter((a) => a.action === "admin.subscription.change").at(-1)!);
    expect(log).toMatchObject({ reason: "Demande du client par téléphone", actorId: admin().userId });
  });

  it("les notes internes sont enregistrées avec leur auteur et ne sortent jamais côté client", async () => {
    const koffi = id("koffi@koti.demo");
    (await pg.addClientNote(support(), { userId: koffi, text: "Demande un devis pour l'association." }));
    const f = (await pg.getClient(admin(), koffi));
    expect(f.notes[0]).toMatchObject({ text: "Demande un devis pour l'association.", authorName: "Support KOTI" });
    await expect((async () => (await pg.getClient(ctxFor(koffi), koffi)))()).rejects.toThrow(/introuvable/i);
  });
});

describe("Espace admin — tontines et messages", () => {
  it("la vue des tontines donne des agrégats (membres, tickets, retards) sans détail de paiement", async () => {
    const t = (await pg.listAdminTontines(admin(), { pageSize: 100 }));
    expect(t.total).toBeGreaterThan(30);
    for (const r of t.rows) expect(Object.keys(r)).not.toEqual(expect.arrayContaining(["payments", "memberNames"]));
    expect(t.rows.some((r) => r.health === "CRITIQUE" || r.health === "ATTENTION")).toBe(true);
    expect((await pg.listAdminTontines(admin(), { status: "ACTIVE", pageSize: 100 })).rows.every((r) => r.status === "ACTIVE")).toBe(true);
  });

  it("les messages de contact sont triés du plus récent au plus ancien, avec leur statut", async () => {
    const m = (await pg.listContactRequests(admin()));
    expect(m.length).toBeGreaterThanOrEqual(14);
    expect(m.filter((x) => x.status === "NEW")).toHaveLength(4);
    expect(m.every((x, i) => i === 0 || m[i - 1]!.createdAt >= x.createdAt)).toBe(true);
  });
});
describe("Offres — réglage depuis l'administration", () => {
  beforeAll(async () => (demo = await resetWithDemo(conn)));
  const T = todayISO();
  const proInput = async (over: Record<string, unknown> = {}) => {
    const pro = (await pg.listPlansAdmin(admin())).plans.find((p) => p.plan.id === "PRO")!.plan;
    return { planId: "PRO" as const, name: pro.name, tagline: pro.tagline, monthlyPrice: pro.monthlyPrice, limits: { ...pro.limits }, ...over };
  };
  const freeInput = async (limits: Record<string, unknown>) => {
    const free = (await pg.listPlansAdmin(admin())).plans.find((p) => p.plan.id === "FREE")!.plan;
    return { planId: "FREE" as const, name: free.name, tagline: free.tagline, monthlyPrice: 0, limits: { ...free.limits, ...limits } };
  };

  it("liste les trois offres avec leurs valeurs d'origine, leurs clients et leur revenu récurrent", async () => {
    const { plans, history } = (await pg.listPlansAdmin(support()));
    expect(plans.map((p) => p.plan.id)).toEqual(["FREE", "PRO", "ASSOCIATION"]);
    expect(plans.every((p) => !p.customized)).toBe(true);
    expect(plans.reduce((n, p) => n + p.clients, 0)).toBe(await snap((s) => s.users.filter((u) => u.platformRole === "USER").length));
    expect(plans.reduce((n, p) => n + p.mrr, 0)).toBe((await pg.getPlatformOverview(admin())).kpis.mrr);
    expect(history).toEqual([]);
  });

  it("seul un super-admin modifie les offres", async () => {
    await expect((async () => (await pg.updatePlan(support(), { ...(await proInput({ monthlyPrice: 6000 })), reason: "Test" })))()).rejects.toThrow(/droits/);
    await expect((async () => (await pg.resetPlan(support(), { planId: "PRO", reason: "Test" })))()).rejects.toThrow(/droits/);
    await expect((async () => (await pg.updatePlan(ctxFor(id("ahmed@koti.demo")), { ...(await proInput({ monthlyPrice: 6000 })), reason: "Test" })))()).rejects.toThrow(/introuvable/i);
  });

  it("refuse les réglages incohérents", async () => {
    const bad = async (input: any) => {
      try {
        (await pg.updatePlan(admin(), { ...input, reason: "Test" }));
      } catch (e: any) {
        return e.fieldErrors as Record<string, string>;
      }
      return null;
    };
    expect((await bad((await freeInput({})) && { ...(await freeInput({})), monthlyPrice: 1000 }))).toHaveProperty("monthlyPrice");
    expect((await bad((await proInput({ monthlyPrice: 0 }))))).toHaveProperty("monthlyPrice");
    expect((await bad((await freeInput({ membersPerTontine: 20, ticketsPerTontine: 10 }))))).toHaveProperty("ticketsPerTontine");
    expect((await bad((await proInput({ name: "A" }))))).toHaveProperty("name");
    expect((await bad((await freeInput({ tontines: 0 }))))).toHaveProperty("tontines");
    await expect((async () => (await pg.updatePlan(admin(), { ...(await proInput()), reason: "Rien" })))()).rejects.toThrow(/Aucun changement/);
  });

  it("l'aperçu d'impact compte les clients qui dépasseraient les nouvelles limites, sans rien enregistrer", async () => {
    const before = JSON.stringify(await snap((s) => s.planSettings));
    const impact = (await pg.previewPlanImpact(admin(), (await proInput({ limits: { ...(await proInput()).limits, tontines: 2 } }))));
    expect(impact.clients).toBeGreaterThan(0);
    expect(impact.overLimit).toBeGreaterThanOrEqual(1); // Ahmed organise 3 tontines
    expect(impact.examples.some((e) => /tontines? en cours/.test(e.problems.join()))).toBe(true);
    expect(JSON.stringify(await snap((s) => s.planSettings))).toBe(before);
  });

  it("une modification s'applique tout de suite aux quotas, au site public et à l'historique, sans bloquer l'existant", async () => {
    const free = async (userEmail: string) => (await pg.signUp({ fullName: "Nouveau Client", email: userEmail, phone: `+22507${Math.floor(10000000 + Math.random() * 89999999)}`, password: "Motdepasse1" }));
    const base = { name: "T", description: "", contributionAmount: 10000, frequency: "MONTHLY" as const, startDate: addDays(T, 10), expectedMemberCount: 4, rotationMode: "MANUAL" as const };
    const a = (await free("quota-a@exemple.ci"));
    (await pg.createTontine(ctxFor(a), base));
    await expect((async () => (await pg.createTontine(ctxFor(a), base)))()).rejects.toThrow(/permet 1 tontine/);

    (await pg.updatePlan(admin(), { ...(await freeInput({ tontines: 2 })), reason: "Ouvrir la 2e tontine aux comptes gratuits" }));
    expect((await pg.getPublicPlans()).find((p) => p.id === "FREE")!.limits.tontines).toBe(2);
    await expect((async () => { (await pg.createTontine(ctxFor(a), base)); })()).resolves.toBeUndefined();
    await expect((async () => (await pg.createTontine(ctxFor(a), base)))()).rejects.toThrow(/permet 2 tontines/);

    // Retour en arrière : la limite redescend, les tontines existantes restent (3 > 1 ne bloque rien d'existant).
    (await pg.resetPlan(admin(), { planId: "FREE", reason: "Test terminé" }));
    expect((await pg.getPublicPlans()).find((p) => p.id === "FREE")!.limits.tontines).toBe(1);
    expect(await snap((s) => s.tontines.filter((t) => t.creatorId === a).length)).toBe(2);

    const log = await snap((s) => s.auditLogs.filter((x) => x.action === "admin.plan.update"));
    expect(log).toHaveLength(2);
    expect(log[0]).toMatchObject({ entityId: "FREE", reason: "Ouvrir la 2e tontine aux comptes gratuits", actorId: admin().userId });
    expect((await pg.listPlansAdmin(admin())).history).toHaveLength(2);
    await expect((async () => (await pg.resetPlan(admin(), { planId: "FREE", reason: "Encore" })))()).rejects.toThrow(/valeurs d'origine/);
  });

  it("un nouveau prix ne touche pas les factures émises et s'applique aux suivantes", async () => {
    const proClient = await snap((s) => s.subscriptions.find((x) => x.planId === "PRO" && x.status === "ACTIVE" && s.invoices.some((i) => i.userId === x.userId))!);
    const oldInvoices = await snap((s) => structuredClone(s.invoices.filter((i) => i.userId === proClient.userId)));
    (await pg.updatePlan(admin(), { ...(await proInput({ monthlyPrice: 7500 })), reason: "Ajustement tarifaire" }));
    expect(await snap((s) => s.invoices.filter((i) => i.userId === proClient.userId).slice(0, oldInvoices.length))).toEqual(oldInvoices);
    await txn((s) => void runBilling(s, new Date(Date.now() + 70 * 86_400_000)));
    const latest = await snap((s) => s.invoices.filter((i) => i.userId === proClient.userId).sort((a, b) => b.periodStart.localeCompare(a.periodStart))[0]!);
    expect(latest.amount).toBe(7500);
    expect(oldInvoices.every((i) => i.amount === 5000)).toBe(true);
    expect((await pg.getPublicPlans()).find((p) => p.id === "PRO")!.monthlyPrice).toBe(7500);
  });
});
describe("Étape 4 — messages, annonces, journal d'audit", () => {
  const fresh = async () => await snap((s) => s.contactRequests.find((c) => c.status === "NEW")!.id);

  it("le support traite un message ; il est consigné, puis peut être rouvert", async () => {
    const msgId = (await fresh());
    (await pg.handleContactRequest(support(), { id: msgId, reply: "Rappelé, démonstration jeudi." }));
    const c = await snap((s) => s.contactRequests.find((x) => x.id === msgId)!);
    expect(c.status).toBe("HANDLED");
    expect(c.reply).toBe("Rappelé, démonstration jeudi.");
    expect(c.handledBy).toBe(id("support@koti.demo"));
    await expect((async () => (await pg.handleContactRequest(support(), { id: msgId, reply: "" })))()).rejects.toThrow(/déjà traité/i);
    (await pg.reopenContactRequest(admin(), { id: msgId, reason: "Nouvelle question" }));
    const r = await snap((s) => s.contactRequests.find((x) => x.id === msgId)!);
    expect(r.status).toBe("NEW");
    expect(r.reply).toBeUndefined();
    const actions = await snap((s) => s.auditLogs.filter((a) => a.entityId === msgId).map((a) => a.action));
    expect(actions).toEqual(["admin.message.handle", "admin.message.reopen"]);
  });

  it("un client ordinaire ne peut pas traiter un message", async () => {
    await expect((async () => (await pg.handleContactRequest(ctxFor(id("ahmed@koti.demo")), { id: (await fresh()), reply: "" })))()).rejects.toThrow(/introuvable/i);
  });

  it("annonces : seul le super-admin publie ; le support ne peut pas", async () => {
    expect(platformCan("SUPPORT", "announcement.manage")).toBe(false);
    await expect((async () => (await pg.createAnnouncement(support(), { title: "Test", message: "Message", tone: "info", endsAt: null })))()).rejects.toThrow(/droits|accès|autoris/i);
  });

  it("une annonce publiée est visible, puis disparaît quand elle est retirée ou expirée", async () => {
    (await pg.createAnnouncement(admin(), { title: "Maintenance", message: "Dimanche 2 h–4 h", tone: "warning", endsAt: null }));
    expect((await pg.activeAnnouncements()).map((a) => a.title)).toContain("Maintenance");
    const ann = await snap((s) => s.announcements.find((a) => a.title === "Maintenance")!);
    (await pg.setAnnouncementActive(admin(), { id: ann.id, active: false }));
    expect((await pg.activeAnnouncements()).map((a) => a.title)).not.toContain("Maintenance");
    (await pg.setAnnouncementActive(admin(), { id: ann.id, active: true }));
    expect((await pg.activeAnnouncements()).map((a) => a.title)).toContain("Maintenance");
    // Expiration : à une date postérieure à la fin, elle n'est plus servie.
    const soon = new Date(Date.now() + 2 * 86400_000).toISOString();
    await txn((s) => { s.announcements.find((a) => a.id === ann.id)!.endsAt = soon; });
    expect((await pg.activeAnnouncements(new Date(Date.now() + 3 * 86400_000))).map((a) => a.title)).not.toContain("Maintenance");
    await expect((async () => (await pg.setAnnouncementActive(admin(), { id: ann.id, active: true })))()).rejects.toThrow(/déjà publiée/i);
  });

  it("refuse une date de fin passée et plus de 3 annonces visibles", async () => {
    await expect((async () => (await pg.createAnnouncement(admin(), { title: "Passé", message: "Message", tone: "info", endsAt: "2020-01-01T00:00:00.000Z" })))()).rejects.toThrow(/futur/i);
    await txn((s) => { s.announcements = []; });
    for (const n of [1, 2, 3]) (await pg.createAnnouncement(admin(), { title: `A${n}`, message: "Message", tone: "success", endsAt: null }));
    await expect((async () => (await pg.createAnnouncement(admin(), { title: "A4", message: "Message", tone: "info", endsAt: null })))()).rejects.toThrow(/Trois annonces/);
    await txn((s) => { s.announcements = []; });
  });

  it("le journal de la plateforme liste les actions de l'équipe, filtrables, sans fuite hors équipe", async () => {
    const all = (await pg.listPlatformAudit(admin()));
    expect(all.total).toBeGreaterThan(0);
    expect(all.rows.every((r) => r.action.startsWith("admin."))).toBe(true);
    const offers = (await pg.listPlatformAudit(admin(), { category: "offres" }));
    expect(offers.rows.every((r) => r.action === "admin.plan.update")).toBe(true);
    const byActor = (await pg.listPlatformAudit(support(), { actorId: id("support@koti.demo") }));
    expect(byActor.rows.every((r) => r.actorName.length > 0)).toBe(true);
    await expect((async () => (await pg.listPlatformAudit(ctxFor(id("ahmed@koti.demo")))))()).rejects.toThrow(/introuvable/i);
  });
});

describe("Équipe KOTI — collaborateurs et rôles", () => {
  const newUser = async (email: string) => (await pg.signUp({ fullName: "Nouveau Collègue", email, phone: `+2250700${Math.floor(100000 + Math.random() * 899999)}`, password: "Koti2026" }));

  it("seul le super-admin invite ; le support, lui, ne peut pas", async () => {
    expect(platformCan("SUPPORT", "team.manage")).toBe(false);
    await expect((async () => (await pg.inviteStaff(support(), { email: "x@koti.demo", role: "SUPPORT" })))()).rejects.toThrow(/droits/i);
    await expect((async () => (await pg.inviteStaff(ctxFor(id("ahmed@koti.demo")), { email: "x@koti.demo", role: "SUPPORT" })))()).rejects.toThrow(/introuvable/i);
  });

  it("invitation → compte créé → acceptation : le rôle est attribué, le lien est à usage unique", async () => {
    const { token } = (await pg.inviteStaff(admin(), { email: "collegue@koti.demo", role: "SUPPORT" }));
    expect(await snap((s) => JSON.stringify(s.staffInvitations))).not.toContain(token); // seule l'empreinte est stockée
    expect((await pg.previewStaffInvitation(token))?.role).toBe("SUPPORT");
    await expect((async () => (await pg.inviteStaff(admin(), { email: "collegue@koti.demo", role: "SUPPORT" })))()).rejects.toThrow(/déjà en attente/i);
    const uid = (await newUser("collegue@koti.demo"));
    (await pg.acceptStaffInvitation(ctxFor(uid), token));
    expect(await snap((s) => s.users.find((u) => u.id === uid)!.platformRole)).toBe("SUPPORT");
    await expect((async () => { (await pg.getPlatformOverview(ctxFor(uid))); })()).resolves.toBeUndefined();
    await expect((async () => (await pg.acceptStaffInvitation(ctxFor(uid), token)))()).rejects.toThrow(/plus valable/i);
    expect(await snap((s) => s.auditLogs.some((a) => a.action === "admin.team.join" && a.actorId === uid))).toBe(true);
  });

  it("une invitation ne sert qu'avec l'adresse invitée, expire et peut être annulée", async () => {
    const { token } = (await pg.inviteStaff(admin(), { email: "autre@koti.demo", role: "SUPER_ADMIN" }));
    const intrus = (await newUser("intrus@koti.demo"));
    await expect((async () => (await pg.acceptStaffInvitation(ctxFor(intrus), token)))()).rejects.toThrow(/autre adresse/i);
    expect(await snap((s) => s.users.find((u) => u.id === intrus)!.platformRole)).toBe("USER");
    const invId = await snap((s) => s.staffInvitations.find((i) => i.email === "autre@koti.demo")!.id);
    (await pg.revokeStaffInvitation(admin(), { id: invId }));
    const uid = (await newUser("autre@koti.demo"));
    await expect((async () => (await pg.acceptStaffInvitation(ctxFor(uid), token)))()).rejects.toThrow(/plus valable/i);
    const { token: t2 } = (await pg.inviteStaff(admin(), { email: "tard@koti.demo", role: "SUPPORT" }));
    const late = (await newUser("tard@koti.demo"));
    await expect((async () => (await pg.acceptStaffInvitation({ ...ctxFor(late), now: new Date(Date.now() + 8 * 86400_000) }, t2)))()).rejects.toThrow(/plus valable/i);
  });

  it("refuse d'inviter un client qui a des tontines, ou quelqu'un déjà dans l'équipe", async () => {
    await expect((async () => (await pg.inviteStaff(admin(), { email: "ahmed@koti.demo", role: "SUPPORT" })))()).rejects.toThrow(/client qui a des tontines/i);
    await expect((async () => (await pg.inviteStaff(admin(), { email: "support@koti.demo", role: "SUPER_ADMIN" })))()).rejects.toThrow(/déjà partie/i);
  });

  it("changement de rôle et désactivation : journalisés, avec garde-fous", async () => {
    const sup = id("support@koti.demo");
    (await pg.changeStaffRole(admin(), { userId: sup, role: "SUPER_ADMIN", reason: "Promotion" }));
    expect(platformCan(await snap((s) => s.users.find((u) => u.id === sup)!.platformRole), "team.manage")).toBe(true);
    (await pg.changeStaffRole(admin(), { userId: sup, role: "SUPPORT", reason: "Retour" }));
    // Personne ne modifie son propre accès, et le dernier super-admin actif est protégé.
    await expect((async () => (await pg.changeStaffRole(admin(), { userId: id("operateur@koti.demo"), role: "SUPPORT", reason: "Test" })))()).rejects.toThrow(/propre accès/i);
    const root = id("operateur@koti.demo");
    await txn((s) => { s.users.find((u) => u.id === sup)!.platformRole = "SUPER_ADMIN"; });
    await expect((async () => { (await pg.setStaffStatus(ctxFor(sup), { userId: root, active: false, reason: "Test" })); })()).resolves.toBeUndefined(); // deux super-admins : permis
    (await pg.setStaffStatus(ctxFor(sup), { userId: root, active: true, reason: "Retour" }));
    await txn((s) => { s.users.find((u) => u.id === sup)!.platformRole = "SUPPORT"; });
    // Désactivation : sessions fermées et accès refusé.
    (await pg.setStaffStatus(admin(), { userId: sup, active: false, reason: "Départ" }));
    await expect((async () => (await pg.getPlatformOverview(ctxFor(sup))))()).rejects.toThrow(/introuvable/i);
    (await pg.setStaffStatus(admin(), { userId: sup, active: true, reason: "Retour" }));
    expect(await snap((s) => s.auditLogs.filter((a) => a.action.startsWith("admin.team.")).length)).toBeGreaterThan(5);
  });
});

});
