import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { runBilling } from "@/modules/billing/billing.service";
import { ctxFor } from "@/server/context";
import { useConnection, type Connection } from "@/server/db/client";
import { ensureBootstrapAdmin } from "@/server/db/bootstrap";
import type { DbState } from "@/server/db/store";
import * as pg from "@/server/pg/services";
import { pgTx } from "@/server/db/uow";
import { hasTestDb, openTestDb, resetTestDb } from "./helpers";
import { authFor, authenticate, resetWithDemo, snapshot } from "./pg-harness";

let conn: Connection;
beforeAll(async () => { conn = await openTestDb(); useConnection(conn); });
afterAll(async () => { useConnection(null); await conn?.close(); });

const ENV = ["KOTI_ONLINE_PAYMENTS", "KOTI_BOOTSTRAP_ADMIN_EMAIL", "KOTI_BOOTSTRAP_ADMIN_PASSWORD"] as const;
const saved: Record<string, string | undefined> = {};
beforeEach(() => { for (const k of ENV) saved[k] = process.env[k]; });
afterEach(() => { for (const k of ENV) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; } });

describe.skipIf(!hasTestDb)("Premier administrateur d'une instance de production", () => {
  it("crée un Super administrateur sur une base vide, une seule fois, avec un mot de passe qui fonctionne", async () => {
    await resetTestDb(conn);
    process.env.KOTI_BOOTSTRAP_ADMIN_EMAIL = "Direction@Exemple.ci";
    process.env.KOTI_BOOTSTRAP_ADMIN_PASSWORD = "mot-de-passe-solide-1";
    await ensureBootstrapAdmin();
    const staff = await snapshot(conn, (s) => s.users.filter((u) => u.platformRole !== "USER").map((u) => ({ email: u.email, role: u.platformRole, verified: u.emailVerified })));
    expect(staff).toEqual([{ email: "direction@exemple.ci", role: "SUPER_ADMIN", verified: true }]);
    // Le compte d'équipe est refusé côté clients, accepté dans l'espace d'administration.
    await expect(authenticate(conn, "direction@exemple.ci", "mot-de-passe-solide-1")).rejects.toThrow(/administration/);
    const res = await authFor(conn).api.signInEmail({ body: { email: "direction@exemple.ci", password: "mot-de-passe-solide-1" }, headers: new Headers({ "x-koti-realm": "admin" }) });
    expect(res.user.email).toBe("direction@exemple.ci");
    // Relancé (redémarrage du serveur) ou avec un autre e-mail : rien de plus n'est créé.
    process.env.KOTI_BOOTSTRAP_ADMIN_EMAIL = "autre@exemple.ci";
    await ensureBootstrapAdmin();
    expect(await snapshot(conn, (s) => s.users.length)).toBe(1);
  });

  it("refuse un mot de passe trop court", async () => {
    await resetTestDb(conn);
    process.env.KOTI_BOOTSTRAP_ADMIN_EMAIL = "direction@exemple.ci";
    process.env.KOTI_BOOTSTRAP_ADMIN_PASSWORD = "court";
    await ensureBootstrapAdmin();
    expect(await snapshot(conn, (s) => s.users.length)).toBe(0);
  });
});

describe.skipIf(!hasTestDb)("Règlement manuel des offres payantes", () => {
  let demo: DbState;
  const txn = <T,>(fn: (s: DbState) => T) => pgTx({ everything: true }, fn, conn.db);
  beforeEach(async () => {
    process.env.KOTI_ONLINE_PAYMENTS = "0";
    demo = await resetWithDemo(conn);
  });
  const newClient = (n: number) => pg.signUp({ fullName: `Client ${n}`, email: `c${n}@exemple.ci`, phone: `+22507100000${n}`, password: "Motdepasse1" });
  const sub = (id: string) => snapshot(conn, (s) => ({ ...s.subscriptions.find((x) => x.userId === id)!, invoices: s.invoices.filter((i) => i.userId === id).length }));
  const operator = () => demo.users.find((u) => u.platformRole === "SUPER_ADMIN")!.id;

  it("le client ne peut pas prendre seul une offre payante (pas d'essai) mais peut rester ou revenir au gratuit", async () => {
    const id = await newClient(1);
    await expect(pg.changePlan(ctxFor(id), "PRO")).rejects.toThrow(/activé par l'équipe KOTI/);
    expect(await sub(id)).toMatchObject({ planId: "FREE", status: "ACTIVE", trialEndsAt: null, invoices: 0 });
  });

  it("le compte affiche les offres payantes comme « à demander » (pas en libre-service)", async () => {
    const id = await newClient(2);
    const acc = await pg.getAccount(ctxFor(id));
    expect(acc.manual).toBe(true);
    expect(acc.selfService).toEqual({ FREE: true, PRO: false, ASSOCIATION: false });
  });

  it("l'équipe KOTI active l'offre après paiement : facture émise, période d'un mois ; sans renouvellement, retour au gratuit", async () => {
    const id = await newClient(3);
    await pg.changeClientPlan(ctxFor(operator()), { userId: id, planId: "PRO", reason: "Paiement Mobile Money reçu" });
    expect(await sub(id)).toMatchObject({ planId: "PRO", status: "ACTIVE", invoices: 1 });
    await txn((s) => runBilling(s, new Date(Date.now() + 40 * 86_400_000)));
    expect(await sub(id)).toMatchObject({ planId: "FREE", status: "ACTIVE", invoices: 1 });
  });

  it("un client payant peut baisser d'offre seul, pas monter", async () => {
    const id = await newClient(4);
    await pg.changeClientPlan(ctxFor(operator()), { userId: id, planId: "ASSOCIATION", reason: "Paiement reçu" });
    await expect(pg.changePlan(ctxFor(id), "PRO")).resolves.toBeUndefined();
    await expect(pg.changePlan(ctxFor(id), "ASSOCIATION")).rejects.toThrow(/activé par l'équipe KOTI/);
  });
});
