/**
 * Journal technique de l'application (sortie d'erreur du serveur : « Runtime Logs » de Coolify, terminal en développement).
 *
 * Principe : l'utilisateur ne voit JAMAIS de détail technique, seulement un message générique et, au besoin, un code de
 * référence (`ref`). L'administrateur retrouve ce code dans les journaux avec tout ce qu'il faut pour comprendre :
 * erreur, cause en chaîne, pile d'appels, requête concernée.
 *
 * Confidentialité des journaux : jamais de mot de passe, de jeton, de cookie ni de valeur de requête SQL.
 * - les messages « Failed query … params: … » de Drizzle sont coupés avant les valeurs ;
 * - les mots de passe des adresses de connexion sont masqués ;
 * - les clés de contexte sensibles (mot de passe, jeton, cookie, secret…) sont retirées.
 *
 * Format : une ligne JSON par événement en production (exploitable par un outil de journaux) ; lisible sur plusieurs lignes en développement.
 */
export type LogLevel = "error" | "warn" | "info";

/** Code de référence court, sans caractères ambigus (0/O, 1/I), à communiquer à l'équipe : « E-7K2P9Q ». */
export function newRef(): string {
  const alphabet = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(6));
  return "E-" + [...bytes].map((b) => alphabet[b % alphabet.length]).join("");
}

const SENSITIVE_KEY = /pass(word)?|token|secret|cookie|authorization|hash|api[-_]?key|private/i;

/** Retire des messages ce qui pourrait contenir des données : valeurs de requête, mot de passe d'une URL de connexion. */
export function redactMessage(message: string): string {
  return message
    .replace(/\n?\s*params:[\s\S]*$/i, "\n[valeurs de la requête masquées]")
    .replace(/(\/\/[^:/\s@]+):([^@\s]+)@/g, "$1:***@")
    // Secret écrit en clair dans un message libre : « password=… », « mot de passe : … », « token=… »
    .replace(/(mot de passe|password|passwd|pwd|secret|token|jeton|api[-_ ]?key)(\s*[=:]\s*)("[^"]*"|'[^']*'|\S+)/gi, "$1$2[masqué]")
    .slice(0, 2000);
}

export interface DescribedError {
  name: string;
  message: string;
  code?: string;
  status?: number;
  /** Détails fournis par PostgreSQL (pas de valeurs de données). */
  pg?: Record<string, string>;
  stack?: string;
  cause?: DescribedError;
}

export function describeError(err: unknown, depth = 0): DescribedError {
  if (err === null || err === undefined) return { name: "Error", message: String(err) };
  if (typeof err !== "object") return { name: "Error", message: redactMessage(String(err)) };
  const e = err as Record<string, unknown> & { name?: string; message?: string; stack?: string; cause?: unknown; errors?: unknown[] };
  const out: DescribedError = { name: String(e.name ?? "Error"), message: redactMessage(String(e.message ?? "")) };
  if (typeof e.code === "string") out.code = e.code;
  if (typeof e.statusCode === "number") out.status = e.statusCode;
  else if (typeof e.status === "number") out.status = e.status;
  const pg: Record<string, string> = {};
  for (const k of ["detail", "table", "column", "constraint", "schema", "routine", "hint"]) if (typeof e[k] === "string") pg[k] = redactMessage(e[k] as string);
  if (Object.keys(pg).length) out.pg = pg;
  // Pile d'appels : seulement les lignes « at … » (le message, déjà traité à part, peut s'étendre sur plusieurs lignes et contenir des valeurs).
  if (typeof e.stack === "string") out.stack = e.stack.split("\n").filter((l) => /^\s+at /.test(l)).slice(0, 25).join("\n");
  if (depth < 5) {
    const inner = e.cause ?? (Array.isArray(e.errors) ? e.errors[0] : undefined);
    if (inner) out.cause = describeError(inner, depth + 1);
  }
  return out;
}

/** Contexte sans clés sensibles (un niveau d'imbrication). */
function cleanContext(context: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  if (!context) return undefined;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(context)) {
    if (SENSITIVE_KEY.test(k)) continue;
    out[k] = v && typeof v === "object" && !Array.isArray(v) ? cleanContext(v as Record<string, unknown>) : typeof v === "string" ? v.slice(0, 300) : v;
  }
  return out;
}

export interface LogEntry {
  level: LogLevel;
  time: string;
  source: string;
  ref?: string;
  message: string;
  error?: DescribedError;
  context?: Record<string, unknown>;
}

function emit(entry: LogEntry) {
  const write = entry.level === "info" ? console.log : entry.level === "warn" ? console.warn : console.error;
  if (process.env.NODE_ENV === "production") {
    write(JSON.stringify(entry));
    return;
  }
  const head = `[koti][${entry.level.toUpperCase()}] ${entry.source}${entry.ref ? ` ref=${entry.ref}` : ""} — ${entry.message}`;
  const lines = [head];
  for (let e = entry.error, i = 0; e; e = e.cause, i++) {
    lines.push(`  ${i === 0 ? "erreur" : "cause"} : ${e.name}${e.code ? ` [${e.code}]` : ""}${e.status ? ` (HTTP ${e.status})` : ""} — ${e.message.split("\n")[0]}`);
    if (e.pg) lines.push(`    PostgreSQL : ${Object.entries(e.pg).map(([k, v]) => `${k}=${v}`).join(", ")}`);
    if (i === 0 && e.stack) lines.push(...e.stack.split("\n").slice(0, 8).map((l) => `    ${l.trim()}`));
  }
  if (entry.context && Object.keys(entry.context).length) lines.push(`  contexte : ${JSON.stringify(entry.context)}`);
  write(lines.join("\n"));
}

/**
 * Journalise une erreur et renvoie sa référence. `ref` : à fournir quand l'utilisateur voit déjà un code
 * (ex. le `digest` de Next.js) pour que les deux concordent.
 */
export function logError(source: string, err: unknown, context?: Record<string, unknown>, options: { ref?: string; message?: string } = {}): string {
  const ref = options.ref ?? newRef();
  const error = describeError(err);
  emit({ level: "error", time: new Date().toISOString(), source, ref, message: options.message ?? (error.message.split("\n")[0] || error.name), error, context: cleanContext(context) });
  return ref;
}

export function logWarn(source: string, message: string, context?: Record<string, unknown>, err?: unknown) {
  emit({ level: "warn", time: new Date().toISOString(), source, message, error: err === undefined ? undefined : describeError(err), context: cleanContext(context) });
}

export function logInfo(source: string, message: string, context?: Record<string, unknown>) {
  emit({ level: "info", time: new Date().toISOString(), source, message, context: cleanContext(context) });
}
