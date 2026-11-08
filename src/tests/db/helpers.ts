import { sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { createConnection, type Connection } from "@/server/db/client";

export const TEST_DATABASE_URL = process.env.DATABASE_URL_TEST;
export const hasTestDb = Boolean(TEST_DATABASE_URL);

/**
 * Connexion à la base de TESTS, migrée à jour. Garde-fou : le nom de la base doit se terminer par « _test »,
 * pour qu'une mauvaise variable d'environnement ne vide jamais la vraie base.
 */
export async function openTestDb(): Promise<Connection> {
  const url = TEST_DATABASE_URL!;
  const name = decodeURIComponent(new URL(url).pathname.slice(1));
  if (!name.endsWith("_test")) throw new Error(`Refus : « ${name} » n'est pas une base de tests (nom en _test attendu).`);
  const conn = createConnection(url, { max: 5 });
  await migrate(conn.db, { migrationsFolder: "./drizzle" });
  return conn;
}

/** Vide toutes les tables (sans les déclencheurs : le journal d'audit refuse TRUNCATE en temps normal). */
export async function resetTestDb(conn: Connection): Promise<void> {
  const client = await conn.pool.connect();
  try {
    const { rows } = await client.query<{ tablename: string }>("select tablename from pg_tables where schemaname = 'public'");
    await client.query("set session_replication_role = replica");
    if (rows.length) await client.query(`truncate ${rows.map((r) => `"${r.tablename}"`).join(", ")} restart identity cascade`);
  } finally {
    await client.query("reset session_replication_role").catch(() => undefined);
    client.release();
  }
}

export { sql };
