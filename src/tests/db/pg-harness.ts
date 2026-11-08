import { buildDemoState } from "@/server/db/seed-pg";
import type { Connection } from "@/server/db/client";
import { insertAll, load, pgRead, type Scope } from "@/server/db/uow";
import type { DbState } from "@/server/db/store";
import { APIError } from "better-auth/api";
import { createAuth, type Auth } from "@/server/auth";
import { resetTestDb } from "./helpers";

const auths = new WeakMap<Connection, Auth>();
/** Better Auth branché sur la base de test (sans le plugin Next.js : les tests appellent l'API hors requête). */
export function authFor(conn: Connection): Auth {
  let a = auths.get(conn);
  if (!a) auths.set(conn, (a = createAuth(conn.db, { nextCookies: false })));
  return a;
}

/** Connexion par e-mail et mot de passe : id du compte, null si identifiants incorrects, erreur si compte suspendu. */
export async function authenticate(conn: Connection, email: string, password: string): Promise<string | null> {
  try {
    const res = await authFor(conn).api.signInEmail({ body: { email, password }, headers: new Headers() });
    return res.user.id;
  } catch (err) {
    if (!(err instanceof APIError)) throw err;
    if (err.statusCode === 403) throw new Error(err.message);
    return null;
  }
}

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
