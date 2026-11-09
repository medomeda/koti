import "server-only";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { rethrowIfUnavailable } from "./availability";
import * as schema from "./schema";
import { logError } from "./../log";

/**
 * Accès PostgreSQL (phase 2). Remplacera le magasin simulé `store.ts` service par service.
 * - `Db` : connexion pour les lectures ; `Tx` : transaction en cours ; `Executor` : l'un ou l'autre
 *   (un service qui n'écrit pas accepte un `Executor` et fonctionne dans les deux cas).
 * - Les dates calendaires sont des chaînes « AAAA-MM-JJ » ; les instants sont des `Date` (UTC).
 */
export type Db = NodePgDatabase<typeof schema>;
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
export type Executor = Db | Tx;

export interface Connection {
  db: Db;
  pool: Pool;
  close: () => Promise<void>;
}

export function createConnection(url: string, options: { max?: number } = {}): Connection {
  // connectionTimeoutMillis : une base injoignable fait échouer la requête au bout de 5 s au lieu de la laisser pendre indéfiniment.
  const pool = new Pool({ connectionString: url, max: options.max ?? 10, idleTimeoutMillis: 30_000, connectionTimeoutMillis: 5_000 });
  // Une erreur sur une connexion inactive ne doit pas faire tomber le processus.
  pool.on("error", (err) => logError("postgres.pool", err, undefined, { message: "connexion PostgreSQL inactive en erreur" }));
  return { db: drizzle(pool, { schema }), pool, close: () => pool.end() };
}

// Une seule connexion par processus, y compris avec le rechargement à chaud de Next.js en développement.
const g = globalThis as typeof globalThis & { __kotiPg?: Connection };

export function getDb(): Db {
  if (!g.__kotiPg) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL est absent : renseignez-le dans .env.local (voir .env.example).");
    g.__kotiPg = createConnection(url);
  }
  return g.__kotiPg.db;
}

/** Tests d'intégration : fait de cette connexion la connexion par défaut du processus (sans toucher à DATABASE_URL). */
export function useConnection(conn: Connection | null): void {
  g.__kotiPg = conn ?? undefined;
}

const RETRYABLE = new Set(["40001" /* échec de sérialisation */, "40P01" /* interblocage */]);
const sqlState = (err: unknown): string | undefined => {
  // Drizzle enveloppe l'erreur du pilote : le code SQLSTATE peut être sur l'erreur ou sur sa cause.
  const e = err as { code?: string; cause?: { code?: string } };
  return e?.code ?? e?.cause?.code;
};

/**
 * Exécute `fn` dans UNE transaction : tout est validé, ou rien. Si PostgreSQL annule la transaction à cause d'un
 * conflit de concurrence (sérialisation, interblocage), elle est rejouée jusqu'à 3 fois : `fn` doit donc n'avoir
 * aucun effet de bord hors base (pas d'e-mail envoyé à l'intérieur).
 */
export async function transaction<T>(fn: (tx: Tx) => Promise<T>, db: Db = getDb()): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await db.transaction(fn);
    } catch (err) {
      const code = sqlState(err);
      if (attempt >= 3 || !code || !RETRYABLE.has(code)) return rethrowIfUnavailable(err);
    }
  }
}
