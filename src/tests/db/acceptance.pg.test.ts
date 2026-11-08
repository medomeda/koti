import { beforeEach, describe, expect, it } from "vitest";
import { addDays, todayISO } from "@/lib/utils/dates";
import { ctxFor } from "@/server/context";
import type { DbState } from "@/server/db/store";
import * as pg from "@/server/pg/services";
import { afterAll, beforeAll } from "vitest";
import { useConnection, type Connection } from "@/server/db/client";
import { hasTestDb, openTestDb } from "./helpers";
import { resetWithDemo, snapshot } from "./pg-harness";

let conn: Connection;
let demo: DbState;
const snap = <T,>(fn: (s: DbState) => T) => snapshot(conn, fn);

describe.skipIf(!hasTestDb)("Parité PostgreSQL : acceptance.test.ts", () => {
beforeAll(async () => { conn = await openTestDb(); useConnection(conn); });
afterAll(async () => { useConnection(null); await conn?.close(); });

const userId = (email: string) => demo.users.find((u) => u.email === email)!.id;
const T = todayISO();

beforeEach(async () => { demo = await resetWithDemo(conn); });

async function newTontine(owner: string, overrides: Partial<Parameters<typeof pg.createTontine>[1]> = {}) {
  return (await pg.createTontine(ctxFor(owner), {
    name: "Tontine Test",
    description: "",
    contributionAmount: 10_000,
    frequency: "WEEKLY",
    startDate: addDays(T, -1),
    expectedMemberCount: 4,
    rotationMode: "MANUAL",
    ...overrides,
  }));
}

describe("Scénario 1 — création", () => {
  it("un nouvel utilisateur crée une tontine et en devient administrateur", async () => {
    const id = (await pg.signUp({ fullName: "Nouvel Utilisateur", email: "nouveau@test.ci", phone: "+2250600000001", password: "Secret123" }));
    expect((await pg.authenticate("nouveau@test.ci", "Secret123"))).toBe(id);
    expect((await pg.authenticate("nouveau@test.ci", "mauvais"))).toBeNull();
    const tid = (await newTontine(id, { name: "Tontine Famille" }));
    const cards = (await pg.listMyTontines(ctxFor(id)));
    expect(cards).toHaveLength(1);
    expect(cards[0]).toMatchObject({ id: tid, role: "ADMIN", memberCount: 1, status: "DRAFT" });
  });

  it("refuse un e-mail déjà utilisé", async () => {
    await expect((async () => (await pg.signUp({ fullName: "Doublon", email: "ahmed@koti.demo", phone: "+2250600000002", password: "Secret123" })))()).rejects.toThrow(/existe déjà/);
  });
});

describe("Scénario 2 — invitation", () => {
  it("l'invitée accepte et devient membre ; le jeton n'est utilisable qu'une fois", async () => {
    const ahmed = userId("ahmed@koti.demo");
    const mariam = userId("mariam@koti.demo");
    const tid = (await newTontine(ahmed));
    const { token } = (await pg.createInvitation(ctxFor(ahmed), { tontineId: tid, email: "mariam@koti.demo", phone: null }));
    expect((await pg.previewInvitation(token))?.status).toBe("PENDING");
    expect((await pg.listMyInvitations(ctxFor(mariam))).some((i) => i.tontineName === "Tontine Test")).toBe(true);
    (await pg.acceptInvitation(ctxFor(mariam), { token }));
    expect((await pg.listMembers(ctxFor(mariam), tid)).members.map((m) => m.name)).toContain("Mariam Koné");
    await expect((async () => (await pg.acceptInvitation(ctxFor(mariam), { token })))()).rejects.toThrow();
    expect(await snap((s) => s.invitations.every((i) => i.tokenHash !== token))).toBe(true);
  });

  it("un autre compte ne peut pas utiliser l'invitation", async () => {
    const ahmed = userId("ahmed@koti.demo");
    const tid = (await newTontine(ahmed));
    const { token } = (await pg.createInvitation(ctxFor(ahmed), { tontineId: tid, email: "mariam@koti.demo", phone: null }));
    await expect((async () => (await pg.acceptInvitation(ctxFor(userId("awa@koti.demo")), { token })))()).rejects.toThrow(/autre contact/);
  });

  it("une invitation expirée est refusée", async () => {
    const ahmed = userId("ahmed@koti.demo");
    const tid = (await newTontine(ahmed));
    const { token } = (await pg.createInvitation(ctxFor(ahmed), { tontineId: tid, email: "mariam@koti.demo", phone: null }));
    const later = new Date(Date.now() + 8 * 86_400_000);
    await expect((async () => (await pg.acceptInvitation(ctxFor(userId("mariam@koti.demo"), later), { token })))()).rejects.toThrow(/expiré/);
  });

  it("un membre ne peut pas inviter ; refus d'invitation notifié à l'admin", async () => {
    const ahmed = userId("ahmed@koti.demo");
    const mariam = userId("mariam@koti.demo");
    const tid = (await newTontine(ahmed));
    const { token } = (await pg.createInvitation(ctxFor(ahmed), { tontineId: tid, email: "mariam@koti.demo", phone: null }));
    (await pg.acceptInvitation(ctxFor(mariam), { token }));
    await expect((async () => (await pg.createInvitation(ctxFor(mariam), { tontineId: tid, email: "awa@koti.demo", phone: null })))()).rejects.toThrow(/droits/);
    const inv2 = (await pg.createInvitation(ctxFor(ahmed), { tontineId: tid, email: "awa@koti.demo", phone: null }));
    (await pg.refuseInvitation(ctxFor(userId("awa@koti.demo")), { token: inv2.token }));
    expect((await pg.listNotifications(ctxFor(ahmed))).some((n) => n.type === "INVITATION_REFUSED")).toBe(true);
  });
});

describe("Scénarios 3 & 4 — paiement, validation, refus", () => {
  async function setup() {
    const ahmed = userId("ahmed@koti.demo");
    const mariam = userId("mariam@koti.demo");
    const tid = (await newTontine(ahmed));
    const { token } = (await pg.createInvitation(ctxFor(ahmed), { tontineId: tid, email: "mariam@koti.demo", phone: null }));
    (await pg.acceptInvitation(ctxFor(mariam), { token }));
    (await pg.changeTontineStatus(ctxFor(ahmed), tid, "activate"));
    const obligation = (await pg.listTontineObligations(ctxFor(mariam), tid)).rows[0]!;
    return { ahmed, mariam, tid, obligation };
  }
  const declare = async (who: string, obligationId: string) =>
    (await pg.declarePayment(ctxFor(who), { obligationId, amount: 10_000, paymentDate: T, paymentMethod: "MOBILE_MONEY", reference: "MM1", comment: "" }));

  it("déclaration → DECLARED → validation → PAID, avec notifications", async () => {
    const { ahmed, mariam, tid, obligation } = (await setup());
    // Mariam a rejoint après le démarrage : elle ne doit que les échéances postérieures à son adhésion.
    expect((await pg.listTontineObligations(ctxFor(mariam), tid)).rows.every((r) => r.dueDate >= T)).toBe(true);
    expect(obligation.status).toBe("PENDING");
    const pid = (await declare(mariam, obligation.id));
    expect((await pg.listTontineObligations(ctxFor(mariam), tid)).rows[0]!.status).toBe("DECLARED");
    expect((await pg.listNotifications(ctxFor(ahmed))).some((n) => n.type === "PAYMENT_DECLARED" && n.resourceId === pid)).toBe(true);
    await expect((async () => (await declare(mariam, obligation.id)))()).rejects.toThrow(/déjà en attente/);
    (await pg.validatePayment(ctxFor(ahmed), pid));
    await expect((async () => (await pg.validatePayment(ctxFor(ahmed), pid)))()).rejects.toThrow(/déjà été traité/);
    expect((await pg.listTontineObligations(ctxFor(mariam), tid)).rows[0]!.status).toBe("PAID");
    expect((await pg.listNotifications(ctxFor(mariam))).some((n) => n.type === "PAYMENT_VALIDATED")).toBe(true);
  });

  it("refus avec motif, nouvelle déclaration, historique conservé", async () => {
    const { ahmed, mariam, obligation } = (await setup());
    const p1 = (await declare(mariam, obligation.id));
    (await pg.rejectPayment(ctxFor(ahmed), { paymentId: p1, reason: "Référence introuvable" }));
    expect((await pg.listNotifications(ctxFor(mariam))).some((n) => n.type === "PAYMENT_REJECTED")).toBe(true);
    const p2 = (await declare(mariam, obligation.id));
    (await pg.validatePayment(ctxFor(ahmed), p2));
    const history = (await pg.getObligationHistory(ctxFor(mariam), obligation.id));
    expect(history.map((h) => h.status)).toEqual(["PAID", "REJECTED"]);
    expect(history[1]!.rejectionReason).toBe("Référence introuvable");
  });

  it("un membre ne peut ni valider ni déclarer pour autrui ; date future interdite", async () => {
    const { ahmed, mariam, tid } = (await setup());
    const ahmedObligation = (await pg.listTontineObligations(ctxFor(ahmed), tid)).rows.find((r) => r.memberName === "Ahmed Traoré")!;
    await expect((async () => (await declare(mariam, ahmedObligation.id)))()).rejects.toThrow(/introuvable/);
    const pid = (await declare(ahmed, ahmedObligation.id));
    await expect((async () => (await pg.validatePayment(ctxFor(mariam), pid)))()).rejects.toThrow(/droits/);
    const mine = (await pg.listTontineObligations(ctxFor(mariam), tid)).rows[0]!;
    await expect((async () => (await pg.declarePayment(ctxFor(mariam), { obligationId: mine.id, amount: 10_000, paymentDate: addDays(T, 2), paymentMethod: "CASH", reference: "", comment: "" })))()).rejects.toThrow(/futur/);
  });
});

describe("Scénario 5 — plusieurs tontines", () => {
  it("Ahmed voit ses tontines avec le bon rôle dans chacune", async () => {
    const cards = (await pg.listMyTontines(ctxFor(userId("ahmed@koti.demo"))));
    const byName = Object.fromEntries(cards.map((c) => [c.name, c.role]));
    expect(byName["Tontine Famille"]).toBe("ADMIN");
    expect(byName["Tontine des Amies"]).toBe("MEMBER");
    expect(byName["Projet Tabaski 2027"]).toBe("ADMIN");
    expect(cards.length).toBeGreaterThanOrEqual(5);
  });
});

describe("Scénario 6 — cloisonnement", () => {
  it("un non-membre n'accède à aucune donnée d'une tontine, même avec son identifiant", async () => {
    const koffi = userId("koffi@koti.demo");
    const amies = (await pg.listMyTontines(ctxFor(userId("mariam@koti.demo")))).find((c) => c.name === "Tontine des Amies")!.id;
    await expect((async () => (await pg.getTontineOverview(ctxFor(koffi), amies)))()).rejects.toThrow(/introuvable/);
    await expect((async () => (await pg.listMembers(ctxFor(koffi), amies)))()).rejects.toThrow(/introuvable/);
    await expect((async () => (await pg.listTontineObligations(ctxFor(koffi), amies)))()).rejects.toThrow(/introuvable/);
    await expect((async () => (await pg.listRotation(ctxFor(koffi), amies)))()).rejects.toThrow(/introuvable/);
    await expect((async () => (await pg.updateTontine(ctxFor(koffi), { tontineId: amies, name: "Piratée", description: "" })))()).rejects.toThrow(/introuvable/);
  });

  it("un membre retiré perd l'accès mais son historique est conservé", async () => {
    const ahmed = userId("ahmed@koti.demo");
    const seydou = userId("seydou@koti.demo");
    const famille = (await pg.listMyTontines(ctxFor(ahmed))).find((c) => c.name === "Tontine Famille")!.id;
    // Seydou passe en dernier : son tour est à venir et doit être annulé.
    const removed = (await pg.listMembers(ctxFor(ahmed), famille)).members.find((m) => m.name === "Seydou Coulibaly")!;
    const paidBefore = await snap((s) => s.payments.filter((p) => s.contributionObligations.find((o) => o.id === p.obligationId)?.memberId === removed.id).length);
    (await pg.removeMember(ctxFor(ahmed), { tontineId: famille, memberId: removed.id, reason: "Départ volontaire" }));
    await expect((async () => (await pg.getTontineOverview(ctxFor(seydou), famille)))()).rejects.toThrow();
    expect(await snap((s) => s.payments.filter((p) => s.contributionObligations.find((o) => o.id === p.obligationId)?.memberId === removed.id).length)).toBe(paidBefore);
    expect((await pg.listRotation(ctxFor(ahmed), famille)).rows.find((r) => r.memberId === removed.id)?.status).toBe("CANCELLED");
  });
});

describe("Scénario 7 — paiements personnels", () => {
  it("la page Paiements ne contient que les obligations de l'utilisateur", async () => {
    const mariam = userId("mariam@koti.demo");
    const myMemberIds = await snap((s) => new Set(s.tontineMembers.filter((m) => m.userId === mariam).map((m) => m.id)));
    const { toPay, pending, history } = (await pg.listMyObligations(ctxFor(mariam)));
    for (const row of [...toPay, ...pending, ...history]) expect(myMemberIds.has(row.memberId)).toBe(true);
    const famille = (await pg.listMyTontines(ctxFor(mariam))).find((c) => c.name === "Tontine Famille")!.id;
    const { rows, stats } = (await pg.listTontineObligations(ctxFor(mariam), famille));
    expect(stats).toBeNull();
    expect(rows.every((r) => r.memberName === "Mariam Koné")).toBe(true);
  });
});

describe("Scénario 8 — tours de main", () => {
  it("ordre unique, dates cohérentes, réorganisation libre en brouillon", async () => {
    const ahmed = userId("ahmed@koti.demo");
    const tid = (await newTontine(ahmed, { startDate: addDays(T, 10) }));
    for (const who of ["mariam", "awa", "koffi"]) {
      const { token } = (await pg.createInvitation(ctxFor(ahmed), { tontineId: tid, email: `${who}@koti.demo`, phone: null }));
      (await pg.acceptInvitation(ctxFor(userId(`${who}@koti.demo`)), { token }));
    }
    const before = (await pg.listRotation(ctxFor(ahmed), tid)).rows;
    const reversed = [...before].reverse().map((r) => r.ticketId);
    (await pg.reorderRotation(ctxFor(ahmed), { tontineId: tid, ticketIds: reversed }));
    const after = (await pg.listRotation(ctxFor(ahmed), tid)).rows;
    expect(after.map((r) => r.ticketId)).toEqual(reversed);
    expect(new Set(after.map((r) => r.position)).size).toBe(after.length);
    expect(after.map((r) => r.scheduledDate)).toEqual([0, 7, 14, 21].map((d) => addDays(addDays(T, 10), d)));
    await expect((async () => (await pg.reorderRotation(ctxFor(userId("mariam@koti.demo")), { tontineId: tid, ticketIds: reversed })))()).rejects.toThrow(/droits/);
  });

  it("après démarrage : motif obligatoire et tours passés figés", async () => {
    const ahmed = userId("ahmed@koti.demo");
    const famille = (await pg.listMyTontines(ctxFor(ahmed))).find((c) => c.name === "Tontine Famille")!.id;
    const rows = (await pg.listRotation(ctxFor(ahmed), famille)).rows;
    const upcoming = rows.filter((r) => r.status === "UPCOMING").map((r) => r.ticketId);
    await expect((async () => (await pg.reorderRotation(ctxFor(ahmed), { tontineId: famille, ticketIds: [...upcoming].reverse() })))()).rejects.toThrow(/motif/i);
    await expect((async () => (await pg.reorderRotation(ctxFor(ahmed), { tontineId: famille, ticketIds: rows.map((r) => r.ticketId) })))()).rejects.toThrow(/modifié/);
    (await pg.reorderRotation(ctxFor(ahmed), { tontineId: famille, ticketIds: [...upcoming].reverse(), reason: "Demande d'Aminata" }));
    const after = (await pg.listRotation(ctxFor(ahmed), famille)).rows;
    expect(after.filter((r) => r.status === "COMPLETED").map((r) => r.ticketId)).toEqual(rows.filter((r) => r.status === "COMPLETED").map((r) => r.ticketId));
  });
});

describe("Échéances et tâches planifiées", () => {
  it("la génération est idempotente et les rappels ne sont pas dupliqués", async () => {
    const count = async () => await snap((s) => [s.contributionObligations.length, s.notifications.length]);
    const before = (await count());
    (await pg.runScheduledJobs(new Date(), { force: true }));
    (await pg.runScheduledJobs(new Date(), { force: true }));
    expect((await count())).toEqual(before);
  });

  it("une tontine suspendue ne génère plus d'échéances", async () => {
    const ahmed = userId("ahmed@koti.demo");
    const tid = (await newTontine(ahmed, { startDate: addDays(T, -1) }));
    (await pg.changeTontineStatus(ctxFor(ahmed), tid, "activate"));
    (await pg.changeTontineStatus(ctxFor(ahmed), tid, "pause"));
    const n = await snap((s) => s.contributionObligations.filter((o) => o.tontineId === tid).length);
    (await pg.runScheduledJobs(new Date(Date.now() + 30 * 86_400_000), { force: true }));
    expect(await snap((s) => s.contributionObligations.filter((o) => o.tontineId === tid).length)).toBe(n);
  });

  it("les paramètres financiers sont verrouillés après démarrage", async () => {
    const ahmed = userId("ahmed@koti.demo");
    const famille = (await pg.listMyTontines(ctxFor(ahmed))).find((c) => c.name === "Tontine Famille")!.id;
    await expect((async () => (await pg.updateTontine(ctxFor(ahmed), { tontineId: famille, name: "X Famille", description: "", financial: { name: "X", description: "", contributionAmount: 1, frequency: "WEEKLY", startDate: T, expectedMemberCount: 3, rotationMode: "MANUAL" } })))()).rejects.toThrow(/verrouillés/);
  });

  it("une transaction en échec n'écrit rien (rollback)", async () => {
    const ahmed = userId("ahmed@koti.demo");
    const before = await snap((s) => s.auditLogs.length);
    await expect((async () => (await pg.changeTontineStatus(ctxFor(ahmed), "00000000-0000-4000-8000-000000000000", "pause")))()).rejects.toThrow();
    expect(await snap((s) => s.auditLogs.length)).toBe(before);
  });
});

});
