// Applique les migrations SQL du dossier ./drizzle sur la base DATABASE_URL (idempotent).
import { config } from "dotenv";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";

config({ path: [".env.local", ".env"], quiet: true });
// « --test » : migre la base de tests (DATABASE_URL_TEST) au lieu de la base applicative.
const url = process.argv.includes("--test") ? process.env.DATABASE_URL_TEST : process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL (ou DATABASE_URL_TEST avec --test) manquant : voir .env.local.");
const pool = new pg.Pool({ connectionString: url, max: 1 });
try {
  await migrate(drizzle(pool), { migrationsFolder: "./drizzle" });
  console.log(`Migrations appliquées sur « ${decodeURIComponent(new URL(url).pathname.slice(1))} ».`);
} finally {
  await pool.end();
}
