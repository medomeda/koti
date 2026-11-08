import { and, eq, like } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { ctxFor } from "@/server/context";
import type { Connection } from "@/server/db/client";
import { accounts, sessions, subscriptions, userProfiles, users, verifications } from "@/server/db/schema";
import { signUp, updateProfile } from "@/modules/users/user.pg";
import { hasTestDb, openTestDb, resetTestDb } from "./helpers";
import { authenticate, authFor } from "./pg-harness";

const AWA = { fullName: "Awa Koné", email: "awa@test.ci", phone: "+2250701000001", password: "Motdepasse1" };

/** Connexion qui renvoie aussi les en-têtes de cookie, pour appeler ensuite l'API « en tant que » cet utilisateur. */
async function signIn(conn: Connection, email: string, password: string) {
  const res = await authFor(conn).api.signInEmail({ body: { email, password }, headers: new Headers(), returnHeaders: true });
  const cookie = (res.headers.getSetCookie?.() ?? []).map((c) => c.split(";")[0]).join("; ");
  return { userId: res.response.user.id, headers: new Headers({ cookie }) };
}

describe.skipIf(!hasTestDb)("Comptes et authentification (Better Auth) sur PostgreSQL", () => {
  let conn: Connection;
  const db = () => conn.db;
  beforeAll(async () => {
    conn = await openTestDb();
  });
  afterAll(async () => {
    await conn?.close();
  });
  beforeEach(() => resetTestDb(conn));

  it("inscription : compte, profil, mot de passe haché (compte « credential ») et abonnement gratuit créés ensemble", async () => {
    const id = await signUp(AWA, db());
    const [u] = await db().select().from(users).where(eq(users.id, id));
    expect(u).toMatchObject({ email: "awa@test.ci", name: "Awa Koné", platformRole: "USER", status: "ACTIVE", emailVerified: false });
    const [p] = await db().select().from(userProfiles).where(eq(userProfiles.userId, id));
    expect(p).toMatchObject({ fullName: "Awa Koné", phone: "+2250701000001" });
    const [a] = await db().select().from(accounts).where(eq(accounts.userId, id));
    expect(a).toMatchObject({ providerId: "credential", accountId: id });
    expect(a!.password!.startsWith("scrypt$")).toBe(true);
    expect(a!.password).not.toContain("Motdepasse1");
    const [sub] = await db().select().from(subscriptions).where(eq(subscriptions.userId, id));
    expect(sub).toMatchObject({ planId: "FREE", status: "ACTIVE", trialUsed: false });
  });

  it("e-mail et téléphone déjà pris : refus avec les mêmes messages, et rien n'est créé", async () => {
    await signUp(AWA, db());
    await expect(signUp({ ...AWA, email: "AWA@test.ci", phone: "+2250701000002" }, db())).rejects.toMatchObject({ message: "Un compte existe déjà avec cet e-mail.", fieldErrors: { email: "Adresse déjà utilisée." } });
    await expect(signUp({ ...AWA, email: "autre@test.ci" }, db())).rejects.toMatchObject({ message: "Ce numéro est déjà associé à un compte.", fieldErrors: { phone: "Numéro déjà utilisé." } });
    expect(await db().select().from(users)).toHaveLength(1);
    expect(await db().select().from(accounts)).toHaveLength(1);
  });

  it("deux inscriptions simultanées avec le même e-mail : une seule aboutit", async () => {
    const results = await Promise.allSettled([signUp(AWA, db()), signUp({ ...AWA, phone: "+2250701000009" }, db()), signUp({ ...AWA, phone: "+2250701000010" }, db())]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((r) => r.status === "rejected").every((r) => (r as PromiseRejectedResult).reason.message === "Un compte existe déjà avec cet e-mail.")).toBe(true);
    expect(await db().select().from(users)).toHaveLength(1);
  });

  it("connexion : bon mot de passe, mauvais mot de passe, e-mail inconnu, casse de l'e-mail", async () => {
    const id = await signUp(AWA, db());
    expect(await authenticate(conn, "awa@test.ci", "Motdepasse1")).toBe(id);
    expect(await authenticate(conn, "Awa@Test.CI", "Motdepasse1")).toBe(id);
    expect(await authenticate(conn, "awa@test.ci", "faux")).toBeNull();
    expect(await authenticate(conn, "inconnu@test.ci", "Motdepasse1")).toBeNull();
  });

  it("session : jeton unique en base, identifiant UUID, expiration à 7 jours, lecture et fermeture", async () => {
    await signUp(AWA, db());
    const { userId, headers } = await signIn(conn, "awa@test.ci", "Motdepasse1");
    const [row] = await db().select().from(sessions);
    expect(row).toMatchObject({ userId });
    expect(row!.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-/);
    const days = (row!.expiresAt.getTime() - row!.createdAt.getTime()) / 86400_000;
    expect(Math.round(days)).toBe(7);
    const current = await authFor(conn).api.getSession({ headers });
    expect(current?.user).toMatchObject({ id: userId, email: "awa@test.ci" });
    await authFor(conn).api.signOut({ headers });
    expect(await authFor(conn).api.getSession({ headers })).toBeNull();
    expect(await db().select().from(sessions)).toHaveLength(0);
  });

  it("compte suspendu : connexion refusée avec le bon mot de passe, aucune session créée, session existante inutilisable une fois fermée", async () => {
    const id = await signUp(AWA, db());
    const { headers } = await signIn(conn, "awa@test.ci", "Motdepasse1");
    expect(await authFor(conn).api.getSession({ headers })).not.toBeNull();
    await db().update(users).set({ status: "SUSPENDED" }).where(eq(users.id, id));
    await db().delete(sessions).where(eq(sessions.userId, id)); // ce que fait l'action de suspension de l'équipe
    await expect(authenticate(conn, "awa@test.ci", "Motdepasse1")).rejects.toThrow(/suspendu/);
    expect(await db().select().from(sessions)).toHaveLength(0);
    expect(await authFor(conn).api.getSession({ headers })).toBeNull();
    // Un mauvais mot de passe reste « incorrect » (pas de fuite sur l'état du compte).
    expect(await authenticate(conn, "awa@test.ci", "faux")).toBeNull();
  });

  it("changement de mot de passe : ancien refusé, nouveau accepté, autres sessions fermées", async () => {
    await signUp(AWA, db());
    const a = await signIn(conn, "awa@test.ci", "Motdepasse1");
    const other = await signIn(conn, "awa@test.ci", "Motdepasse1"); // un second appareil
    await expect(authFor(conn).api.changePassword({ body: { currentPassword: "faux", newPassword: "Nouveau1234", revokeOtherSessions: true }, headers: a.headers })).rejects.toThrow();
    expect(await authenticate(conn, "awa@test.ci", "Motdepasse1")).toBe(a.userId); // rien n'a changé
    await authFor(conn).api.changePassword({ body: { currentPassword: "Motdepasse1", newPassword: "Nouveau1234", revokeOtherSessions: true }, headers: a.headers });
    expect(await authenticate(conn, "awa@test.ci", "Motdepasse1")).toBeNull();
    expect(await authenticate(conn, "awa@test.ci", "Nouveau1234")).toBe(a.userId);
    expect(await authFor(conn).api.getSession({ headers: other.headers })).toBeNull();
    const [acc] = await db().select().from(accounts).where(eq(accounts.userId, a.userId));
    expect(acc!.password!.startsWith("scrypt$")).toBe(true); // le format de hachage est conservé
  });

  it("mot de passe oublié : demande silencieuse pour un inconnu, jeton à usage unique, sessions fermées", async () => {
    const id = await signUp(AWA, db());
    const { headers } = await signIn(conn, "awa@test.ci", "Motdepasse1");
    const auth = authFor(conn);
    // Compte inconnu : même réponse, aucun jeton créé.
    await expect(auth.api.requestPasswordReset({ body: { email: "inconnu@test.ci", redirectTo: "/reset-password" }, headers: new Headers() })).resolves.toMatchObject({ status: true });
    expect(await db().select().from(verifications)).toHaveLength(0);
    await auth.api.requestPasswordReset({ body: { email: "awa@test.ci", redirectTo: "/reset-password" }, headers: new Headers() });
    const [v] = await db().select().from(verifications).where(like(verifications.identifier, "reset-password:%"));
    expect(v!.value).toBe(id);
    const token = v!.identifier.replace("reset-password:", "");
    await auth.api.resetPassword({ body: { newPassword: "Reinitialise1", token }, headers: new Headers() });
    expect(await authenticate(conn, "awa@test.ci", "Motdepasse1")).toBeNull();
    expect(await authenticate(conn, "awa@test.ci", "Reinitialise1")).toBe(id);
    await expect(auth.api.resetPassword({ body: { newPassword: "Encore1234", token }, headers: new Headers() })).rejects.toThrow(); // usage unique
    // L'ancienne session (ouverte avant la réinitialisation) a été fermée ; seule la nouvelle connexion de ce test existe.
    expect(await auth.api.getSession({ headers })).toBeNull();
  });

  it("jeton de réinitialisation expiré refusé", async () => {
    await signUp(AWA, db());
    const auth = authFor(conn);
    await auth.api.requestPasswordReset({ body: { email: "awa@test.ci", redirectTo: "/reset-password" }, headers: new Headers() });
    await db().update(verifications).set({ expiresAt: new Date(Date.now() - 1000) }).where(and(like(verifications.identifier, "reset-password:%")));
    const [v] = await db().select().from(verifications);
    await expect(auth.api.resetPassword({ body: { newPassword: "Reinitialise1", token: v!.identifier.replace("reset-password:", "") }, headers: new Headers() })).rejects.toThrow();
  });

  it("profil : mise à jour (et nom du compte), numéro déjà utilisé refusé, profil absent signalé", async () => {
    const a = await signUp(AWA, db());
    await signUp({ ...AWA, email: "b@test.ci", phone: "+2250701000002" }, db());
    await updateProfile(ctxFor(a), { fullName: "Awa K.", phone: "+2250701000003" }, db());
    const [p] = await db().select().from(userProfiles).where(eq(userProfiles.userId, a));
    expect(p).toMatchObject({ fullName: "Awa K.", phone: "+2250701000003" });
    expect((await db().select().from(users).where(eq(users.id, a)))[0]!.name).toBe("Awa K.");
    await expect(updateProfile(ctxFor(a), { fullName: "Awa", phone: "+2250701000002" }, db())).rejects.toMatchObject({ message: "Ce numéro est déjà associé à un compte.", fieldErrors: { phone: "Numéro déjà utilisé." } });
    await expect(updateProfile(ctxFor("00000000-0000-4000-8000-000000000000"), { fullName: "X", phone: "+2250701000099" }, db())).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
