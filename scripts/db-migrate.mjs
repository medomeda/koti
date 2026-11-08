// Applique les migrations SQL du dossier ./drizzle sur la base DATABASE_URL (idempotent).
import { config } from "dotenv";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";

config({ path: [".env.local", ".env"] });
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL manquant (voir .env.local).");
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
try {
  await migrate(drizzle(pool), { migrationsFolder: "./drizzle" });
  console.log("Migrations appliquées.");
} finally {
  await pool.end();
}
