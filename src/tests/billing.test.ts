/* eslint-disable @typescript-eslint/no-explicit-any -- formes JSON héritées (v4) manipulées volontairement sans typage */
import { beforeEach, describe, expect, it } from "vitest";
import { addDays, todayISO } from "@/lib/utils/dates";
import { PLANS } from "@/lib/marketing/plans";
import { addMonths, changePlan, getAccount, runBilling } from "@/modules/billing/billing.service";
import { assertMemberCapacity, assertTicketCapacity } from "@/modules/billing/quota";
import { acceptInvitation, createInvitation } from "@/modules/invitations/invitation.service";
import { createTicket } from "@/modules/tickets/ticket.service";
import { changeTontineStatus, createTontine, updateTontine } from "@/modules/tontines/tontine.service";
import { authenticate, signUp } from "@/modules/users/user.service";
import { ctxFor } from "@/server/context";
import "@/server/db/seed";
import { migrateV4ToV5 } from "@/server/db/migrations";
import { read, resetDatabase, tx } from "@/server/db/store";
import { runScheduledJobs } from "@/server/jobs";

const T = todayISO();
const userId = (email: string) => read((s) => s.users.find((u) => u.email === email)!.id);
beforeEach(() => resetDatabase());

const base = { name: "Tontine Quota", description: "", contributionAmount: 10_000, frequency: "WEEKLY" as const, startDate: addDays(T, 7), expectedMemberCount: 5, rotationMode: "MANUAL" as const };

/** Nouveau client (offre gratuite) : s'inscrit puis renvoie son identifiant. */
function newClient(n = 1) {
  return signUp({ fullName: `Client ${n}`, email: `client${n}@exemple.ci`, phone: `+22507000000${n}${n}`, password: "Motdepasse1" });
}

describe("Offres — abonnement et rôle plateforme", () => {
  it("un nouveau compte reçoit l'offre gratuite, le rôle USER et le statut ACTIVE", () => {
    const id = newClient();
    const s = read((st) => ({ user: st.users.find((u) => u.id === id)!, sub: st.subscriptions.find((x) => x.userId === id)! }));
    expect(s.user).toMatchObject({ platformRole: "USER", status: "ACTIVE" });
    expect(s.sub).toMatchObject({ planId: "FREE", status: "ACTIVE", trialUsed: false });
    expect(read((st) => st.users.filter((u) => u.platformRole === "SUPER_ADMIN").map((u) => u.email))).toEqual(["operateur@koti.demo"]);
  });

  it("l'offre gratuite limite à une tontine en cours ; une clôturée libère la place", () => {
    const id = newClient();
    const first = createTontine(ctxFor(id), base);
    expect(() => createTontine(ctxFor(id), base)).toThrow(/permet 1 tontine/);
    changeTontineStatus(ctxFor(id), first, "close", "Plus nécessaire"); // brouillon → annulée
    expect(() => createTontine(ctxFor(id), base)).not.toThrow();
  });

  it("l'offre gratuite refuse les tickets multiples et plus de 10 membres", () => {
    const id = newClient();
    expect(() => createTontine(ctxFor(id), { ...base, multipleTicketsAllowed: true, maxTicketsPerMember: 2 })).toThrow(/tickets multiples/);
    expect(() => createTontine(ctxFor(id), { ...base, expectedMemberCount: 11 })).toThrow(/10 membres/);
    const tid = createTontine(ctxFor(id), { ...base, expectedMemberCount: 10 });
    expect(() => updateTontine(ctxFor(id), { tontineId: tid, name: "Nom", description: "", financial: { ...base, expectedMemberCount: 12, multipleTicketsAllowed: false } })).toThrow(/10 membres/);
  });

  it("l'offre Organisateur (Ahmed) permet plusieurs tontines et les tickets multiples", () => {
    const ahmed = userId("ahmed@koti.demo");
    expect(getAccount(ctxFor(ahmed)).plan.id).toBe("PRO");
    expect(() => createTontine(ctxFor(ahmed), { ...base, multipleTicketsAllowed: true, maxTicketsPerMember: 3 })).not.toThrow();
  });

  it("les plafonds de membres et de tickets protègent aussi une tontine déjà trop grande", () => {
    const ahmed = userId("ahmed@koti.demo");
    const s = read((st) => structuredClone(st));
    const famille = s.tontines.find((t) => t.name === "Tontine Famille")!;
    s.subscriptions.find((x) => x.userId === ahmed)!.planId = "FREE";
    expect(() => assertMemberCapacity(s, famille)).not.toThrow(); // 8 membres < 10
    for (let i = 0; i < 2; i++) s.tontineMembers.push({ ...s.tontineMembers.find((m) => m.tontineId === famille.id)!, id: `x${i}` });
    expect(() => assertMemberCapacity(s, famille)).toThrow(/limite de 10 membres/);
    const t0 = s.tontineTickets.find((t) => t.tontineId === famille.id)!;
    for (let i = 0; i < 3; i++) s.tontineTickets.push({ ...t0, id: `tk${i}` });
    expect(() => assertTicketCapacity(s, famille)).toThrow(/limite de 10 tickets/);
  });

  it("quota de tickets : la création d'un ticket est refusée au plafond de l'offre", () => {
    const ahmed = userId("ahmed@koti.demo");
    const tid = createTontine(ctxFor(ahmed), { ...base, multipleTicketsAllowed: true, maxTicketsPerMember: 20, expectedMemberCount: 5 });
    const adminMember = read((s) => s.tontineMembers.find((m) => m.tontineId === tid && m.userId === ahmed)!.id);
    tx((s) => {
      s.subscriptions.find((x) => x.userId === ahmed)!.planId = "FREE"; // simule un retour au gratuit (limite 10 tickets)
    });
    // 1 ticket existant + 9 créations = 10 ; la 10e création dépasse.
    for (let i = 0; i < 9; i++) createTicket(ctxFor(ahmed), { tontineId: tid, memberId: adminMember });
    expect(() => createTicket(ctxFor(ahmed), { tontineId: tid, memberId: adminMember })).toThrow(/limite de 10 tickets/);
  });
});

describe("Abonnement — changement d'offre et facturation (simulée)", () => {
  it("première offre payante : essai de 14 jours sans facture, puis facturation mensuelle idempotente", () => {
    const id = newClient();
    const t0 = new Date("2026-01-10T09:00:00Z");
    changePlan(ctxFor(id, t0), "PRO");
    let acc = getAccount(ctxFor(id, t0));
    expect(acc.subscription).toMatchObject({ planId: "PRO", status: "TRIAL", trialUsed: true });
    expect(acc.invoices).toHaveLength(0);
    expect(acc.trialDaysLeft).toBe(14);

    // Avant la fin de l'essai : rien. Après : première facture, puis une par mois.
    tx((s) => void runBilling(s, new Date("2026-01-20T09:00:00Z")));
    expect(read((s) => s.invoices.filter((i) => i.userId === id).length)).toBe(0);
    tx((s) => void runBilling(s, new Date("2026-01-25T09:00:00Z")));
    expect(getAccount(ctxFor(id)).invoices).toHaveLength(1);
    tx((s) => void runBilling(s, new Date("2026-03-30T09:00:00Z")));
    tx((s) => void runBilling(s, new Date("2026-03-30T09:00:00Z"))); // rejouée : aucun doublon
    acc = getAccount(ctxFor(id));
    expect(acc.invoices.map((i) => [i.periodStart, i.amount, i.planName]).reverse()).toEqual([
      ["2026-01-24", 5000, "Organisateur"],
      ["2026-02-24", 5000, "Organisateur"],
      ["2026-03-24", 5000, "Organisateur"],
    ]);
    expect(new Set(acc.invoices.map((i) => i.number)).size).toBe(3);
    expect(acc.subscription!.status).toBe("ACTIVE");
  });

  it("après un essai déjà consommé, le retour sur une offre payante est facturé tout de suite", () => {
    const id = newClient();
    changePlan(ctxFor(id), "PRO");
    changePlan(ctxFor(id), "FREE");
    expect(getAccount(ctxFor(id)).subscription).toMatchObject({ planId: "FREE", status: "ACTIVE" });
    expect(getAccount(ctxFor(id)).subscription!.canceledAt).not.toBeNull();
    changePlan(ctxFor(id), "PRO");
    const acc = getAccount(ctxFor(id));
    expect(acc.subscription!.status).toBe("ACTIVE");
    expect(acc.invoices).toHaveLength(1);
    expect(acc.invoices[0]).toMatchObject({ amount: 5000, planId: "PRO" });
  });

  it("refuse une offre qui ne couvre pas l'usage, en listant ce qui dépasse", () => {
    const ahmed = userId("ahmed@koti.demo");
    expect(() => changePlan(ctxFor(ahmed), "FREE")).toThrow(/ne couvre pas votre usage.*tontines en cours/);
    expect(() => changePlan(ctxFor(ahmed), "PRO")).toThrow(/déjà sur cette offre/);
    expect(getAccount(ctxFor(ahmed)).blockers.FREE.length).toBeGreaterThan(0);
    expect(getAccount(ctxFor(ahmed)).blockers.ASSOCIATION).toEqual([]);
  });

  it("les factures de la démonstration sont datées de leur période, dans l'ordre et sans doublon", () => {
    const ahmed = userId("ahmed@koti.demo");
    const invoices = read((s) => s.invoices.filter((i) => i.userId === ahmed));
    expect(invoices.length).toBeGreaterThanOrEqual(3);
    expect(new Set(invoices.map((i) => i.periodStart)).size).toBe(invoices.length);
    expect(invoices.every((i) => i.issuedAt.slice(0, 10) <= T && i.amount === 5000)).toBe(true);
    runScheduledJobs(new Date(), { force: true });
    expect(read((s) => s.invoices.filter((i) => i.userId === ahmed).length)).toBe(invoices.length);
  });

  it("addMonths gère les fins de mois", () => {
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonths("2028-01-31", 1)).toBe("2028-02-29");
    expect(addMonths("2026-12-15", 1)).toBe("2027-01-15");
  });
});

describe("Compte suspendu", () => {
  it("refuse la connexion même avec le bon mot de passe", () => {
    const id = newClient();
    expect(authenticate("client1@exemple.ci", "Motdepasse1")).toBe(id);
    tx((s) => {
      s.users.find((u) => u.id === id)!.status = "SUSPENDED";
    });
    expect(() => authenticate("client1@exemple.ci", "Motdepasse1")).toThrow(/suspendu/);
    expect(authenticate("client1@exemple.ci", "mauvais")).toBeNull();
  });
});

describe("Migration v4 → v5", () => {
  it("attribue la plus petite offre qui couvre l'usage, sans modifier les données", () => {
    const v4 = read((s) => structuredClone(s)) as any;
    delete v4.subscriptions;
    delete v4.invoices;
    for (const u of v4.users) {
      delete u.platformRole;
      delete u.status;
    }
    v4.version = 4;
    const snapshot = structuredClone(v4);
    const out = migrateV4ToV5(v4) as any;
    expect(v4).toEqual(snapshot);
    expect(out.version).toBe(5);
    expect(out.invoices).toEqual([]);
    expect(out.users.every((u: any) => u.platformRole === "USER" && u.status === "ACTIVE")).toBe(true);
    const planOfUser = (email: string) => out.subscriptions.find((x: any) => x.userId === out.users.find((u: any) => u.email === email).id).planId;
    expect(planOfUser("ahmed@koti.demo")).toBe("PRO"); // 3 tontines dont une à tickets multiples
    expect(planOfUser("yao@koti.demo")).toBe("FREE");
    expect(out.subscriptions).toHaveLength(out.users.length);
    // Hors ajouts (rôle, statut, abonnements), les données sont strictement identiques.
    for (const k of ["tontines", "tontineMembers", "tontineTickets", "contributionObligations", "payments", "rotationSlots", "auditLogs"]) expect(out[k]).toEqual(snapshot[k]);
    // Aucun utilisateur n'est bloqué : son offre couvre son usage actuel.
    for (const sub of out.subscriptions) {
      const plan = PLANS.find((p) => p.id === sub.planId)!;
      const owned = out.tontines.filter((t: any) => t.creatorId === sub.userId && ["DRAFT", "ACTIVE", "PAUSED"].includes(t.status));
      expect(owned.length).toBeLessThanOrEqual(plan.limits.tontines);
    }
  });
});

describe("Quotas — parcours existants non régressés", () => {
  it("un membre invité garde son parcours : accepter une invitation ne dépend pas de son offre", () => {
    const ahmed = userId("ahmed@koti.demo");
    const tid = createTontine(ctxFor(ahmed), base);
    const { token } = createInvitation(ctxFor(ahmed), { tontineId: tid, email: "awa@koti.demo", phone: null });
    expect(() => acceptInvitation(ctxFor(userId("awa@koti.demo")), { token })).not.toThrow();
  });
});
