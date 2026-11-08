import { buildDemoState } from "@/server/db/seed-pg";
import type { Connection } from "@/server/db/client";
import { insertAll, load, pgRead, type Scope } from "@/server/db/uow";
import type { DbState } from "@/server/db/store";
import { resetTestDb } from "./helpers";

/** Repart d'une base de test vide et y insère le jeu de démonstration complet. */
export async function resetWithDemo(conn: Connection): Promise<DbState> {
  await resetTestDb(conn);
  const demo = buildDemoState();
  await insertAll(demo, conn.db);
  return demo; // les identifiants du jeu de démonstration, utiles pour retrouver un compte par son e-mail
}

/** Lecture de tout l'état (comme `read()` du magasin simulé) pour les assertions des tests. */
export const snapshot = <T>(conn: Connection, fn: (s: DbState) => T): Promise<T> => pgRead({ everything: true }, (s) => fn(s as DbState), conn.db);

export { load, pgRead };
export type { Scope };
