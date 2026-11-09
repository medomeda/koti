import "server-only";
import { sql } from "drizzle-orm";
import { describeDatabaseError, isDatabaseUnavailable } from "./availability";
import { getDb } from "./client";

export type DatabaseStatus = { ok: true } | { ok: false; detail: string };

const OK_FOR_MS = 10_000; // un succès est retenu quelques secondes : le contrôle ne coûte pas une requête par page
let okUntil = 0;
let inFlight: Promise<DatabaseStatus> | null = null;

/** La base répond-elle ? (`select 1`, succès mémorisé 10 s, une seule vérification à la fois, échec jamais mémorisé.) */
export function checkDatabase(): Promise<DatabaseStatus> {
  if (Date.now() < okUntil) return Promise.resolve({ ok: true });
  inFlight ??= (async (): Promise<DatabaseStatus> => {
    try {
      await getDb().execute(sql`select 1`);
      okUntil = Date.now() + OK_FOR_MS;
      return { ok: true };
    } catch (err) {
      // Seules les pannes de connexion sont présentées comme « indisponibilité » ; le reste est une vraie erreur à remonter.
      if (!isDatabaseUnavailable(err)) throw err;
      return { ok: false, detail: describeDatabaseError(err) };
    } finally {
      inFlight = null;
    }
  })();
  return inFlight;
}
