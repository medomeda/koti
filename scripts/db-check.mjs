// Contrôle de santé du schéma : tables, contraintes clés, journal en ajout seul.
import { config } from "dotenv";
import pg from "pg";

config({ path: [".env.local", ".env"], quiet: true });
const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
await c.connect();
try {
  const tables = (await c.query("select table_name from information_schema.tables where table_schema='public' and table_type='BASE TABLE' order by 1")).rows.map((r) => r.table_name);
  console.log(`${tables.length} tables :`, tables.join(", "));
  const q = async (sql) => (await c.query(sql)).rows[0].n;
  console.log("clés étrangères :", await q("select count(*)::int n from information_schema.table_constraints where constraint_type='FOREIGN KEY' and table_schema='public'"));
  console.log("contraintes d'unicité :", await q("select count(*)::int n from pg_indexes where schemaname='public' and indexdef like 'CREATE UNIQUE%'"));
  console.log("contraintes CHECK :", await q("select count(*)::int n from pg_constraint where contype='c' and connamespace='public'::regnamespace"));
  console.log("migrations enregistrées :", await q("select count(*)::int n from drizzle.__drizzle_migrations"));
  // Le journal d'audit refuse toute modification (test dans une transaction annulée).
  await c.query("begin");
  const u = (await c.query("insert into users(email) values ('check@koti.test') returning id")).rows[0].id;
  await c.query("insert into audit_logs(actor_id, action, entity_type) values ($1,'check','check')", [u]);
  for (const sql of ["update audit_logs set action='x'", "delete from audit_logs", "truncate audit_logs"]) {
    await c.query("savepoint s");
    try { await c.query(sql); console.log("ERREUR : accepté →", sql); } catch { console.log("refusé ✓", sql.split(" ")[0]); }
    await c.query("rollback to s");
  }
  await c.query("rollback");
  console.log("lignes laissées dans users :", await q("select count(*)::int n from users"));
} finally {
  await c.end();
}
