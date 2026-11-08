import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { ctxFor } from "@/server/context";
import type { Connection } from "@/server/db/client";
import { auditLogs, credentials, sessions, subscriptions, userProfiles, users } from "@/server/db/schema";
import { authenticate, changePassword, signUp, updateProfile } from "@/modules/users/user.pg";
import { createSessionRow, deleteSessionByToken, deleteUserSessions, findSessionUser } from "@/modules/users/session.pg";
import { hasTestDb, openTestDb, resetTestDb } from "./helpers";

const AWA = { fullName: "Awa Koné", email: "awa@test.ci", phone: "+2250701000001", password: "Motdepasse1" };

describe.skipIf(!hasTestDb)("Comptes et sessions sur PostgreSQL", () => {
  let conn: Connection;
  const db = () => conn.db;
  beforeAll(async () => {
    conn = await openTestDb();
  });
  afterAll(async () => {
    await conn?.close();
  });
  beforeEach(() => resetTestDb(conn));

  it("inscription : compte, profil, mot de passe haché et abonnement gratuit créés ensemble", async () => {
    const id = await signUp(AWA, db());
    const [u] = await db().select().from(users).where(eq(users.id, id));
    expect(u).toMatchObject({ email: "awa@test.ci", platformRole: "USER", status: "ACTIVE", emailVerified: false });
    const [p] = await db().select().from(userProfiles).where(eq(userProfiles.userId, id));
    expect(p).toMatchObject({ fullName: "Awa Koné", phone: "+2250701000001" });
    const [c] = await db().select().from(credentials).where(eq(credentials.userId, id));
    expect(c!.passwordHash.startsWith("scrypt$")).toBe(true);
    expect(c!.passwordHash).not.toContain("Motdepasse1");
    const [sub] = await db().select().from(subscriptions).where(eq(subscriptions.userId, id));
    expect(sub).toMatchObject({ planId: "FREE", status: "ACTIVE", trialUsed: false });
  });

  it("e-mail et téléphone déjà pris : refus avec les mêmes messages, et rien n'est créé", async () => {
    await signUp(AWA, db());
    await expect(signUp({ ...AWA, email: "AWA@test.ci", phone: "+2250701000002" }, db())).rejects.toMatchObject({ message: "Un compte existe déjà avec cet e-mail.", fieldErrors: { email: "Adresse déjà utilisée." } });
    await expect(signUp({ ...AWA, email: "autre@test.ci" }, db())).rejects.toMatchObject({ message: "Ce numéro est déjà associé à un compte.", fieldErrors: { phone: "Numéro déjà utilisé." } });
    expect(await db().select().from(users)).toHaveLength(1);
    expect(await db().select().from(credentials)).toHaveLength(1);
  });

  it("deux inscriptions simultanées avec le même e-mail : une seule aboutit", async () => {
    const results = await Promise.allSettled([signUp(AWA, db()), signUp({ ...AWA, phone: "+2250701000009" }, db()), signUp({ ...AWA, phone: "+2250701000010" }, db())]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((r) => r.status === "rejected").every((r) => (r as PromiseRejectedResult).reason.message === "Un compte existe déjà avec cet e-mail.")).toBe(true);
    expect(await db().select().from(users)).toHaveLength(1);
  });

  it("connexion : bon mot de passe, mauvais mot de passe, e-mail inconnu, casse de l'e-mail", async () => {
    const id = await signUp(AWA, db());
    expect(await authenticate("awa@test.ci", "Motdepasse1", db())).toBe(id);
    expect(await authenticate("Awa@Test.CI", "Motdepasse1", db())).toBe(id);
    expect(await authenticate("awa@test.ci", "faux", db())).toBeNull();
    expect(await authenticate("inconnu@test.ci", "Motdepasse1", db())).toBeNull();
  });

  it("un compte suspendu ne peut plus se connecter, et n'a plus de session valide", async () => {
    const id = await signUp(AWA, db());
    const { token } = await createSessionRow(id, new Date(), db());
    expect(await findSessionUser(token, new Date(), db())).not.toBeNull();
    await db().update(users).set({ status: "SUSPENDED" }).where(eq(users.id, id));
    await expect(authenticate("awa@test.ci", "Motdepasse1", db())).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(await findSessionUser(token, new Date(), db())).toBeNull();
    // Un mauvais mot de passe reste « incorrect » (pas de fuite sur l'état du compte).
    expect(await authenticate("awa@test.ci", "faux", db())).toBeNull();
  });

  it("session : seule l'empreinte est stockée ; expiration à 7 jours ; fermeture", async () => {
    const id = await signUp(AWA, db());
    const now = new Date("2026-11-08T10:00:00Z");
    const { token, expiresAt } = await createSessionRow(id, now, db());
    expect(expiresAt.toISOString()).toBe("2026-11-15T10:00:00.000Z");
    const [row] = await db().select().from(sessions);
    expect(row!.tokenHash).not.toBe(token);
    expect(row!.tokenHash).toMatch(/^[0-9a-f]{64}$/);
    const user = await findSessionUser(token, new Date("2026-11-14T10:00:00Z"), db());
    expect(user).toMatchObject({ id, email: "awa@test.ci", fullName: "Awa Koné", phone: "+2250701000001", avatarUrl: null });
    expect(await findSessionUser(token, new Date("2026-11-15T10:00:01Z"), db())).toBeNull();
    expect(await findSessionUser("jeton-inconnu", now, db())).toBeNull();
    expect(await findSessionUser("x".repeat(101), now, db())).toBeNull();
    await deleteSessionByToken(token, db());
    expect(await findSessionUser(token, now, db())).toBeNull();
  });

  it("création de session : nettoie les sessions expirées de tous les comptes", async () => {
    const a = await signUp(AWA, db());
    const b = await signUp({ ...AWA, email: "b@test.ci", phone: "+2250701000002" }, db());
    await createSessionRow(a, new Date("2026-01-01T00:00:00Z"), db());
    await createSessionRow(b, new Date("2026-11-08T00:00:00Z"), db());
    expect(await db().select().from(sessions)).toHaveLength(1);
  });

  it("changement de mot de passe : ancien refusé, nouveau accepté, toutes les sessions fermées", async () => {
    const id = await signUp(AWA, db());
    const { token } = await createSessionRow(id, new Date(), db());
    await expect(changePassword(ctxFor(id), { currentPassword: "faux", newPassword: "Nouveau1234" }, db())).rejects.toMatchObject({ message: "Mot de passe actuel incorrect." });
    expect(await findSessionUser(token, new Date(), db())).not.toBeNull(); // échec : rien n'a changé
    await changePassword(ctxFor(id), { currentPassword: "Motdepasse1", newPassword: "Nouveau1234" }, db());
    expect(await authenticate("awa@test.ci", "Motdepasse1", db())).toBeNull();
    expect(await authenticate("awa@test.ci", "Nouveau1234", db())).toBe(id);
    expect(await findSessionUser(token, new Date(), db())).toBeNull();
  });

  it("fermeture ciblée des sessions d'un compte (suspension), en épargnant éventuellement une session", async () => {
    const id = await signUp(AWA, db());
    const s1 = await createSessionRow(id, new Date(), db());
    const s2 = await createSessionRow(id, new Date(), db());
    await deleteUserSessions(id, s2.token, db());
    expect(await findSessionUser(s1.token, new Date(), db())).toBeNull();
    expect(await findSessionUser(s2.token, new Date(), db())).not.toBeNull();
    await deleteUserSessions(id, undefined, db());
    expect(await findSessionUser(s2.token, new Date(), db())).toBeNull();
  });

  it("profil : mise à jour, numéro déjà utilisé refusé, profil absent signalé", async () => {
    const a = await signUp(AWA, db());
    await signUp({ ...AWA, email: "b@test.ci", phone: "+2250701000002" }, db());
    await updateProfile(ctxFor(a), { fullName: "Awa K.", phone: "+2250701000003" }, db());
    const [p] = await db().select().from(userProfiles).where(eq(userProfiles.userId, a));
    expect(p).toMatchObject({ fullName: "Awa K.", phone: "+2250701000003" });
    await expect(updateProfile(ctxFor(a), { fullName: "Awa", phone: "+2250701000002" }, db())).rejects.toMatchObject({ message: "Ce numéro est déjà associé à un compte.", fieldErrors: { phone: "Numéro déjà utilisé." } });
    await expect(updateProfile(ctxFor("00000000-0000-4000-8000-000000000000"), { fullName: "X", phone: "+2250701000099" }, db())).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(await db().select().from(auditLogs)).toHaveLength(0);
  });
});
