/* eslint-disable @typescript-eslint/no-explicit-any -- formes JSON héritées (v2) manipulées volontairement sans typage */
import { beforeEach, describe, expect, it } from "vitest";
import { addDays, todayISO } from "@/lib/utils/dates";
import { ctxFor } from "@/server/context";
import { migrateV2ToV3 } from "@/server/db/migrations";
import type { DbState } from "@/server/db/store";
import * as pg from "@/server/pg/services";
import { afterAll, beforeAll } from "vitest";
import { useConnection, type Connection } from "@/server/db/client";
import { hasTestDb, openTestDb } from "./helpers";
import { resetWithDemo, snapshot } from "./pg-harness";

let conn: Connection;
let demo: DbState;
const snap = <T,>(fn: (s: DbState) => T) => snapshot(conn, fn);

describe.skipIf(!hasTestDb)("Parité PostgreSQL : tickets.test.ts", () => {
beforeAll(async () => { conn = await openTestDb(); useConnection(conn); });
afterAll(async () => { useConnection(null); await conn?.close(); });

const userId = (email: string) => demo.users.find((u) => u.email === email)!.id;
const T = todayISO();
beforeEach(async () => { demo = await resetWithDemo(conn); });

const ahmed = () => userId("ahmed@koti.demo");
const mariam = async () => userId("mariam@koti.demo");

async function tontine(over: Partial<Parameters<typeof pg.createTontine>[1]> = {}) {
  return (await pg.createTontine(ctxFor(ahmed()), {
    name: "Tontine Tickets",
    description: "",
    contributionAmount: 10_000,
    frequency: "WEEKLY",
    startDate: addDays(T, -1),
    expectedMemberCount: 5,
    rotationMode: "MANUAL",
    multipleTicketsAllowed: true,
    maxTicketsPerMember: 3,
    ...over,
  }));
}

async function join(tid: string, who: string) {
  const { token } = (await pg.createInvitation(ctxFor(ahmed()), { tontineId: tid, email: `${who}@koti.demo`, phone: null }));
  (await pg.acceptInvitation(ctxFor(userId(`${who}@koti.demo`)), { token }));
  return await snap((s) => s.tontineMembers.find((m) => m.tontineId === tid && m.userId === userId(`${who}@koti.demo`))!.id);
}

const ticketsOf = async (tid: string, memberId: string) => await snap((s) => s.tontineTickets.filter((t) => t.tontineId === tid && t.memberId === memberId && t.status === "ACTIVE"));
const adminMember = async (tid: string) => await snap((s) => s.tontineMembers.find((m) => m.tontineId === tid && m.userId === ahmed())!.id);

describe("Tickets — création et plafond", () => {
  it("1. un seul ticket quand les tickets multiples sont désactivés", async () => {
    const tid = (await tontine({ multipleTicketsAllowed: false, maxTicketsPerMember: 5 }));
    const m = (await join(tid, "mariam"));
    expect(await snap((s) => s.tontines.find((t) => t.id === tid)!.maxTicketsPerMember)).toBe(1);
    expect((await ticketsOf(tid, m))).toHaveLength(1);
    await expect((async () => (await pg.createTicket(ctxFor(ahmed()), { tontineId: tid, memberId: m })))()).rejects.toThrow(/pas autorisés/);
    expect((await ticketsOf(tid, m))).toHaveLength(1);
  });

  it("2. un membre peut avoir deux tickets quand le maximum est trois", async () => {
    const tid = (await tontine());
    const m = (await join(tid, "mariam"));
    (await pg.createTicket(ctxFor(ahmed()), { tontineId: tid, memberId: m }));
    expect((await ticketsOf(tid, m))).toHaveLength(2);
    // Une seule adhésion malgré deux tickets, et une seule ligne dans la liste des membres.
    const { members } = (await pg.listMembers(ctxFor(ahmed()), tid));
    expect(members.filter((x) => x.id === m)).toHaveLength(1);
    expect(members.find((x) => x.id === m)).toMatchObject({ ticketCount: 2, perPeriodAmount: 20_000 });
  });

  it("3. le plafond ne peut pas être dépassé", async () => {
    const tid = (await tontine({ maxTicketsPerMember: 2 }));
    const m = (await join(tid, "mariam"));
    (await pg.createTicket(ctxFor(ahmed()), { tontineId: tid, memberId: m }));
    await expect((async () => (await pg.createTicket(ctxFor(ahmed()), { tontineId: tid, memberId: m })))()).rejects.toThrow(/maximum de 2/);
  });

  it("4. seul l'administrateur peut créer un ticket", async () => {
    const tid = (await tontine());
    const m = (await join(tid, "mariam"));
    await expect((async () => (await pg.createTicket(ctxFor((await mariam())), { tontineId: tid, memberId: m })))()).rejects.toThrow(/droits/);
    await expect((async () => (await pg.createTicket(ctxFor(userId("awa@koti.demo")), { tontineId: tid, memberId: m })))()).rejects.toThrow(/introuvable/i);
    expect((await ticketsOf(tid, m))).toHaveLength(1);
  });

  it("5. aucun ticket ne peut être créé ni supprimé après le démarrage", async () => {
    const tid = (await tontine());
    const m = (await join(tid, "mariam"));
    (await pg.createTicket(ctxFor(ahmed()), { tontineId: tid, memberId: m }));
    (await pg.changeTontineStatus(ctxFor(ahmed()), tid, "activate"));
    await expect((async () => (await pg.createTicket(ctxFor(ahmed()), { tontineId: tid, memberId: m })))()).rejects.toThrow(/avant le démarrage/);
    const ticket = (await ticketsOf(tid, m))[0]!;
    await expect((async () => (await pg.deleteTicket(ctxFor(ahmed()), { tontineId: tid, ticketId: ticket.id })))()).rejects.toThrow(/après le démarrage/);
  });

  it("12. deux créations concurrentes ne peuvent pas dépasser le plafond", async () => {
    const tid = (await tontine({ maxTicketsPerMember: 2 }));
    const m = (await join(tid, "mariam"));
    const attempt = () => pg.createTicket(ctxFor(ahmed()), { tontineId: tid, memberId: m });
    const results = await Promise.allSettled([attempt(), attempt()]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect((await ticketsOf(tid, m))).toHaveLength(2);
  });

  it("suppression avant démarrage : trace conservée, numéro jamais réutilisé, ticket initial protégé", async () => {
    const tid = (await tontine());
    const m = (await join(tid, "mariam"));
    const second = (await pg.createTicket(ctxFor(ahmed()), { tontineId: tid, memberId: m }));
    (await pg.deleteTicket(ctxFor(ahmed()), { tontineId: tid, ticketId: second }));
    const deleted = await snap((s) => s.tontineTickets.find((t) => t.id === second)!);
    expect(deleted.deletedAt).not.toBeNull();
    expect(await snap((s) => s.auditLogs.some((a) => a.action === "ticket.delete" && a.entityId === second))).toBe(true);
    const third = (await pg.createTicket(ctxFor(ahmed()), { tontineId: tid, memberId: m }));
    expect(await snap((s) => s.tontineTickets.find((t) => t.id === third)!.ticketNumber)).toBeGreaterThan(deleted.ticketNumber);
    // Le dernier ticket d'un membre ne se supprime pas.
    const only = (await ticketsOf(tid, (await adminMember(tid))))[0]!;
    await expect((async () => (await pg.deleteTicket(ctxFor(ahmed()), { tontineId: tid, ticketId: only.id })))()).rejects.toThrow(/au moins un ticket/);
    // Les positions restent contiguës.
    const positions = (await pg.listRotation(ctxFor(ahmed()), tid)).rows.map((r) => r.position);
    expect(positions).toEqual(positions.map((_, i) => i + 1));
  });
});

describe("Tickets — obligations, paiements et rotation", () => {
  async function started() {
    const tid = (await tontine({ expectedMemberCount: 3 }));
    const m = (await join(tid, "mariam"));
    (await pg.createTicket(ctxFor(ahmed()), { tontineId: tid, memberId: m }));
    (await pg.createTicket(ctxFor(ahmed()), { tontineId: tid, memberId: m }));
    (await join(tid, "awa"));
    (await pg.changeTontineStatus(ctxFor(ahmed()), tid, "activate"));
    return { tid, m };
  }

  it("6. chaque ticket génère une obligation par période, sans doublon", async () => {
    const { tid } = (await started());
    const check = () =>
      snap((s) => {
        const tickets = s.tontineTickets.filter((t) => t.tontineId === tid && t.status === "ACTIVE");
        const obligations = s.contributionObligations.filter((o) => o.tontineId === tid);
        // Un membre inscrit après la date de début ne doit pas les périodes déjà échues : on compte les périodes réellement facturées.
        const billed = new Set(obligations.map((o) => o.periodId));
        const keys = obligations.map((o) => `${o.periodId}:${o.ticketId}`);
        return { tickets: tickets.length, periods: billed.size, obligations: obligations.length, unique: new Set(keys).size, keys: keys.length };
      });
    const first = await check();
    expect(first.tickets).toBe(5); // ahmed 1 + mariam 3 + awa 1
    expect(first.periods).toBeGreaterThan(0);
    expect(first.obligations).toBe(first.tickets * first.periods);
    expect(first.unique).toBe(first.keys);
    // 11. idempotence : rejouer la génération ne crée rien.
    (await pg.runScheduledJobs(new Date(), { force: true }));
    (await pg.runScheduledJobs(new Date(), { force: true }));
    expect(await check()).toEqual(first);
  });

  it("7. payer un ticket ne valide pas les autres tickets du membre", async () => {
    const { tid, m } = (await started());
    const all = (await pg.listTontineObligations(ctxFor((await mariam())), tid)).rows;
    const period = all[0]!.periodNumber;
    const rows = all.filter((r) => r.periodNumber === period);
    expect(rows).toHaveLength(3);
    expect(new Set(rows.map((r) => r.ticketId)).size).toBe(3);
    const target = rows[0]!;
    const pid = (await pg.declarePayment(ctxFor((await mariam())), { obligationId: target.id, amount: target.expectedAmount, paymentDate: T, paymentMethod: "CASH", reference: "", comment: "" }));
    (await pg.validatePayment(ctxFor(ahmed()), pid));
    const after = (await pg.listTontineObligations(ctxFor((await mariam())), tid)).rows.filter((r) => r.periodNumber === period);
    expect(after.find((r) => r.id === target.id)!.status).toBe("PAID");
    expect(after.filter((r) => r.id !== target.id).every((r) => r.status !== "PAID" && r.status !== "DECLARED")).toBe(true);
    expect(await snap((s) => s.contributionObligations.filter((o) => o.memberId === m && o.status === "PAID").length)).toBe(1);
  });

  it("8. chaque ticket reçoit exactement un tour dans le cycle initial", async () => {
    const { tid } = (await started());
    await snap((s) => {
      const cycle = s.rotationCycles.find((c) => c.tontineId === tid)!;
      const tickets = s.tontineTickets.filter((t) => t.tontineId === tid && t.status === "ACTIVE");
      const slots = s.rotationSlots.filter((x) => x.tontineId === tid && x.status !== "CANCELLED");
      expect(cycle.size).toBe(tickets.length);
      expect(slots.every((x) => x.cycleId === cycle.id)).toBe(true);
      expect(new Set(slots.map((x) => x.ticketId)).size).toBe(tickets.length);
      expect(new Set(slots.map((x) => x.position)).size).toBe(tickets.length);
      expect(tickets.every((t) => slots.filter((x) => x.ticketId === t.id).length === 1)).toBe(true);
    });
  });

  it("9. un membre avec trois tickets apparaît trois fois dans la rotation", async () => {
    const { tid } = (await started());
    const rows = (await pg.listRotation(ctxFor(ahmed()), tid)).rows;
    expect(rows.filter((r) => r.name === "Mariam Koné")).toHaveLength(3);
    expect(new Set(rows.filter((r) => r.name === "Mariam Koné").map((r) => r.ticketLabel)).size).toBe(3);
    const mine = (await pg.listRotation(ctxFor((await mariam())), tid));
    expect(mine.mySlots).toHaveLength(3);
    // Cagnotte = cotisation × nombre total de tickets.
    expect(rows[0]!.potAmount).toBe(5 * 10_000);
  });

  it("la rotation se réorganise par ticket et l'ensemble reste complet", async () => {
    const tid = (await tontine());
    const m = (await join(tid, "mariam"));
    (await pg.createTicket(ctxFor(ahmed()), { tontineId: tid, memberId: m }));
    const before = (await pg.listRotation(ctxFor(ahmed()), tid)).rows;
    const reversed = [...before].reverse().map((r) => r.ticketId);
    (await pg.reorderRotation(ctxFor(ahmed()), { tontineId: tid, ticketIds: reversed }));
    expect((await pg.listRotation(ctxFor(ahmed()), tid)).rows.map((r) => r.ticketId)).toEqual(reversed);
    await expect((async () => (await pg.reorderRotation(ctxFor(ahmed()), { tontineId: tid, ticketIds: reversed.slice(1) })))()).rejects.toThrow(/modifié/);
  });

  it("le cycle compte un tour par ticket au démarrage et le tableau de bord reflète les tickets", async () => {
    const { tid } = (await started());
    const o = (await pg.getTontineOverview(ctxFor(ahmed()), tid));
    expect(o.ticketCount).toBe(5);
    expect(o.admin!.expectedPerPeriod).toBe(50_000);
    expect(o.admin!.contributionPerTicket).toBe(10_000);
    expect(o.memberCount).toBe(3);
    const card = (await pg.listMyTontines(ctxFor((await mariam())))).find((c) => c.id === tid)!;
    expect(card).toMatchObject({ myTicketCount: 3, myPerPeriod: 30_000, ticketCount: 5 });
  });

  it("après le démarrage, un nouveau membre ne peut pas obtenir de ticket (cycle figé)", async () => {
    const { tid } = (await started());
    await expect((async () => (await pg.createInvitation(ctxFor(ahmed()), { tontineId: tid, email: "koffi@koti.demo", phone: null })))()).rejects.toThrow(/complète|place|attribués/);
  });
});

describe("Migration v2 → v3", () => {
  async function legacyFromSeed() {
    const v3 = await snap((s) => structuredClone(s)) as unknown as Record<string, unknown> & { tontineTickets: unknown; rotationCycles: unknown };
    const v2 = structuredClone(v3) as Record<string, any>;
    delete v2.tontineTickets;
    delete v2.rotationCycles;
    v2.version = 2;
    for (const t of v2.tontines) {
      delete t.multipleTicketsAllowed;
      delete t.maxTicketsPerMember;
      delete t.nextTicketNumber;
    }
    // Le modèle v2 ne connaît qu'un tour par adhésion : on écarte les tickets supplémentaires du jeu de démonstration (brouillon).
    const extra = new Set(
      (v3.tontineTickets as Array<{ id: string; memberId: string; ticketNumber: number }>)
        .filter((tk) => (v3.tontineTickets as Array<{ memberId: string; ticketNumber: number }>).some((o) => o.memberId === tk.memberId && o.ticketNumber < tk.ticketNumber))
        .map((tk) => tk.id),
    );
    v2.rotationSlots = v2.rotationSlots.filter((sl: any) => !extra.has(sl.ticketId));
    for (const o of v2.contributionObligations) delete o.ticketId;
    for (const sl of v2.rotationSlots) {
      delete sl.ticketId;
      delete sl.cycleId;
    }
    return { v2, original: v3 as Record<string, any> };
  }

  it("10. conserve obligations, paiements et tours à l'identique et les rattache à un ticket initial", async () => {
    const { v2, original } = (await legacyFromSeed());
    const snapshot = structuredClone(v2);
    const out = migrateV2ToV3(v2) as unknown as Record<string, any>;
    expect(v2).toEqual(snapshot); // la source n'est pas modifiée
    expect(out.version).toBe(3);

    expect(out.tontineTickets).toHaveLength(v2.tontineMembers.length);
    expect(out.payments).toEqual(v2.payments);
    expect(out.auditLogs).toEqual(v2.auditLogs);
    expect(out.contributionPeriods).toEqual(v2.contributionPeriods);

    const strip = (o: Record<string, any>, keys: string[]) => Object.fromEntries(Object.entries(o).filter(([k]) => !keys.includes(k)));
    expect(out.contributionObligations.map((o: any) => strip(o, ["ticketId"]))).toEqual(v2.contributionObligations);
    expect(out.rotationSlots.map((o: any) => strip(o, ["ticketId", "cycleId"]))).toEqual(v2.rotationSlots);

    const memberOfTicket = new Map<string, string>(out.tontineTickets.map((t: any) => [t.id, t.memberId]));
    expect(out.contributionObligations.every((o: any) => memberOfTicket.get(o.ticketId) === o.memberId)).toBe(true);
    expect(out.rotationSlots.every((x: any) => memberOfTicket.get(x.ticketId) === x.memberId)).toBe(true);

    // Un ticket par adhésion, numéros uniques par tontine ; compteur prêt pour la suite.
    for (const t of out.tontines) {
      const tickets = out.tontineTickets.filter((x: any) => x.tontineId === t.id);
      expect(new Set(tickets.map((x: any) => x.ticketNumber)).size).toBe(tickets.length);
      expect(t.nextTicketNumber).toBe(tickets.length + 1);
      expect(t).toMatchObject({ multipleTicketsAllowed: false, maxTicketsPerMember: 1 });
      const started = ["ACTIVE", "PAUSED", "COMPLETED"].includes(t.status);
      expect(out.rotationCycles.some((c: any) => c.tontineId === t.id)).toBe(started);
    }
    // Les montants totaux (obligations) sont inchangés.
    const sum = (a: any[]) => a.reduce((n, o) => n + o.expectedAmount, 0);
    expect(sum(out.contributionObligations)).toBe(sum(original.contributionObligations));
  });

  it("s'arrête avec un message précis plutôt que de deviner", async () => {
    const { v2 } = (await legacyFromSeed());
    v2.contributionObligations[0].memberId = "inconnu";
    await expect((async () => migrateV2ToV3(v2))()).rejects.toThrow(/Migration v2→v3 interrompue/);

    const { v2: v2b } = (await legacyFromSeed());
    const live = v2b.rotationSlots.find((x: any) => x.status !== "CANCELLED");
    v2b.rotationSlots.push({ ...live, id: "doublon" });
    await expect((async () => migrateV2ToV3(v2b))()).rejects.toThrow(/plusieurs tours non annulés/);
  });
});

});
