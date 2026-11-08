import { beforeEach, describe, expect, it } from "vitest";
import { contactSchema } from "@/lib/validations";
import { PLANS } from "@/lib/marketing/plans";
import { migrateV3ToV4 } from "@/server/db/migrations";
import type { DbState } from "@/server/db/store";
import * as pg from "@/server/pg/services";
import { afterAll, beforeAll } from "vitest";
import { useConnection, type Connection } from "@/server/db/client";
import { hasTestDb, openTestDb } from "./helpers";
import { resetWithDemo, snapshot } from "./pg-harness";

let conn: Connection;
const snap = <T,>(fn: (s: DbState) => T) => snapshot(conn, fn);

describe.skipIf(!hasTestDb)("Parité PostgreSQL : vitrine.test.ts", () => {
beforeAll(async () => { conn = await openTestDb(); useConnection(conn); });
afterAll(async () => { useConnection(null); await conn?.close(); });

beforeEach(async () => { await resetWithDemo(conn); });

const valid = { name: "Awa Diallo", email: "awa@exemple.ci", phone: "", topic: "QUESTION" as const, message: "Bonjour, je voudrais organiser une tontine." };

describe("Site vitrine — formulaire de contact", () => {
  it("enregistre un message valide avec le statut NEW", async () => {
    (await pg.submitContactRequest(valid));
    const saved = await snap((s) => s.contactRequests);
    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({ email: "awa@exemple.ci", status: "NEW", topic: "QUESTION" });
  });

  it("ignore en silence un message dont le piège à robots est rempli", async () => {
    (await pg.submitContactRequest({ ...valid, website: "http://spam.example" }));
    expect(await snap((s) => s.contactRequests)).toHaveLength(0);
  });

  it("limite à 3 messages par heure et par adresse e-mail", async () => {
    const now = new Date();
    for (let i = 0; i < 3; i++) (await pg.submitContactRequest(valid, now));
    await expect((async () => (await pg.submitContactRequest(valid, now)))()).rejects.toThrow(/récemment/);
    expect(await snap((s) => s.contactRequests)).toHaveLength(3);
    // Une autre adresse n'est pas concernée ; une heure plus tard non plus.
    (await pg.submitContactRequest({ ...valid, email: "autre@exemple.ci" }, now));
    (await pg.submitContactRequest(valid, new Date(now.getTime() + 3600_000 + 1000)));
    expect(await snap((s) => s.contactRequests)).toHaveLength(5);
  });

  it("valide les entrées côté serveur (e-mail, message trop court, sujet inconnu)", async () => {
    expect(contactSchema.safeParse(valid).success).toBe(true);
    expect(contactSchema.safeParse({ ...valid, email: "pas-un-email" }).success).toBe(false);
    expect(contactSchema.safeParse({ ...valid, message: "court" }).success).toBe(false);
    expect(contactSchema.safeParse({ ...valid, topic: "HACK" }).success).toBe(false);
    expect(contactSchema.safeParse({ ...valid, phone: "abc" }).success).toBe(false);
  });
});

describe("Offres", () => {
  it("les quotas croissent d'une offre à l'autre et un seul plan est mis en avant", async () => {
    const [free, pro, assoc] = PLANS;
    expect(free!.monthlyPrice).toBe(0);
    for (const k of ["tontines", "membersPerTontine", "ticketsPerTontine"] as const) {
      expect(pro!.limits[k]).toBeGreaterThan(free!.limits[k]);
      expect(assoc!.limits[k]).toBeGreaterThan(pro!.limits[k]);
    }
    expect(PLANS.filter((p) => p.highlighted)).toHaveLength(1);
  });
});

describe("Migration v3 → v4", () => {
  it("ajoute les messages de contact sans toucher aux données existantes", async () => {
    const v3 = await snap((s) => structuredClone(s)) as unknown as Record<string, unknown>;
    delete v3.contactRequests;
    v3.version = 3;
    const snapshot = structuredClone(v3);
    const out = migrateV3ToV4(v3) as unknown as Record<string, unknown>;
    expect(v3).toEqual(snapshot);
    expect(out.version).toBe(4);
    expect(out.contactRequests).toEqual([]);
    // Hors version et contactRequests, tout est strictement identique à l'état d'origine.
    const strip = (o: Record<string, unknown>) => Object.fromEntries(Object.entries(o).filter(([k]) => k !== "version" && k !== "contactRequests"));
    expect(strip(out)).toEqual(strip(snapshot));
  });
});

});
