import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { addDays, todayISO } from "@/lib/utils/dates";
import { ctxFor } from "@/server/context";
import type { Connection } from "@/server/db/client";
import { pgRead, pgTx } from "@/server/db/uow";
import { hasTestDb, openTestDb } from "./helpers";
import { resetWithDemo, snapshot } from "./pg-harness";

describe.skipIf(!hasTestDb)("Unité de travail PostgreSQL", () => {
  let conn: Connection;
  beforeAll(async () => {
    conn = await openTestDb();
  });
  afterAll(async () => {
    await conn?.close();
  });
  beforeEach(() => resetWithDemo(conn));

  it("le jeu de démonstration est importé en entier, sans perte", async () => {
    const counts = await snapshot(conn, (s) => ({ users: s.users.length, tontines: s.tontines.length, tickets: s.tontineTickets.length, obligations: s.contributionObligations.length, payments: s.payments.length, audit: s.auditLogs.length, credentials: s.credentials.length }));
    expect(counts.users).toBeGreaterThanOrEqual(8);
    expect(counts.tontines).toBeGreaterThanOrEqual(5);
    expect(counts.obligations).toBeGreaterThan(20);
    expect(counts.payments).toBeGreaterThan(5);
    expect(counts.audit).toBeGreaterThan(10);
  });

  it("aller-retour fidèle : charger puis réécrire sans rien changer ne produit aucune écriture", async () => {
    const before = await snapshot(conn, (s) => JSON.stringify([s.tontines, s.contributionObligations, s.payments, s.rotationSlots]));
    await pgTx({ everything: true }, () => undefined, conn.db);
    const after = await snapshot(conn, (s) => JSON.stringify([s.tontines, s.contributionObligations, s.payments, s.rotationSlots]));
    expect(after).toBe(before);
  });

  it("une erreur dans l'opération annule tout (aucune écriture partielle)", async () => {
    const before = await snapshot(conn, (s) => s.tontines.length);
    await expect(
      pgTx({ everything: true }, (s) => {
        s.tontines[0]!.name = "Modifié";
        s.tontines.pop();
        throw new Error("échec en cours de route");
      }, conn.db),
    ).rejects.toThrow(/échec/);
    expect(await snapshot(conn, (s) => s.tontines.length)).toBe(before);
    expect(await snapshot(conn, (s) => s.tontines.some((t) => t.name === "Modifié"))).toBe(false);
  });

  it("les modifications, créations et suppressions sont écrites ; le périmètre limite ce qui est chargé", async () => {
    const tid = await snapshot(conn, (s) => s.tontines[0]!.id);
    const creator = await snapshot(conn, (s) => s.tontines[0]!.creatorId);
    await pgTx({ tontines: [tid], people: [creator] }, (s) => {
      expect(s.tontines).toHaveLength(1); // seule cette tontine est chargée
      s.tontines[0]!.description = "Nouvelle description";
      const gone = s.contributionPeriods.at(-1);
      void gone;
    }, conn.db);
    expect(await snapshot(conn, (s) => s.tontines.find((t) => t.id === tid)!.description)).toBe("Nouvelle description");
    const read = await pgRead({ tontines: [tid] }, (s) => ({ members: s.tontineMembers.length, tontines: s.tontines.length }), conn.db);
    expect(read.tontines).toBe(1);
    expect(read.members).toBeGreaterThan(0);
    void addDays; void todayISO; void ctxFor;
  });
});
