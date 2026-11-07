/* eslint-disable @typescript-eslint/no-explicit-any -- formes JSON héritées (v2) manipulées volontairement sans typage */
import { beforeEach, describe, expect, it } from "vitest";
import { addDays, todayISO } from "@/lib/utils/dates";
import { acceptInvitation, createInvitation } from "@/modules/invitations/invitation.service";
import { listMembers } from "@/modules/members/member.service";
import { declarePayment, listTontineObligations, validatePayment } from "@/modules/payments/payment.service";
import { listRotation, reorderRotation } from "@/modules/rotations/rotation.service";
import { createTicket, deleteTicket } from "@/modules/tickets/ticket.service";
import { changeTontineStatus, createTontine, getTontineOverview, listMyTontines } from "@/modules/tontines/tontine.service";
import { ctxFor } from "@/server/context";
import "@/server/db/seed";
import { migrateV2ToV3 } from "@/server/db/migrations";
import { read, resetDatabase } from "@/server/db/store";
import { runScheduledJobs } from "@/server/jobs";

const userId = (email: string) => read((s) => s.users.find((u) => u.email === email)!.id);
const T = todayISO();
beforeEach(() => resetDatabase());

const ahmed = () => userId("ahmed@koti.demo");
const mariam = () => userId("mariam@koti.demo");

function tontine(over: Partial<Parameters<typeof createTontine>[1]> = {}) {
  return createTontine(ctxFor(ahmed()), {
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
  });
}

function join(tid: string, who: string) {
  const { token } = createInvitation(ctxFor(ahmed()), { tontineId: tid, email: `${who}@koti.demo`, phone: null });
  acceptInvitation(ctxFor(userId(`${who}@koti.demo`)), { token });
  return read((s) => s.tontineMembers.find((m) => m.tontineId === tid && m.userId === userId(`${who}@koti.demo`))!.id);
}

const ticketsOf = (tid: string, memberId: string) => read((s) => s.tontineTickets.filter((t) => t.tontineId === tid && t.memberId === memberId && t.status === "ACTIVE"));
const adminMember = (tid: string) => read((s) => s.tontineMembers.find((m) => m.tontineId === tid && m.userId === ahmed())!.id);

describe("Tickets — création et plafond", () => {
  it("1. un seul ticket quand les tickets multiples sont désactivés", () => {
    const tid = tontine({ multipleTicketsAllowed: false, maxTicketsPerMember: 5 });
    const m = join(tid, "mariam");
    expect(read((s) => s.tontines.find((t) => t.id === tid)!.maxTicketsPerMember)).toBe(1);
    expect(ticketsOf(tid, m)).toHaveLength(1);
    expect(() => createTicket(ctxFor(ahmed()), { tontineId: tid, memberId: m })).toThrow(/pas autorisés/);
    expect(ticketsOf(tid, m)).toHaveLength(1);
  });

  it("2. un membre peut avoir deux tickets quand le maximum est trois", () => {
    const tid = tontine();
    const m = join(tid, "mariam");
    createTicket(ctxFor(ahmed()), { tontineId: tid, memberId: m });
    expect(ticketsOf(tid, m)).toHaveLength(2);
    // Une seule adhésion malgré deux tickets, et une seule ligne dans la liste des membres.
    const { members } = listMembers(ctxFor(ahmed()), tid);
    expect(members.filter((x) => x.id === m)).toHaveLength(1);
    expect(members.find((x) => x.id === m)).toMatchObject({ ticketCount: 2, perPeriodAmount: 20_000 });
  });

  it("3. le plafond ne peut pas être dépassé", () => {
    const tid = tontine({ maxTicketsPerMember: 2 });
    const m = join(tid, "mariam");
    createTicket(ctxFor(ahmed()), { tontineId: tid, memberId: m });
    expect(() => createTicket(ctxFor(ahmed()), { tontineId: tid, memberId: m })).toThrow(/maximum de 2/);
  });

  it("4. seul l'administrateur peut créer un ticket", () => {
    const tid = tontine();
    const m = join(tid, "mariam");
    expect(() => createTicket(ctxFor(mariam()), { tontineId: tid, memberId: m })).toThrow(/droits/);
    expect(() => createTicket(ctxFor(userId("awa@koti.demo")), { tontineId: tid, memberId: m })).toThrow(/introuvable/i);
    expect(ticketsOf(tid, m)).toHaveLength(1);
  });

  it("5. aucun ticket ne peut être créé ni supprimé après le démarrage", () => {
    const tid = tontine();
    const m = join(tid, "mariam");
    createTicket(ctxFor(ahmed()), { tontineId: tid, memberId: m });
    changeTontineStatus(ctxFor(ahmed()), tid, "activate");
    expect(() => createTicket(ctxFor(ahmed()), { tontineId: tid, memberId: m })).toThrow(/avant le démarrage/);
    const ticket = ticketsOf(tid, m)[0]!;
    expect(() => deleteTicket(ctxFor(ahmed()), { tontineId: tid, ticketId: ticket.id })).toThrow(/après le démarrage/);
  });

  it("12. deux créations concurrentes ne peuvent pas dépasser le plafond", async () => {
    const tid = tontine({ maxTicketsPerMember: 2 });
    const m = join(tid, "mariam");
    const attempt = () => Promise.resolve().then(() => createTicket(ctxFor(ahmed()), { tontineId: tid, memberId: m }));
    const results = await Promise.allSettled([attempt(), attempt()]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(ticketsOf(tid, m)).toHaveLength(2);
  });

  it("suppression avant démarrage : trace conservée, numéro jamais réutilisé, ticket initial protégé", () => {
    const tid = tontine();
    const m = join(tid, "mariam");
    const second = createTicket(ctxFor(ahmed()), { tontineId: tid, memberId: m });
    deleteTicket(ctxFor(ahmed()), { tontineId: tid, ticketId: second });
    const deleted = read((s) => s.tontineTickets.find((t) => t.id === second)!);
    expect(deleted.deletedAt).not.toBeNull();
    expect(read((s) => s.auditLogs.some((a) => a.action === "ticket.delete" && a.entityId === second))).toBe(true);
    const third = createTicket(ctxFor(ahmed()), { tontineId: tid, memberId: m });
    expect(read((s) => s.tontineTickets.find((t) => t.id === third)!.ticketNumber)).toBeGreaterThan(deleted.ticketNumber);
    // Le dernier ticket d'un membre ne se supprime pas.
    const only = ticketsOf(tid, adminMember(tid))[0]!;
    expect(() => deleteTicket(ctxFor(ahmed()), { tontineId: tid, ticketId: only.id })).toThrow(/au moins un ticket/);
    // Les positions restent contiguës.
    const positions = listRotation(ctxFor(ahmed()), tid).rows.map((r) => r.position);
    expect(positions).toEqual(positions.map((_, i) => i + 1));
  });
});

describe("Tickets — obligations, paiements et rotation", () => {
  function started() {
    const tid = tontine({ expectedMemberCount: 3 });
    const m = join(tid, "mariam");
    createTicket(ctxFor(ahmed()), { tontineId: tid, memberId: m });
    createTicket(ctxFor(ahmed()), { tontineId: tid, memberId: m });
    join(tid, "awa");
    changeTontineStatus(ctxFor(ahmed()), tid, "activate");
    return { tid, m };
  }

  it("6. chaque ticket génère une obligation par période, sans doublon", () => {
    const { tid } = started();
    const check = () =>
      read((s) => {
        const tickets = s.tontineTickets.filter((t) => t.tontineId === tid && t.status === "ACTIVE");
        const obligations = s.contributionObligations.filter((o) => o.tontineId === tid);
        // Un membre inscrit après la date de début ne doit pas les périodes déjà échues : on compte les périodes réellement facturées.
        const billed = new Set(obligations.map((o) => o.periodId));
        const keys = obligations.map((o) => `${o.periodId}:${o.ticketId}`);
        return { tickets: tickets.length, periods: billed.size, obligations: obligations.length, unique: new Set(keys).size, keys: keys.length };
      });
    const first = check();
    expect(first.tickets).toBe(5); // ahmed 1 + mariam 3 + awa 1
    expect(first.periods).toBeGreaterThan(0);
    expect(first.obligations).toBe(first.tickets * first.periods);
    expect(first.unique).toBe(first.keys);
    // 11. idempotence : rejouer la génération ne crée rien.
    runScheduledJobs(new Date(), { force: true });
    runScheduledJobs(new Date(), { force: true });
    expect(check()).toEqual(first);
  });

  it("7. payer un ticket ne valide pas les autres tickets du membre", () => {
    const { tid, m } = started();
    const all = listTontineObligations(ctxFor(mariam()), tid).rows;
    const period = all[0]!.periodNumber;
    const rows = all.filter((r) => r.periodNumber === period);
    expect(rows).toHaveLength(3);
    expect(new Set(rows.map((r) => r.ticketId)).size).toBe(3);
    const target = rows[0]!;
    const pid = declarePayment(ctxFor(mariam()), { obligationId: target.id, amount: target.expectedAmount, paymentDate: T, paymentMethod: "CASH", reference: "", comment: "" });
    validatePayment(ctxFor(ahmed()), pid);
    const after = listTontineObligations(ctxFor(mariam()), tid).rows.filter((r) => r.periodNumber === period);
    expect(after.find((r) => r.id === target.id)!.status).toBe("PAID");
    expect(after.filter((r) => r.id !== target.id).every((r) => r.status !== "PAID" && r.status !== "DECLARED")).toBe(true);
    expect(read((s) => s.contributionObligations.filter((o) => o.memberId === m && o.status === "PAID").length)).toBe(1);
  });

  it("8. chaque ticket reçoit exactement un tour dans le cycle initial", () => {
    const { tid } = started();
    read((s) => {
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

  it("9. un membre avec trois tickets apparaît trois fois dans la rotation", () => {
    const { tid } = started();
    const rows = listRotation(ctxFor(ahmed()), tid).rows;
    expect(rows.filter((r) => r.name === "Mariam Koné")).toHaveLength(3);
    expect(new Set(rows.filter((r) => r.name === "Mariam Koné").map((r) => r.ticketLabel)).size).toBe(3);
    const mine = listRotation(ctxFor(mariam()), tid);
    expect(mine.mySlots).toHaveLength(3);
    // Cagnotte = cotisation × nombre total de tickets.
    expect(rows[0]!.potAmount).toBe(5 * 10_000);
  });

  it("la rotation se réorganise par ticket et l'ensemble reste complet", () => {
    const tid = tontine();
    const m = join(tid, "mariam");
    createTicket(ctxFor(ahmed()), { tontineId: tid, memberId: m });
    const before = listRotation(ctxFor(ahmed()), tid).rows;
    const reversed = [...before].reverse().map((r) => r.ticketId);
    reorderRotation(ctxFor(ahmed()), { tontineId: tid, ticketIds: reversed });
    expect(listRotation(ctxFor(ahmed()), tid).rows.map((r) => r.ticketId)).toEqual(reversed);
    expect(() => reorderRotation(ctxFor(ahmed()), { tontineId: tid, ticketIds: reversed.slice(1) })).toThrow(/modifié/);
  });

  it("le cycle compte un tour par ticket au démarrage et le tableau de bord reflète les tickets", () => {
    const { tid } = started();
    const o = getTontineOverview(ctxFor(ahmed()), tid);
    expect(o.ticketCount).toBe(5);
    expect(o.admin!.expectedPerPeriod).toBe(50_000);
    expect(o.admin!.contributionPerTicket).toBe(10_000);
    expect(o.memberCount).toBe(3);
    const card = listMyTontines(ctxFor(mariam())).find((c) => c.id === tid)!;
    expect(card).toMatchObject({ myTicketCount: 3, myPerPeriod: 30_000, ticketCount: 5 });
  });

  it("après le démarrage, un nouveau membre ne peut pas obtenir de ticket (cycle figé)", () => {
    const { tid } = started();
    expect(() => createInvitation(ctxFor(ahmed()), { tontineId: tid, email: "koffi@koti.demo", phone: null })).toThrow(/complète|place|attribués/);
  });
});

describe("Migration v2 → v3", () => {
  function legacyFromSeed() {
    const v3 = read((s) => structuredClone(s)) as unknown as Record<string, unknown> & { tontineTickets: unknown; rotationCycles: unknown };
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

  it("10. conserve obligations, paiements et tours à l'identique et les rattache à un ticket initial", () => {
    const { v2, original } = legacyFromSeed();
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

  it("s'arrête avec un message précis plutôt que de deviner", () => {
    const { v2 } = legacyFromSeed();
    v2.contributionObligations[0].memberId = "inconnu";
    expect(() => migrateV2ToV3(v2)).toThrow(/Migration v2→v3 interrompue/);

    const { v2: v2b } = legacyFromSeed();
    const live = v2b.rotationSlots.find((x: any) => x.status !== "CANCELLED");
    v2b.rotationSlots.push({ ...live, id: "doublon" });
    expect(() => migrateV2ToV3(v2b)).toThrow(/plusieurs tours non annulés/);
  });
});
