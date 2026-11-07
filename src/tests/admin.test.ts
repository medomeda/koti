/* eslint-disable @typescript-eslint/no-explicit-any -- formes JSON héritées (v5) manipulées volontairement sans typage */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { platformCan } from "@/lib/permissions/platform";
import { addClientNote, changeClientPlan, getClient, getPlatformOverview, grantTrial, listAdminTontines, listClients, listContactRequests, listPlatformSubscriptions, reactivateUser, suspendUser } from "@/modules/admin/admin.service";
import { authenticate } from "@/modules/users/user.service";
import { ctxFor } from "@/server/context";
import { migrateV5ToV6 } from "@/server/db/migrations";
import { ensureDemoStaff } from "@/server/db/seed";
import { read, resetDatabase, tx, type DbState } from "@/server/db/store";

// L'activité fictive de la plateforme (≈ 60 clients) n'est générée que sur demande : elle ralentirait chaque test.
beforeAll(() => {
  process.env.KOTI_SEED_PLATFORM = "1";
  resetDatabase();
});
afterAll(() => {
  delete process.env.KOTI_SEED_PLATFORM;
});

const id = (email: string) => read((s) => s.users.find((u) => u.email === email)!.id);
const admin = () => ctxFor(id("operateur@koti.demo"));
const support = () => ctxFor(id("support@koti.demo"));

describe("Espace admin — accès", () => {
  it("n'est accessible qu'à l'équipe KOTI : un client ordinaire obtient « introuvable »", () => {
    for (const email of ["ahmed@koti.demo", "awa@koti.demo"]) {
      expect(() => getPlatformOverview(ctxFor(id(email)))).toThrow(/introuvable/i);
      expect(() => listClients(ctxFor(id(email)))).toThrow(/introuvable/i);
      expect(() => listContactRequests(ctxFor(id(email)))).toThrow(/introuvable/i);
    }
    expect(() => getPlatformOverview(admin())).not.toThrow();
    expect(() => getPlatformOverview(support())).not.toThrow();
  });

  it("le support consulte et annote, mais ne peut ni suspendre, ni changer d'offre, ni offrir d'essai", () => {
    const awa = id("awa@koti.demo");
    expect(platformCan("SUPPORT", "client.note")).toBe(true);
    expect(platformCan("SUPPORT", "client.suspend")).toBe(false);
    expect(() => addClientNote(support(), { userId: awa, text: "Appel émis, pas de réponse." })).not.toThrow();
    expect(() => suspendUser(support(), { userId: awa, reason: "Test" })).toThrow(/droits/);
    expect(() => changeClientPlan(support(), { userId: awa, planId: "PRO", reason: "Test" })).toThrow(/droits/);
    expect(() => grantTrial(support(), { userId: awa, planId: "PRO", days: 14, reason: "Test" })).toThrow(/droits/);
  });

  it("un compte de l'équipe suspendu perd l'accès à l'espace d'administration", () => {
    const op = admin();
    tx((s) => {
      s.users.find((u) => u.id === op.userId)!.status = "SUSPENDED";
    });
    expect(() => getPlatformOverview(op)).toThrow(/introuvable/i);
    tx((s) => {
      s.users.find((u) => u.id === op.userId)!.status = "ACTIVE";
    });
    expect(() => getPlatformOverview(op)).not.toThrow();
  });
});

describe("Espace admin — données de démonstration", () => {
  it("contient une soixantaine de clients répartis sur 12 mois avec tous les cas de figure", () => {
    const clients = read((s) => s.users.filter((u) => u.platformRole === "USER"));
    expect(clients.length).toBeGreaterThanOrEqual(55);
    const months = new Set(clients.map((u) => u.createdAt.slice(0, 7)));
    expect(months.size).toBeGreaterThanOrEqual(10);
    const o = getPlatformOverview(admin());
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

  it("le revenu mensuel récurrent correspond aux abonnements payants actifs", () => {
    const o = getPlatformOverview(admin());
    const subs = listPlatformSubscriptions(admin());
    expect(subs.mrr).toBe(o.kpis.mrr);
    expect(subs.breakdown.reduce((n, b) => n + b.clients, 0)).toBe(o.kpis.signups.total);
  });
});

describe("Espace admin — clients", () => {
  it("recherche sans accent ni casse, filtres par offre et par statut, pagination", () => {
    const all = listClients(admin(), { pageSize: 10 });
    expect(all.total).toBeGreaterThanOrEqual(55);
    expect(all.rows).toHaveLength(10);
    expect(all.pages).toBeGreaterThan(5);
    const byName = listClients(admin(), { q: "TRAORE" });
    expect(byName.rows.some((r) => r.email === "ahmed@koti.demo")).toBe(true);
    const pro = listClients(admin(), { plan: "PRO", pageSize: 100 });
    expect(pro.rows.length).toBeGreaterThan(0);
    expect(pro.rows.every((r) => r.planId === "PRO")).toBe(true);
    const suspended = listClients(admin(), { status: "SUSPENDED" });
    expect(suspended.total).toBe(2);
    // L'équipe n'apparaît jamais dans la liste des clients.
    expect(listClients(admin(), { q: "koti.demo", pageSize: 100 }).rows.some((r) => r.email === "operateur@koti.demo")).toBe(false);
  });

  it("la fiche client donne des agrégats : offre, usage, tontines (comptes, retards), factures, chronologie", () => {
    const f = getClient(admin(), id("ahmed@koti.demo"));
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

  it("refuse la fiche d'un membre de l'équipe ou d'un identifiant inconnu", () => {
    expect(() => getClient(admin(), id("operateur@koti.demo"))).toThrow(/introuvable/i);
    expect(() => getClient(admin(), "00000000-0000-4000-8000-000000000000")).toThrow(/introuvable/i);
  });
});

describe("Espace admin — actions sur un compte", () => {
  it("suspendre : connexion refusée et sessions fermées, journalisé ; réactiver : accès rétabli", () => {
    const awa = id("awa@koti.demo");
    expect(authenticate("awa@koti.demo", "Koti2026")).toBe(awa);
    suspendUser(admin(), { userId: awa, reason: "Test de suspension" });
    expect(() => authenticate("awa@koti.demo", "Koti2026")).toThrow(/suspendu/);
    expect(() => suspendUser(admin(), { userId: awa, reason: "Encore" })).toThrow(/déjà suspendu/);
    const log = read((s) => s.auditLogs.filter((a) => a.action === "admin.user.suspend" && a.entityId === awa));
    expect(log.at(-1)).toMatchObject({ reason: "Test de suspension", actorId: admin().userId });
    expect(getClient(admin(), awa).timeline[0]!.label).toMatch(/Compte suspendu/);
    reactivateUser(admin(), { userId: awa, reason: "Erreur de manipulation" });
    expect(authenticate("awa@koti.demo", "Koti2026")).toBe(awa);
  });

  it("on ne peut agir ni sur l'équipe, ni sur soi-même", () => {
    expect(() => suspendUser(admin(), { userId: id("support@koti.demo"), reason: "Test" })).toThrow(/introuvable/i);
    expect(() => suspendUser(admin(), { userId: admin().userId, reason: "Test" })).toThrow(/introuvable/i);
  });

  it("changer l'offre au nom du client respecte les quotas d'usage, et le journal garde le motif", () => {
    const ahmed = id("ahmed@koti.demo");
    expect(() => changeClientPlan(admin(), { userId: ahmed, planId: "FREE", reason: "Test" })).toThrow(/ne couvre pas l'usage actuel du client/);
    changeClientPlan(admin(), { userId: ahmed, planId: "ASSOCIATION", reason: "Demande du client par téléphone" });
    expect(getClient(admin(), ahmed).plan.id).toBe("ASSOCIATION");
    const log = read((s) => s.auditLogs.filter((a) => a.action === "admin.subscription.change").at(-1)!);
    expect(log).toMatchObject({ reason: "Demande du client par téléphone", actorId: admin().userId });
  });

  it("offrir un essai : l'offre passe en essai pour la durée choisie, même si l'essai avait été consommé", () => {
    const mariam = id("mariam@koti.demo");
    grantTrial(admin(), { userId: mariam, planId: "PRO", days: 21, reason: "Geste commercial" });
    const f = getClient(admin(), mariam);
    expect(f.subscription).toMatchObject({ planId: "PRO", status: "TRIAL", trialUsed: true });
    expect(new Date(f.subscription!.trialEndsAt!).getTime() - Date.now()).toBeGreaterThan(20 * 86_400_000);
    expect(() => grantTrial(admin(), { userId: mariam, planId: "FREE", days: 10, reason: "x" })).toThrow(/offre payante/);
  });

  it("les notes internes sont enregistrées avec leur auteur et ne sortent jamais côté client", () => {
    const koffi = id("koffi@koti.demo");
    addClientNote(support(), { userId: koffi, text: "Demande un devis pour l'association." });
    const f = getClient(admin(), koffi);
    expect(f.notes[0]).toMatchObject({ text: "Demande un devis pour l'association.", authorName: "Support KOTI" });
    expect(() => getClient(ctxFor(koffi), koffi)).toThrow(/introuvable/i);
  });
});

describe("Espace admin — tontines et messages", () => {
  it("la vue des tontines donne des agrégats (membres, tickets, retards) sans détail de paiement", () => {
    const t = listAdminTontines(admin(), { pageSize: 100 });
    expect(t.total).toBeGreaterThan(30);
    for (const r of t.rows) expect(Object.keys(r)).not.toEqual(expect.arrayContaining(["payments", "memberNames"]));
    expect(t.rows.some((r) => r.health === "CRITIQUE" || r.health === "ATTENTION")).toBe(true);
    expect(listAdminTontines(admin(), { status: "ACTIVE", pageSize: 100 }).rows.every((r) => r.status === "ACTIVE")).toBe(true);
  });

  it("les messages de contact sont triés du plus récent au plus ancien, avec leur statut", () => {
    const m = listContactRequests(admin());
    expect(m.length).toBeGreaterThanOrEqual(14);
    expect(m.filter((x) => x.status === "NEW")).toHaveLength(4);
    expect(m.every((x, i) => i === 0 || m[i - 1]!.createdAt >= x.createdAt)).toBe(true);
  });
});

describe("Comptes de l'équipe sur une base de démonstration existante", () => {
  it("sont ajoutés sans rien écraser, une seule fois, et sans toucher aux autres données", () => {
    const s = read((st) => structuredClone(st)) as DbState;
    const staffIds = new Set(s.users.filter((u) => u.platformRole !== "USER").map((u) => u.id));
    expect(staffIds.size).toBe(2);
    // Base « ancienne » : sans l'équipe.
    s.users = s.users.filter((u) => !staffIds.has(u.id));
    s.userProfiles = s.userProfiles.filter((p) => !staffIds.has(p.userId));
    s.credentials = s.credentials.filter((c) => !staffIds.has(c.userId));
    s.subscriptions = s.subscriptions.filter((x) => !staffIds.has(x.userId));
    const others = structuredClone(s.users);
    expect(ensureDemoStaff(s)).toBe(true);
    expect(s.users.filter((u) => u.platformRole === "SUPER_ADMIN").map((u) => u.email)).toEqual(["operateur@koti.demo"]);
    expect(s.users.filter((u) => u.platformRole === "SUPPORT").map((u) => u.email)).toEqual(["support@koti.demo"]);
    expect(s.credentials.length).toBe(s.users.length);
    expect(s.users.slice(0, others.length)).toEqual(others);
    expect(ensureDemoStaff(s)).toBe(false); // idempotent
  });
});

describe("Migration v5 → v6", () => {
  it("ajoute les notes internes sans toucher aux données existantes", () => {
    const v5 = read((s) => structuredClone(s)) as any;
    delete v5.adminNotes;
    v5.version = 5;
    const snapshot = structuredClone(v5);
    const out = migrateV5ToV6(v5) as any;
    expect(v5).toEqual(snapshot);
    expect(out.version).toBe(6);
    expect(out.adminNotes).toEqual([]);
    expect(out.users).toEqual(snapshot.users);
    expect(out.subscriptions).toEqual(snapshot.subscriptions);
  });
});
