import { index, pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { createdAt, id, instant } from "./columns";
import { users } from "./identity";

/**
 * Notifications push (Web Push) : un abonnement par appareil et navigateur. Le point d'accès (`endpoint`) est propre
 * à l'appareil ; s'il change de compte (autre personne connectée sur le même appareil), la ligne est réattribuée.
 * Un abonnement refusé par le service push (404/410) est supprimé à l'envoi.
 */
export const pushSubscriptions = pgTable(
  "push_subscriptions",
  {
    id: id(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    endpoint: text("endpoint").notNull(),
    p256dh: text("p256dh").notNull(),
    auth: text("auth").notNull(),
    userAgent: text("user_agent"),
    createdAt: createdAt(),
    lastSuccessAt: instant("last_success_at"),
  },
  (t) => [uniqueIndex("push_subscriptions_endpoint_unique").on(t.endpoint), index("push_subscriptions_user_idx").on(t.userId)],
);

/** Catégories de notifications push choisies par l'utilisateur (par défaut : toutes). */
export const pushPreferences = pgTable("push_preferences", {
  userId: uuid("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  categories: text("categories").array().notNull().default(["echeances", "paiements", "tontines"]),
});
