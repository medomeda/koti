import "server-only";
import { count, sql } from "drizzle-orm";
import { isDemoMode } from "@/lib/demo";
import { rethrowIfUnavailable } from "./availability";
import { getDb } from "./client";
import { buildDemoState } from "./seed-pg";
import { users } from "./schema";
import { insertAllIn } from "./uow";

/**
 * Prépare la base au premier accès du processus : si elle est vide et que l'instance est une démonstration
 * (développement, ou KOTI_DEMO_MODE=1), le jeu de démonstration y est importé. Une instance de production n'est
 * jamais peuplée automatiquement. Mémoïsé : une seule vérification par processus ; un échec est rejoué au prochain accès.
 */
let ready: Promise<void> | null = null;

export function ensureReady(): Promise<void> {
  ready ??= run().catch((err) => {
    ready = null; // la prochaine requête réessaie (base démarrée entre-temps)
    return rethrowIfUnavailable(err);
  });
  return ready;
}

async function run(): Promise<void> {
  if (!isDemoMode() || !process.env.DATABASE_URL) return;
  const db = getDb();
  const [row] = await db.select({ n: count() }).from(users);
  if (row && row.n > 0) return;
  // Deux démarrages simultanés (plusieurs processus) : le premier importe, l'autre attend le verrou puis constate.
  await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(7352003)`);
    const [again] = await tx.select({ n: count() }).from(users);
    if (again && again.n > 0) return;
    await insertAllIn(tx, buildDemoState());
  });
}

/**
 * Réinitialise le jeu de démonstration : vide toutes les tables puis réimporte les données fictives.
 * Le journal d'audit est protégé par un déclencheur : il est suspendu le temps de l'opération (droit du propriétaire de la table).
 */
export async function resetDemoData(): Promise<void> {
  const db = getDb();
  await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(7352003)`);
    await tx.execute(sql`alter table audit_logs disable trigger user`);
    const { rows } = await tx.execute<{ tablename: string }>(sql`select tablename from pg_tables where schemaname = 'public'`);
    const names = rows.map((r) => `"${r.tablename}"`).join(", ");
    await tx.execute(sql.raw(`truncate ${names} restart identity cascade`));
    await insertAllIn(tx, buildDemoState());
    await tx.execute(sql`alter table audit_logs enable trigger user`);
  });
  ready = Promise.resolve();
}
