 
import { beforeEach, describe, expect, it } from "vitest";
import { addDays, todayISO } from "@/lib/utils/dates";
import { addMonths, runBilling } from "@/modules/billing/billing.service";
import { assertMemberCapacity, assertTicketCapacity } from "@/modules/billing/quota";
import { ctxFor } from "@/server/context";
import type { DbState } from "@/server/db/store";
import * as pg from "@/server/pg/services";
import { afterAll, beforeAll } from "vitest";
import { useConnection, type Connection } from "@/server/db/client";
import { pgTx } from "@/server/db/uow";
import { hasTestDb, openTestDb } from "./helpers";
import { resetWithDemo, snapshot } from "./pg-harness";

let conn: Connection;
let demo: DbState;
const snap = <T,>(fn: (s: DbState) => T) => snapshot(conn, fn);
const txn = <T,>(fn: (s: DbState) => T) => pgTx({ everything: true }, fn, conn.db);

describe.skipIf(!hasTestDb)("Parité PostgreSQL : billing.test.ts", () => {
beforeAll(async () => { conn = await openTestDb(); useConnection(conn); });
afterAll(async () => { useConnection(null); await conn?.close(); });

const T = todayISO();
const userId = (email: string) => demo.users.find((u) => u.email === email)!.id;
beforeEach(async () => { demo = await resetWithDemo(conn); });

const base = { name: "Tontine Quota", description: "", contributionAmount: 10_000, frequency: "WEEKLY" as const, startDate: addDays(T, 7), expectedMemberCount: 5, rotationMode: "MANUAL" as const };

/** Nouveau client (offre gratuite) : s'inscrit puis renvoie son identifiant. */
async function newClient(n = 1) {
  return (await pg.signUp({ fullName: `Client ${n}`, email: `client${n}@exemple.ci`, phone: `+22507000000${n}${n}`, password: "Motdepasse1" }));
}

describe("Offres — abonnement et rôle plateforme", () => {
  it("un nouveau compte reçoit l'offre gratuite, le rôle USER et le statut ACTIVE", async () => {
    const id = (await newClient());
    const s = await snap((st) => ({ user: st.users.find((u) => u.id === id)!, sub: st.subscriptions.find((x) => x.userId === id)! }));
    expect(s.user).toMatchObject({ platformRole: "USER", status: "ACTIVE" });
    expect(s.sub).toMatchObject({ planId: "FREE", status: "ACTIVE", trialUsed: false });
    expect(await snap((st) => st.users.filter((u) => u.platformRole === "SUPER_ADMIN").map((u) => u.email))).toEqual(["operateur@koti.demo"]);
  });

  it("l'offre gratuite limite à une tontine en cours ; une clôturée libère la place", async () => {
    const id = (await newClient());
    const first = (await pg.createTontine(ctxFor(id), base));
    await expect((async () => (await pg.createTontine(ctxFor(id), base)))()).rejects.toThrow(/permet 1 tontine/);
    (await pg.changeTontineStatus(ctxFor(id), first, "close", "Plus nécessaire")); // brouillon → annulée
    await expect((async () => { (await pg.createTontine(ctxFor(id), base)); })()).resolves.toBeUndefined();
  });

  it("l'offre gratuite refuse les tickets multiples et plus de 10 membres", async () => {
    const id = (await newClient());
    await expect((async () => (await pg.createTontine(ctxFor(id), { ...base, multipleTicketsAllowed: true, maxTicketsPerMember: 2 })))()).rejects.toThrow(/tickets multiples/);
    await expect((async () => (await pg.createTontine(ctxFor(id), { ...base, expectedMemberCount: 11 })))()).rejects.toThrow(/10 membres/);
    const tid = (await pg.createTontine(ctxFor(id), { ...base, expectedMemberCount: 10 }));
    await expect((async () => (await pg.updateTontine(ctxFor(id), { tontineId: tid, name: "Nom", description: "", financial: { ...base, expectedMemberCount: 12, multipleTicketsAllowed: false } })))()).rejects.toThrow(/10 membres/);
  });

  it("l'offre Organisateur (Ahmed) permet plusieurs tontines et les tickets multiples", async () => {
    const ahmed = userId("ahmed@koti.demo");
    expect((await pg.getAccount(ctxFor(ahmed))).plan.id).toBe("PRO");
    await expect((async () => { (await pg.createTontine(ctxFor(ahmed), { ...base, multipleTicketsAllowed: true, maxTicketsPerMember: 3 })); })()).resolves.toBeUndefined();
  });

  it("les plafonds de membres et de tickets protègent aussi une tontine déjà trop grande", async () => {
    const ahmed = userId("ahmed@koti.demo");
    const s = await snap((st) => structuredClone(st));
    const famille = s.tontines.find((t) => t.name === "Tontine Famille")!;
    s.subscriptions.find((x) => x.userId === ahmed)!.planId = "FREE";
    await expect((async () => { assertMemberCapacity(s, famille); })()).resolves.toBeUndefined(); // 8 membres < 10
    for (let i = 0; i < 2; i++) s.tontineMembers.push({ ...s.tontineMembers.find((m) => m.tontineId === famille.id)!, id: `x${i}` });
    await expect((async () => assertMemberCapacity(s, famille))()).rejects.toThrow(/limite de 10 membres/);
    const t0 = s.tontineTickets.find((t) => t.tontineId === famille.id)!;
    for (let i = 0; i < 3; i++) s.tontineTickets.push({ ...t0, id: `tk${i}` });
    await expect((async () => assertTicketCapacity(s, famille))()).rejects.toThrow(/limite de 10 tickets/);
  });

  it("quota de tickets : la création d'un ticket est refusée au plafond de l'offre", async () => {
    const ahmed = userId("ahmed@koti.demo");
    const tid = (await pg.createTontine(ctxFor(ahmed), { ...base, multipleTicketsAllowed: true, maxTicketsPerMember: 20, expectedMemberCount: 5 }));
    const adminMember = await snap((s) => s.tontineMembers.find((m) => m.tontineId === tid && m.userId === ahmed)!.id);
    await txn((s) => {
      s.subscriptions.find((x) => x.userId === ahmed)!.planId = "FREE"; // simule un retour au gratuit (limite 10 tickets)
    });
    // 1 ticket existant + 9 créations = 10 ; la 10e création dépasse.
    for (let i = 0; i < 9; i++) (await pg.createTicket(ctxFor(ahmed), { tontineId: tid, memberId: adminMember }));
    await expect((async () => (await pg.createTicket(ctxFor(ahmed), { tontineId: tid, memberId: adminMember })))()).rejects.toThrow(/limite de 10 tickets/);
  });
});

describe("Abonnement — changement d'offre et facturation (simulée)", () => {
  it("première offre payante : essai de 14 jours sans facture, puis facturation mensuelle idempotente", async () => {
    const id = (await newClient());
    const t0 = new Date("2026-01-10T09:00:00Z");
    (await pg.changePlan(ctxFor(id, t0), "PRO"));
    let acc = (await pg.getAccount(ctxFor(id, t0)));
    expect(acc.subscription).toMatchObject({ planId: "PRO", status: "TRIAL", trialUsed: true });
    expect(acc.invoices).toHaveLength(0);
    expect(acc.trialDaysLeft).toBe(14);

    // Avant la fin de l'essai : rien. Après : première facture, puis une par mois.
    await txn((s) => void runBilling(s, new Date("2026-01-20T09:00:00Z")));
    expect(await snap((s) => s.invoices.filter((i) => i.userId === id).length)).toBe(0);
    await txn((s) => void runBilling(s, new Date("2026-01-25T09:00:00Z")));
    expect((await pg.getAccount(ctxFor(id))).invoices).toHaveLength(1);
    await txn((s) => void runBilling(s, new Date("2026-03-30T09:00:00Z")));
    await txn((s) => void runBilling(s, new Date("2026-03-30T09:00:00Z"))); // rejouée : aucun doublon
    acc = (await pg.getAccount(ctxFor(id)));
    expect(acc.invoices.map((i) => [i.periodStart, i.amount, i.planName]).reverse()).toEqual([
      ["2026-01-24", 5000, "Organisateur"],
      ["2026-02-24", 5000, "Organisateur"],
      ["2026-03-24", 5000, "Organisateur"],
    ]);
    expect(new Set(acc.invoices.map((i) => i.number)).size).toBe(3);
    expect(acc.subscription!.status).toBe("ACTIVE");
  });

  it("après un essai déjà consommé, le retour sur une offre payante est facturé tout de suite", async () => {
    const id = (await newClient());
    (await pg.changePlan(ctxFor(id), "PRO"));
    (await pg.changePlan(ctxFor(id), "FREE"));
    expect((await pg.getAccount(ctxFor(id))).subscription).toMatchObject({ planId: "FREE", status: "ACTIVE" });
    expect((await pg.getAccount(ctxFor(id))).subscription!.canceledAt).not.toBeNull();
    (await pg.changePlan(ctxFor(id), "PRO"));
    const acc = (await pg.getAccount(ctxFor(id)));
    expect(acc.subscription!.status).toBe("ACTIVE");
    expect(acc.invoices).toHaveLength(1);
    expect(acc.invoices[0]).toMatchObject({ amount: 5000, planId: "PRO" });
  });

  it("refuse une offre qui ne couvre pas l'usage, en listant ce qui dépasse", async () => {
    const ahmed = userId("ahmed@koti.demo");
    await expect((async () => (await pg.changePlan(ctxFor(ahmed), "FREE")))()).rejects.toThrow(/ne couvre pas votre usage.*tontines en cours/);
    await expect((async () => (await pg.changePlan(ctxFor(ahmed), "PRO")))()).rejects.toThrow(/déjà sur cette offre/);
    expect((await pg.getAccount(ctxFor(ahmed))).blockers.FREE.length).toBeGreaterThan(0);
    expect((await pg.getAccount(ctxFor(ahmed))).blockers.ASSOCIATION).toEqual([]);
  });

  it("les factures de la démonstration sont datées de leur période, dans l'ordre et sans doublon", async () => {
    const ahmed = userId("ahmed@koti.demo");
    const invoices = await snap((s) => s.invoices.filter((i) => i.userId === ahmed));
    expect(invoices.length).toBeGreaterThanOrEqual(3);
    expect(new Set(invoices.map((i) => i.periodStart)).size).toBe(invoices.length);
    expect(invoices.every((i) => i.issuedAt.slice(0, 10) <= T && i.amount === 5000)).toBe(true);
    (await pg.runScheduledJobs(new Date(), { force: true }));
    expect(await snap((s) => s.invoices.filter((i) => i.userId === ahmed).length)).toBe(invoices.length);
  });

  it("addMonths gère les fins de mois", async () => {
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonths("2028-01-31", 1)).toBe("2028-02-29");
    expect(addMonths("2026-12-15", 1)).toBe("2027-01-15");
  });
});

describe("Compte suspendu", () => {
  it("refuse la connexion même avec le bon mot de passe", async () => {
    const id = (await newClient());
    expect((await pg.authenticate("client1@exemple.ci", "Motdepasse1"))).toBe(id);
    await txn((s) => {
      s.users.find((u) => u.id === id)!.status = "SUSPENDED";
    });
    await expect((async () => (await pg.authenticate("client1@exemple.ci", "Motdepasse1")))()).rejects.toThrow(/suspendu/);
    expect((await pg.authenticate("client1@exemple.ci", "mauvais"))).toBeNull();
  });
});
describe("Quotas — parcours existants non régressés", () => {
  it("un membre invité garde son parcours : accepter une invitation ne dépend pas de son offre", async () => {
    const ahmed = userId("ahmed@koti.demo");
    const tid = (await pg.createTontine(ctxFor(ahmed), base));
    const { token } = (await pg.createInvitation(ctxFor(ahmed), { tontineId: tid, email: "awa@koti.demo", phone: null }));
    await expect((async () => { (await pg.acceptInvitation(ctxFor(userId("awa@koti.demo")), { token })); })()).resolves.toBeUndefined();
  });
});

});
