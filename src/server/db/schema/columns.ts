import { sql } from "drizzle-orm";
import { date, timestamp, uuid } from "drizzle-orm/pg-core";

/**
 * Colonnes communes.
 * - Identifiants : UUID générés par l'application (`newId()`), avec une valeur par défaut côté base en secours.
 * - Instants : `timestamptz` en UTC (le domaine les manipule en ISO 8601 : conversion à la frontière du dépôt).
 * - Dates calendaires (échéances, dates de paiement) : `date` en chaîne « AAAA-MM-JJ », sans fuseau.
 */
export const id = () => uuid("id").primaryKey().default(sql`gen_random_uuid()`);
export const fk = (name: string) => uuid(name);
export const instant = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });
export const createdAt = () => instant("created_at").notNull().defaultNow();
export const updatedAt = () => instant("updated_at").notNull().defaultNow();
export const day = (name: string) => date(name, { mode: "string" });
