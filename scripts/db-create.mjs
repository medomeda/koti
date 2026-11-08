// Crée la base de données de l'application si elle n'existe pas (idempotent). N'altère jamais les autres bases du serveur.
import { config } from "dotenv";
import pg from "pg";

config({ path: [".env.local", ".env"] });
const raw = process.env.DATABASE_URL;
if (!raw) throw new Error("DATABASE_URL manquant (voir .env.local).");
const target = new URL(raw);
const name = decodeURIComponent(target.pathname.slice(1));
if (!/^[a-z][a-z0-9_]{0,62}$/.test(name)) throw new Error(`Nom de base invalide : ${name}`);
const admin = new URL(raw);
admin.pathname = "/postgres";
const client = new pg.Client({ connectionString: admin.toString() });
await client.connect();
try {
  const exists = (await client.query("select 1 from pg_database where datname = $1", [name])).rowCount;
  if (exists) console.log(`Base « ${name} » déjà présente : rien à faire.`);
  else {
    await client.query(`create database "${name}" encoding 'UTF8'`);
    console.log(`Base « ${name} » créée.`);
  }
} finally {
  await client.end();
}
