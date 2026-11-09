/**
 * Base de données injoignable : détection et erreur dédiée.
 * L'erreur porte un `digest` fixe : Next.js le transmet tel quel à la page d'erreur du navigateur (error.tsx), qui peut
 * ainsi afficher un message clair au lieu d'une erreur technique (les messages des erreurs serveur sont masqués en production).
 */
export const DB_UNAVAILABLE_DIGEST = "KOTI_DB_UNAVAILABLE";

const NETWORK_CODES = new Set(["ECONNREFUSED", "ENOTFOUND", "ETIMEDOUT", "ECONNRESET", "EHOSTUNREACH", "ENETUNREACH", "EAI_AGAIN", "EPIPE", "ECONNABORTED"]);
// 08 : connexion · 57P01/02/03 : arrêt ou démarrage du serveur · 53300 : trop de connexions · 3D000 : base absente · 28P01/28000 : authentification refusée
const PG_CODES = new Set(["57P01", "57P02", "57P03", "53300", "3D000", "28P01", "28000"]);

type Chain = { code?: string; message?: string; cause?: unknown; errors?: unknown[]; address?: string; port?: number };

function* walk(err: unknown, depth = 0): Generator<Chain> {
  if (!err || typeof err !== "object" || depth > 6) return;
  const e = err as Chain;
  yield e;
  yield* walk(e.cause, depth + 1);
  for (const inner of e.errors ?? []) yield* walk(inner, depth + 1); // AggregateError (IPv4 + IPv6)
}

export function isDatabaseUnavailable(err: unknown): boolean {
  if (err instanceof DatabaseUnavailableError) return true;
  for (const e of walk(err)) {
    if (e.code && (NETWORK_CODES.has(e.code) || PG_CODES.has(e.code) || e.code.startsWith("08"))) return true;
    if (e.message && /Connection terminated|connection timeout|timeout exceeded when trying to connect|DATABASE_URL est absent/i.test(e.message)) return true;
  }
  return false;
}

/** Détail technique, pour le développement uniquement (jamais d'identifiants : les erreurs du pilote n'en contiennent pas). */
export function describeDatabaseError(err: unknown): string {
  const parts: string[] = [];
  for (const e of walk(err)) {
    const bit = [e.code, e.address && `${e.address}${e.port ? `:${e.port}` : ""}`].filter(Boolean).join(" ");
    if (bit && !parts.includes(bit)) parts.push(bit);
  }
  const root = [...walk(err)].at(-1)?.message;
  if (parts.length === 0 && root) parts.push(root);
  return parts.slice(0, 3).join(" · ") || "erreur inconnue";
}

export class DatabaseUnavailableError extends Error {
  readonly digest = DB_UNAVAILABLE_DIGEST;
  constructor(cause?: unknown) {
    super("La base de données est momentanément indisponible.", { cause });
    this.name = "DatabaseUnavailableError";
  }
}

/** Convertit une erreur de connexion en `DatabaseUnavailableError` ; toute autre erreur est relancée telle quelle. */
export function rethrowIfUnavailable(err: unknown): never {
  throw isDatabaseUnavailable(err) && !(err instanceof DatabaseUnavailableError) ? new DatabaseUnavailableError(err) : err;
}
