import { afterEach, describe, expect, it } from "vitest";
import { DatabaseUnavailableError, DB_UNAVAILABLE_DIGEST, describeDatabaseError, isDatabaseUnavailable, rethrowIfUnavailable } from "@/server/db/availability";
import { createConnection, useConnection } from "@/server/db/client";
import { checkDatabase } from "@/server/db/health";

const pgError = (code: string, extra: object = {}) => Object.assign(new Error("pg"), { code, ...extra });
const wrapped = (cause: unknown) => new Error("Failed query: select count(*) from \"users\"", { cause });

describe("Base de données injoignable — détection", () => {
  it("reconnaît les pannes de connexion, y compris enveloppées par Drizzle ou doubles (IPv4 + IPv6)", () => {
    expect(isDatabaseUnavailable(wrapped(pgError("ECONNREFUSED", { address: "127.0.0.1", port: 5032 })))).toBe(true);
    expect(isDatabaseUnavailable(wrapped(Object.assign(new AggregateError([pgError("ECONNREFUSED"), pgError("ECONNREFUSED")]), { code: undefined })))).toBe(true);
    for (const code of ["ENOTFOUND", "ETIMEDOUT", "ECONNRESET", "57P01", "57P03", "53300", "3D000", "28P01", "08006"]) expect(isDatabaseUnavailable(wrapped(pgError(code)))).toBe(true);
    expect(isDatabaseUnavailable(new Error("timeout exceeded when trying to connect"))).toBe(true);
    expect(isDatabaseUnavailable(new Error("DATABASE_URL est absent : renseignez-le dans .env.local"))).toBe(true);
  });

  it("ne confond pas une vraie erreur applicative ou SQL avec une panne", () => {
    for (const code of ["23505", "23503", "42P01", "40001", "22P02"]) expect(isDatabaseUnavailable(wrapped(pgError(code)))).toBe(false);
    expect(isDatabaseUnavailable(new Error("Mot de passe incorrect"))).toBe(false);
    expect(isDatabaseUnavailable(null)).toBe(false);
    expect(isDatabaseUnavailable("texte")).toBe(false);
  });

  it("l'erreur dédiée porte le code transmis au navigateur ; une autre erreur est relancée telle quelle", () => {
    const e = new DatabaseUnavailableError(pgError("ECONNREFUSED"));
    expect(e.digest).toBe(DB_UNAVAILABLE_DIGEST);
    expect(isDatabaseUnavailable(e)).toBe(true);
    expect(() => rethrowIfUnavailable(wrapped(pgError("ECONNREFUSED")))).toThrow(DatabaseUnavailableError);
    const other = pgError("23505");
    expect(() => rethrowIfUnavailable(other)).toThrow(other);
    expect(() => rethrowIfUnavailable(e)).toThrow(e); // déjà convertie : pas de double enveloppe
  });

  it("le détail technique est court et ne contient jamais d'identifiants", () => {
    const d = describeDatabaseError(wrapped(pgError("ECONNREFUSED", { address: "127.0.0.1", port: 5032 })));
    expect(d).toBe("ECONNREFUSED 127.0.0.1:5032");
    expect(d).not.toMatch(/password|admin/i);
  });
});

describe("Contrôle de disponibilité de la base", () => {
  afterEach(() => useConnection(null));

  it("base injoignable : le contrôle répond « indisponible » rapidement, avec un détail, sans lever d'erreur", async () => {
    // Port 1 : rien n'écoute, la connexion est refusée immédiatement.
    useConnection(createConnection("postgresql://x:y@127.0.0.1:1/koti", { max: 1 }));
    const started = Date.now();
    const status = await checkDatabase();
    expect(status.ok).toBe(false);
    expect((status as { detail: string }).detail).toMatch(/ECONNREFUSED/);
    expect(Date.now() - started).toBeLessThan(4000);
  });
});
