import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { toFailure } from "@/actions/_shared";
import { AppError } from "@/server/errors";
import { DatabaseUnavailableError } from "@/server/db/availability";
import { describeError, logError, newRef, redactMessage } from "@/server/log";

let lines: string[];
beforeEach(() => {
  lines = [];
  for (const m of ["error", "warn", "log"] as const) vi.spyOn(console, m).mockImplementation((...args: unknown[]) => void lines.push(args.map(String).join(" ")));
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

const pgFailure = () =>
  new Error('Failed query: insert into "users" ("email") values ($1)\nparams: ahmed@secret.ci', {
    cause: Object.assign(new Error('duplicate key value violates unique constraint "users_email_unique"'), { code: "23505", constraint: "users_email_unique", table: "users", detail: "Key (email)=(ahmed@secret.ci) already exists." }),
  });

describe("Journal technique", () => {
  it("référence courte sans caractères ambigus", () => {
    for (let i = 0; i < 50; i++) expect(newRef()).toMatch(/^E-[2-9A-HJ-NP-Z]{6}$/);
  });

  it("production : une ligne JSON avec l'erreur, sa cause en chaîne, les détails PostgreSQL et la pile", () => {
    vi.stubEnv("NODE_ENV", "production");
    const ref = logError("action", pgFailure(), { userId: "u1", path: "/tontines" });
    expect(lines).toHaveLength(1);
    const entry = JSON.parse(lines[0]!);
    expect(entry).toMatchObject({ level: "error", source: "action", ref, context: { userId: "u1", path: "/tontines" } });
    expect(entry.time).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(entry.error.cause).toMatchObject({ code: "23505", pg: { constraint: "users_email_unique", table: "users" } });
    expect(entry.error.stack).toContain("log.test.ts");
  });

  it("aucune donnée sensible dans les journaux : valeurs SQL, mot de passe d'URL, clés de contexte", () => {
    vi.stubEnv("NODE_ENV", "production");
    logError("test", new Error("connexion à postgresql://admin:S3cr3t!@127.0.0.1:5032/koti impossible"), { password: "x", sessionToken: "y", cookie: "z", authorization: "Bearer a", headers: { Authorization: "b", "user-agent": "ua" }, ok: "visible" });
    logError("test", new Error("échec avec mot de passe=hunter2 et token: abc123 et password=\"p w\""));
    logError("test", pgFailure());
    const text = lines.join("\n");
    expect(text).not.toContain("S3cr3t");
    expect(text).toContain("admin:***@127.0.0.1");
    for (const secret of ["hunter2", "abc123", "p w"]) expect(text).not.toContain(secret);
    expect(text).not.toMatch(/ahmed@secret\.ci\b(?!.*already)/); // la valeur de la requête est masquée
    expect(text).toContain("valeurs de la requête masquées");
    const first = JSON.parse(lines[0]!);
    expect(first.context).toEqual({ headers: { "user-agent": "ua" }, ok: "visible" });
  });

  it("développement : lecture facile sur plusieurs lignes, avec la référence, la cause et le début de la pile", () => {
    vi.stubEnv("NODE_ENV", "development");
    const ref = logError("action", pgFailure(), { userId: "u1" });
    const out = lines[0]!;
    expect(out).toContain(`ref=${ref}`);
    expect(out).toContain("cause : Error [23505]");
    expect(out).toContain("PostgreSQL : ");
    expect(out).toContain('contexte : {"userId":"u1"}');
  });

  it("référence imposée (digest de Next.js) conservée ; message tronqué et coupé proprement", () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(logError("request", new Error("x".repeat(5000)), undefined, { ref: "1234567" })).toBe("1234567");
    expect(JSON.parse(lines[0]!).error.message.length).toBeLessThanOrEqual(2000);
    expect(redactMessage("Failed query: select 1\nparams: a,b")).not.toContain("a,b");
    expect(describeError("texte brut")).toEqual({ name: "Error", message: "texte brut" });
    expect(describeError(null)).toMatchObject({ message: "null" });
  });
});

describe("Message montré à l'utilisateur", () => {
  it("erreur métier : son message, tel quel, sans journal d'erreur", () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(toFailure(new AppError("CONFLICT", "Cette personne est déjà membre."))).toEqual({ ok: false, error: "Cette personne est déjà membre.", fieldErrors: undefined });
    expect(lines).toHaveLength(0);
  });

  it("erreur inattendue : message générique + code ; rien de technique à l'écran, tout dans le journal sous le même code", () => {
    vi.stubEnv("NODE_ENV", "production");
    const res = toFailure(pgFailure(), { userId: "u42" });
    expect(res.ok).toBe(false);
    const message = (res as { error: string }).error;
    expect(message).toMatch(/^Une erreur inattendue est survenue\. Réessayez ; si cela se reproduit, communiquez le code E-[A-Z0-9]{6} à l'équipe KOTI\.$/);
    for (const leak of ["Failed query", "users", "23505", "duplicate", "ahmed@secret.ci", "constraint", "insert"]) expect(message).not.toContain(leak);
    const ref = message.match(/E-[A-Z0-9]{6}/)![0];
    const entry = JSON.parse(lines[0]!);
    expect(entry).toMatchObject({ ref, context: { userId: "u42" } });
    expect(entry.error.cause.pg.constraint).toBe("users_email_unique"); // l'administrateur a le détail
  });

  it("base injoignable : message dédié, journalisé comme avertissement", () => {
    vi.stubEnv("NODE_ENV", "production");
    const res = toFailure(new DatabaseUnavailableError(Object.assign(new Error("refused"), { code: "ECONNREFUSED" })));
    expect(res).toEqual({ ok: false, error: "Service momentanément indisponible. Réessayez dans quelques instants." });
    expect(JSON.parse(lines[0]!)).toMatchObject({ level: "warn", source: "action" });
  });
});
