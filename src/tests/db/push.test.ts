import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import type { IncomingMessage } from "node:http";
import { createServer } from "node:https";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createECDH, randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import * as webpush from "web-push";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { ctxFor } from "@/server/context";
import type { Connection } from "@/server/db/client";
import { pushPreferences, pushSubscriptions } from "@/server/db/schema";
import { deliverPush, getPushState, payloadFor, removePushSubscription, savePushSubscription, sendTestPush, setPushCategories, setPushSender } from "@/modules/push/push.service";
import { signUp } from "@/modules/users/user.pg";
import * as pg from "@/server/pg/services";
import { useConnection } from "@/server/db/client";
import { hasTestDb, openTestDb, resetTestDb } from "./helpers";
import { resetWithDemo } from "./pg-harness";

const KEYS = { p256dh: "BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM", auth: "tBHItJI5svbpez7KI4CCXg" };
const sub = (n: number) => ({ endpoint: `https://push.example.test/send/${n}`, keys: KEYS });

describe.skipIf(!hasTestDb)("Notifications push", () => {
  let conn: Connection;
  const db = () => conn.db;
  const saved = { pub: process.env.VAPID_PUBLIC_KEY, priv: process.env.VAPID_PRIVATE_KEY };
  const sent: Array<{ endpoint: string; payload: { title: string; body: string; url: string } }> = [];

  beforeAll(async () => {
    conn = await openTestDb();
    useConnection(conn);
  });
  afterAll(async () => {
    useConnection(null);
    await conn?.close();
  });
  beforeEach(async () => {
    await resetTestDb(conn);
    process.env.VAPID_PUBLIC_KEY ||= "BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM";
    process.env.VAPID_PRIVATE_KEY ||= "x".repeat(43);
    sent.length = 0;
    setPushSender(async (t, payload) => void sent.push({ endpoint: t.endpoint, payload: JSON.parse(payload) }));
  });
  afterEach(() => {
    setPushSender(null);
    process.env.VAPID_PUBLIC_KEY = saved.pub;
    process.env.VAPID_PRIVATE_KEY = saved.priv;
    if (saved.pub === undefined) delete process.env.VAPID_PUBLIC_KEY;
    if (saved.priv === undefined) delete process.env.VAPID_PRIVATE_KEY;
  });

  const user = async (n: number) => signUp({ fullName: `Membre ${n}`, email: `m${n}@test.ci`, phone: `+22507000000${n}0`, password: "Motdepasse1" }, db());
  const notif = (userId: string, type: "DUE_SOON" | "PAYMENT_DECLARED" | "INVITATION_RECEIVED", id = crypto.randomUUID()) => ({ id, userId, type, tontineId: null });

  it("abonnement : enregistré par appareil, réattribué si une autre personne s'y connecte, retiré à la demande", async () => {
    const a = await user(1);
    const b = await user(2);
    await savePushSubscription(ctxFor(a), sub(1), "Mozilla/5.0 test", db());
    await savePushSubscription(ctxFor(a), sub(1), "Mozilla/5.0 test", db()); // idempotent
    expect(await db().select().from(pushSubscriptions)).toHaveLength(1);
    await savePushSubscription(ctxFor(b), sub(1), null, db()); // même appareil, autre compte
    const [row] = await db().select().from(pushSubscriptions);
    expect(row!.userId).toBe(b);
    expect((await getPushState(a, db())).devices).toBe(0);
    await removePushSubscription(ctxFor(a), sub(1).endpoint, db()); // a ne peut pas retirer l'abonnement de b
    expect(await db().select().from(pushSubscriptions)).toHaveLength(1);
    await removePushSubscription(ctxFor(b), sub(1).endpoint, db());
    expect(await db().select().from(pushSubscriptions)).toHaveLength(0);
  });

  it("sans clés VAPID : l'enregistrement est refusé et rien n'est envoyé", async () => {
    const a = await user(1);
    delete process.env.VAPID_PUBLIC_KEY;
    await expect(savePushSubscription(ctxFor(a), sub(1), null, db())).rejects.toThrow(/pas activées/);
    expect(await deliverPush([notif(a, "DUE_SOON")], db())).toBe(0);
    expect(sent).toHaveLength(0);
  });

  it("le texte affiché est générique : ni montant, ni nom de tontine, ni nom de personne", async () => {
    const p = payloadFor({ id: "n1", type: "PAYMENT_DECLARED", tontineId: "t1" });
    expect(p.title).toBe("Paiement à valider");
    expect(p.url).toBe("/tontines/t1/payments");
    for (const type of ["INVITATION_RECEIVED", "INVITATION_ACCEPTED", "INVITATION_REFUSED", "DUE_SOON", "DUE_OVERDUE", "PAYMENT_DECLARED", "PAYMENT_VALIDATED", "PAYMENT_REJECTED", "ROTATION_SOON"] as const) {
      const x = payloadFor({ id: "n", type, tontineId: null });
      expect(`${x.title} ${x.body}`).not.toMatch(/\d{3}|FCFA|«|»/);
    }
  });

  it("préférences : seules les catégories choisies sont envoyées ; par défaut, tout", async () => {
    const a = await user(1);
    await savePushSubscription(ctxFor(a), sub(1), null, db());
    expect((await getPushState(a, db())).categories).toEqual(["echeances", "paiements", "tontines"]);
    expect(await deliverPush([notif(a, "DUE_SOON"), notif(a, "PAYMENT_DECLARED"), notif(a, "INVITATION_RECEIVED")], db())).toBe(3);
    sent.length = 0;
    await setPushCategories(ctxFor(a), ["paiements"], db());
    expect(await deliverPush([notif(a, "DUE_SOON"), notif(a, "PAYMENT_DECLARED"), notif(a, "INVITATION_RECEIVED")], db())).toBe(1);
    expect(sent.map((s) => s.payload.title)).toEqual(["Paiement à valider"]);
    await setPushCategories(ctxFor(a), [], db());
    expect(await deliverPush([notif(a, "PAYMENT_DECLARED")], db())).toBe(0);
    expect((await db().select().from(pushPreferences).where(eq(pushPreferences.userId, a)))[0]!.categories).toEqual([]);
  });

  it("chaque personne ne reçoit que ses notifications, sur tous ses appareils", async () => {
    const a = await user(1);
    const b = await user(2);
    await savePushSubscription(ctxFor(a), sub(1), null, db());
    await savePushSubscription(ctxFor(a), sub(2), null, db());
    await savePushSubscription(ctxFor(b), sub(3), null, db());
    await deliverPush([notif(a, "DUE_SOON")], db());
    expect(sent.map((s) => s.endpoint).sort()).toEqual([sub(1).endpoint, sub(2).endpoint]);
  });

  it("abonnement expiré (410) supprimé ; erreur temporaire : conservé", async () => {
    const a = await user(1);
    await savePushSubscription(ctxFor(a), sub(1), null, db());
    await savePushSubscription(ctxFor(a), sub(2), null, db());
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    setPushSender(async (t) => {
      if (t.endpoint.endsWith("/1")) throw Object.assign(new Error("Gone"), { statusCode: 410 });
      throw Object.assign(new Error("Service indisponible"), { statusCode: 503 });
    });
    expect(await deliverPush([notif(a, "DUE_SOON")], db())).toBe(0);
    log.mockRestore();
    expect((await db().select().from(pushSubscriptions)).map((s) => s.endpoint)).toEqual([sub(2).endpoint]);
  });

  it("test d'envoi : refusé sans appareil, sinon envoyé à tous les appareils", async () => {
    const a = await user(1);
    await expect(sendTestPush(ctxFor(a), db())).rejects.toThrow(/Aucun appareil/);
    await savePushSubscription(ctxFor(a), sub(1), null, db());
    expect(await sendTestPush(ctxFor(a), db())).toBe(1);
    expect(sent[0]!.payload).toMatchObject({ title: "Notifications activées", url: "/profile" });
  });

  it("une opération métier qui crée une notification déclenche le push, après validation de la transaction", async () => {
    const demo = await resetWithDemo(conn);
    const id = (email: string) => demo.users.find((u) => u.email === email)!.id;
    // Chaque compte client de la démo a un appareil : le destinataire (administrateur de la tontine) en aura un.
    for (const [i, u] of demo.users.filter((x) => x.platformRole === "USER").slice(0, 12).entries()) await savePushSubscription(ctxFor(u.id), sub(100 + i), null, db());
    const awa = id("awa@koti.demo");
    const mine = await pg.listMyObligations(ctxFor(awa));
    const o = mine.toPay.find((x) => x.canDeclare)!;
    await pg.declarePayment(ctxFor(awa), { obligationId: o.id, amount: o.expectedAmount, paymentDate: new Date().toISOString().slice(0, 10), paymentMethod: "CASH", reference: "", comment: "" });
    await vi.waitFor(() => expect(sent.length).toBeGreaterThan(0), { timeout: 3000 });
    expect(sent.every((s) => s.payload.title === "Paiement à valider")).toBe(true);
    expect(`${sent[0]!.payload.title} ${sent[0]!.payload.body}`).not.toMatch(/FCFA|\d{3}/);
  });

  it("envoi réel (bibliothèque web-push) : requête chiffrée signée VAPID vers le point d'accès", async () => {
    const a = await user(1);
    const received: Array<{ headers: IncomingMessage["headers"]; size: number }> = [];
    // Serveur HTTPS local à certificat auto-signé (web-push n'envoie qu'en HTTPS) : accepté pour ce test uniquement.
    const dir = mkdtempSync(join(tmpdir(), "koti-push-"));
    execFileSync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-keyout", join(dir, "k.pem"), "-out", join(dir, "c.pem"), "-days", "1", "-subj", "/CN=127.0.0.1", "-addext", "subjectAltName=IP:127.0.0.1"], { stdio: "ignore" });
    const previousTls = process.env.NODE_TLS_REJECT_UNAUTHORIZED;
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
    const server = createServer({ key: readFileSync(join(dir, "k.pem")), cert: readFileSync(join(dir, "c.pem")) }, (req, res) => {
      const chunks: Buffer[] = [];
      req.on("data", (c) => chunks.push(c));
      req.on("end", () => {
        received.push({ headers: req.headers, size: Buffer.concat(chunks).length });
        res.statusCode = 201;
        res.end();
      });
    });
    await new Promise<void>((ok) => server.listen(0, "127.0.0.1", ok));
    try {
      const ecdh = createECDH("prime256v1");
      ecdh.generateKeys();
      const vapid = webpush.generateVAPIDKeys();
      process.env.VAPID_PUBLIC_KEY = vapid.publicKey;
      process.env.VAPID_PRIVATE_KEY = vapid.privateKey;
      setPushSender(null);
      const port = (server.address() as { port: number }).port;
      await savePushSubscription(ctxFor(a), { endpoint: `https://127.0.0.1:${port}/push/abc`, keys: { p256dh: ecdh.getPublicKey().toString("base64url"), auth: randomBytes(16).toString("base64url") } }, null, db());
      expect(await deliverPush([notif(a, "DUE_SOON")], db())).toBe(1);
      expect(received).toHaveLength(1);
      expect(received[0]!.headers["content-encoding"]).toBe("aes128gcm");
      expect(received[0]!.headers.authorization).toMatch(/^vapid t=.+, k=.+/);
      expect(received[0]!.headers.ttl).toBe("86400");
      expect(received[0]!.size).toBeGreaterThan(60); // contenu chiffré, jamais en clair
    } finally {
      if (previousTls === undefined) delete process.env.NODE_TLS_REJECT_UNAUTHORIZED;
      else process.env.NODE_TLS_REJECT_UNAUTHORIZED = previousTls;
      server.close();
    }
  });
});
