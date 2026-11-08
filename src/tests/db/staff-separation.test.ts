import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { isBarredFromClientSpace, staffMayUseClientSpace } from "@/lib/permissions/platform";
import { ctxFor } from "@/server/context";
import { REALM_HEADER } from "@/server/auth";
import { useConnection, type Connection } from "@/server/db/client";
import { sessions } from "@/server/db/schema";
import * as pg from "@/server/pg/services";
import { hasTestDb, openTestDb } from "./helpers";
import { authFor, resetWithDemo } from "./pg-harness";
import type { DbState } from "@/server/db/store";

/** Option A : un compte de l'équipe KOTI n'a pas d'espace client ; deux portes de connexion distinctes. */
describe("Politique d'accès de l'équipe KOTI à l'espace client", () => {
  it("option A : aucun rôle d'équipe n'a d'espace client ; un client n'est jamais concerné", () => {
    expect(staffMayUseClientSpace("SUPPORT")).toBe(false);
    expect(staffMayUseClientSpace("SUPER_ADMIN")).toBe(false);
    expect(isBarredFromClientSpace("SUPPORT")).toBe(true);
    expect(isBarredFromClientSpace("SUPER_ADMIN")).toBe(true);
    expect(isBarredFromClientSpace("USER")).toBe(false);
    expect(isBarredFromClientSpace(null)).toBe(false);
  });
});

describe.skipIf(!hasTestDb)("Séparation équipe / clients sur PostgreSQL", () => {
  let conn: Connection;
  let demo: DbState;
  const id = (email: string) => demo.users.find((u) => u.email === email)!.id;
  beforeAll(async () => {
    conn = await openTestDb();
    useConnection(conn);
  });
  afterAll(async () => {
    useConnection(null);
    await conn?.close();
  });
  beforeEach(async () => {
    demo = await resetWithDemo(conn);
  });

  const signIn = (email: string, realm?: "admin" | "client") => {
    const headers = new Headers();
    if (realm) headers.set(REALM_HEADER, realm);
    return authFor(conn).api.signInEmail({ body: { email, password: "Koti2026" }, headers });
  };
  const sessionCount = async () => (await conn.db.select().from(sessions)).length;

  it("connexion client : un compte d'équipe est refusé, sans aucune session créée", async () => {
    await expect(signIn("operateur@koti.demo")).rejects.toMatchObject({ statusCode: 403, message: expect.stringContaining("administration") });
    await expect(signIn("support@koti.demo", "client")).rejects.toMatchObject({ statusCode: 403 });
    expect(await sessionCount()).toBe(0);
  });

  it("connexion administration : réservée à l'équipe ; un client reçoit l'erreur d'un mauvais mot de passe", async () => {
    const ok = await signIn("operateur@koti.demo", "admin");
    expect(ok.user.id).toBe(id("operateur@koti.demo"));
    expect(await sessionCount()).toBe(1);
    await expect(signIn("ahmed@koti.demo", "admin")).rejects.toMatchObject({ statusCode: 401, message: "E-mail ou mot de passe incorrect." });
    expect(await sessionCount()).toBe(1); // aucune session pour le client
  });

  it("connexion client : un client entre normalement ; sans en-tête d'espace, c'est l'espace client (jamais l'administration)", async () => {
    expect((await signIn("ahmed@koti.demo")).user.id).toBe(id("ahmed@koti.demo"));
    await expect(signIn("support@koti.demo")).rejects.toMatchObject({ statusCode: 403 });
  });

  it("un compte d'équipe ne crée pas de tontine, ne gère pas d'abonnement et n'accepte pas d'invitation", async () => {
    const op = ctxFor(id("operateur@koti.demo"));
    const startDate = new Date(Date.now() + 7 * 86400_000).toISOString().slice(0, 10);
    await expect(pg.createTontine(op, { name: "Interdite", description: "", contributionAmount: 10000, frequency: "WEEKLY", startDate, expectedMemberCount: 4, rotationMode: "MANUAL" })).rejects.toThrow(/n'ont pas d'espace client/);
    await expect(pg.changePlan(op, "PRO")).rejects.toThrow(/n'ont pas d'espace client/);
    await expect(pg.acceptInvitation(op, { token: "x".repeat(43) })).rejects.toThrow(/n'ont pas d'espace client/);
    expect((await pg.listMyTontines(op)).length).toBe(0);
  });

  it("on n'invite pas un compte d'équipe dans une tontine", async () => {
    const ahmed = ctxFor(id("ahmed@koti.demo"));
    const tontine = (await pg.listMyTontines(ahmed)).find((c) => c.role === "ADMIN" && c.status === "DRAFT")!;
    await expect(pg.createInvitation(ahmed, { tontineId: tontine.id, email: "support@koti.demo", phone: null })).rejects.toThrow(/équipe KOTI/);
  });

  it("le compte d'équipe garde son identité et son mot de passe (profil et mot de passe restent modifiables)", async () => {
    const op = id("operateur@koti.demo");
    await pg.updateProfile(ctxFor(op), { fullName: "Équipe KOTI (op.)", phone: "+2250700000000" });
    expect((await signIn("operateur@koti.demo", "admin")).user.name).toBe("Équipe KOTI (op.)");
    const a = await authFor(conn).api.signInEmail({ body: { email: "operateur@koti.demo", password: "Koti2026" }, headers: new Headers({ [REALM_HEADER]: "admin" }), returnHeaders: true });
    const cookie = (a.headers.getSetCookie?.() ?? []).map((c) => c.split(";")[0]).join("; ");
    // Le changement de mot de passe crée une nouvelle session : il ne doit pas être bloqué par la règle de connexion.
    await expect(authFor(conn).api.changePassword({ body: { currentPassword: "Koti2026", newPassword: "NouveauMdp2026", revokeOtherSessions: true }, headers: new Headers({ cookie }) })).resolves.toBeDefined();
    const row = await conn.db.select().from(sessions).where(eq(sessions.userId, op));
    expect(row.length).toBeGreaterThan(0);
  });
});
