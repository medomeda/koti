import { sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { transaction, type Connection, type Executor } from "@/server/db/client";
import * as t from "@/server/db/schema";
import { hasTestDb, openTestDb, resetTestDb } from "./helpers";

/**
 * Tests d'intégration du schéma PostgreSQL : les règles métier sont-elles vraiment garanties PAR LA BASE,
 * même si un service se trompe ? (Ignorés si DATABASE_URL_TEST est absent.)
 */
describe.skipIf(!hasTestDb)("Schéma PostgreSQL — règles garanties par la base", () => {
  let conn: Connection;
  const db = () => conn.db;

  beforeAll(async () => {
    conn = await openTestDb();
  });
  afterAll(async () => {
    await conn?.close();
  });
  beforeEach(() => resetTestDb(conn));

  /** Une tontine active avec un membre, un ticket, une échéance et son obligation. */
  async function scene(ex: Executor = db()) {
    const [owner] = await ex.insert(t.users).values({ email: "ahmed@test.ci" }).returning();
    const [tontine] = await ex.insert(t.tontines).values({ name: "Famille", contributionAmount: 10000, frequency: "MONTHLY", startDate: "2026-11-01", expectedMemberCount: 3, creatorId: owner!.id }).returning();
    const [member] = await ex.insert(t.tontineMembers).values({ tontineId: tontine!.id, userId: owner!.id, role: "ADMIN", joinedAt: new Date() }).returning();
    const [ticket] = await ex.insert(t.tontineTickets).values({ tontineId: tontine!.id, memberId: member!.id, ticketNumber: 1, createdBy: owner!.id }).returning();
    const [period] = await ex.insert(t.contributionPeriods).values({ tontineId: tontine!.id, periodNumber: 1, dueDate: "2026-11-01" }).returning();
    const [obligation] = await ex.insert(t.contributionObligations).values({ tontineId: tontine!.id, periodId: period!.id, memberId: member!.id, ticketId: ticket!.id, expectedAmount: 10000, dueDate: "2026-11-01" }).returning();
    return { owner: owner!, tontine: tontine!, member: member!, ticket: ticket!, period: period!, obligation: obligation! };
  }

  const rejects = async (p: PromiseLike<unknown>, pattern: RegExp) => {
    let message = "";
    try {
      await p;
    } catch (e) {
      const err = e as { message?: string; cause?: { message?: string; constraint?: string } };
      message = `${err.message ?? ""} ${err.cause?.message ?? ""} ${err.cause?.constraint ?? ""}`;
    }
    expect(message).toMatch(pattern);
  };

  it("dates et instants : AAAA-MM-JJ en chaîne, instants en Date UTC, montants entiers", async () => {
    const s = await scene();
    const [row] = await db().select().from(t.contributionObligations);
    expect(row!.dueDate).toBe("2026-11-01");
    const [m] = await db().select().from(t.tontineMembers);
    expect(m!.joinedAt).toBeInstanceOf(Date);
    expect(row!.expectedAmount).toBe(10000);
    expect(s.tontine.pauses).toEqual([]);
  });

  it("une obligation par ticket et par période", async () => {
    const s = await scene();
    await rejects(db().insert(t.contributionObligations).values({ tontineId: s.tontine.id, periodId: s.period.id, memberId: s.member.id, ticketId: s.ticket.id, expectedAmount: 10000, dueDate: "2026-11-01" }), /period_ticket_unique/);
  });

  it("un numéro de ticket est unique par tontine", async () => {
    const s = await scene();
    await rejects(db().insert(t.tontineTickets).values({ tontineId: s.tontine.id, memberId: s.member.id, ticketNumber: 1, createdBy: s.owner.id }), /tontine_tickets_number_unique/);
  });

  it("une seule adhésion par personne et par tontine", async () => {
    const s = await scene();
    await rejects(db().insert(t.tontineMembers).values({ tontineId: s.tontine.id, userId: s.owner.id, joinedAt: new Date() }), /tontine_members_tontine_user_unique/);
  });

  it("un seul tour de main actif par ticket (un tour annulé ne bloque pas)", async () => {
    const s = await scene();
    const slot = { tontineId: s.tontine.id, memberId: s.member.id, ticketId: s.ticket.id };
    await db().insert(t.rotationSlots).values({ ...slot, position: 1 });
    await rejects(db().insert(t.rotationSlots).values({ ...slot, position: 2 }), /one_live_per_ticket/);
    await db().update(t.rotationSlots).set({ status: "CANCELLED" });
    await expect(db().insert(t.rotationSlots).values({ ...slot, position: 2 })).resolves.toBeDefined();
  });

  it("une seule déclaration ouverte par obligation, refaisable après un refus", async () => {
    const s = await scene();
    const pay = { obligationId: s.obligation.id, amount: 10000, paymentDate: "2026-11-01", paymentMethod: "CASH" as const, declaredBy: s.owner.id };
    await db().insert(t.payments).values(pay);
    await rejects(db().insert(t.payments).values(pay), /one_open_per_obligation/);
    await db().update(t.payments).set({ status: "REJECTED" });
    await expect(db().insert(t.payments).values(pay)).resolves.toBeDefined();
  });

  it("montants strictement positifs et tontine d'au moins 2 membres", async () => {
    const s = await scene();
    await rejects(db().insert(t.payments).values({ obligationId: s.obligation.id, amount: 0, paymentDate: "2026-11-01", paymentMethod: "CASH", declaredBy: s.owner.id }), /payments_amount_positive/);
    await rejects(db().insert(t.tontines).values({ name: "Seul", contributionAmount: 1000, frequency: "WEEKLY", startDate: "2026-11-01", expectedMemberCount: 1, creatorId: s.owner.id }), /tontines_members_positive/);
  });

  it("e-mail unique sans tenir compte de la casse ; téléphone unique", async () => {
    await scene();
    await rejects(db().insert(t.users).values({ email: "AHMED@test.ci" }), /users_email_unique/);
    const [a] = await db().insert(t.users).values({ email: "a@test.ci" }).returning();
    const [b] = await db().insert(t.users).values({ email: "b@test.ci" }).returning();
    await db().insert(t.userProfiles).values({ userId: a!.id, fullName: "A", phone: "+2250700000001" });
    await rejects(db().insert(t.userProfiles).values({ userId: b!.id, fullName: "B", phone: "+2250700000001" }), /user_profiles_phone_unique/);
  });

  it("rappels sans doublon (clé d'idempotence), mais sans clé : autant que voulu", async () => {
    const s = await scene();
    const n = { userId: s.owner.id, type: "DUE_SOON" as const, title: "Rappel", message: "Échéance proche" };
    await db().insert(t.notifications).values({ ...n, dedupeKey: "due:1" });
    await rejects(db().insert(t.notifications).values({ ...n, dedupeKey: "due:1" }), /notifications_dedupe_unique/);
    await expect(db().insert(t.notifications).values([n, n])).resolves.toBeDefined();
  });

  it("une facture par abonnement et par période ; numéro de facture unique", async () => {
    const s = await scene();
    const [sub] = await db().insert(t.subscriptions).values({ userId: s.owner.id, planId: "PRO", startedAt: new Date() }).returning();
    const inv = { userId: s.owner.id, subscriptionId: sub!.id, number: "KOTI-2026-0001", planId: "PRO" as const, planName: "Organisateur", amount: 5000, periodStart: "2026-11-01", periodEnd: "2026-11-30", issuedAt: new Date() };
    await db().insert(t.invoices).values(inv);
    await rejects(db().insert(t.invoices).values({ ...inv, number: "KOTI-2026-0002" }), /invoices_period_unique/);
    await rejects(db().insert(t.invoices).values({ ...inv, periodStart: "2026-12-01", periodEnd: "2026-12-31" }), /invoices_number_unique/);
    await rejects(db().insert(t.subscriptions).values({ userId: s.owner.id, planId: "FREE", startedAt: new Date() }), /subscriptions_user_unique/);
  });

  it("le journal d'audit est en ajout seul : modification, suppression et vidage refusés", async () => {
    const s = await scene();
    await db().insert(t.auditLogs).values({ actorId: s.owner.id, action: "test", entityType: "test" });
    await rejects(db().update(t.auditLogs).set({ action: "falsifié" }), /ajout seul/);
    await rejects(db().delete(t.auditLogs), /ajout seul/);
    await rejects(db().execute(sql`truncate audit_logs`), /ajout seul/);
    expect(await db().select().from(t.auditLogs)).toHaveLength(1);
  });

  it("transaction : tout est annulé si une étape échoue", async () => {
    await expect(
      transaction(async (tx) => {
        await scene(tx);
        throw new Error("échec simulé au milieu");
      }, db()),
    ).rejects.toThrow(/échec simulé/);
    expect(await db().select().from(t.users)).toHaveLength(0);
    expect(await db().select().from(t.tontines)).toHaveLength(0);
  });

  it("transaction : deux créations simultanées de ticket ne dépassent pas le plafond (SELECT … FOR UPDATE)", async () => {
    const s = await scene();
    await db().update(t.tontines).set({ multipleTicketsAllowed: true, maxTicketsPerMember: 2 });
    // Modèle du futur service : verrouiller la tontine, compter, puis insérer.
    const addTicket = () =>
      transaction(async (tx) => {
        const [tontine] = await tx.select().from(t.tontines).where(sql`${t.tontines.id} = ${s.tontine.id}`).for("update");
        const [counted] = await tx.select({ n: sql<number>`count(*)::int` }).from(t.tontineTickets).where(sql`${t.tontineTickets.memberId} = ${s.member.id} and ${t.tontineTickets.status} = 'ACTIVE'`);
        if (counted!.n >= tontine!.maxTicketsPerMember) return "REFUSÉ";
        await new Promise((r) => setTimeout(r, 50)); // laisse l'autre transaction tenter sa chance
        await tx.insert(t.tontineTickets).values({ tontineId: s.tontine.id, memberId: s.member.id, ticketNumber: tontine!.nextTicketNumber + 1, createdBy: s.owner.id });
        await tx.update(t.tontines).set({ nextTicketNumber: tontine!.nextTicketNumber + 1 }).where(sql`${t.tontines.id} = ${s.tontine.id}`);
        return "OK";
      }, db());
    const results = await Promise.all([addTicket(), addTicket(), addTicket()]);
    expect(results.filter((r) => r === "OK")).toHaveLength(1); // 1 ticket existant + 1 créé = plafond de 2
    expect(await db().select().from(t.tontineTickets)).toHaveLength(2);
  });
});
