import { sql } from "drizzle-orm";
import { boolean, index, pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { accountStatus, platformRole } from "./enums";
import { createdAt, id, instant, updatedAt } from "./columns";

/** Comptes. Les clients et membres ont le rôle USER ; l'équipe KOTI SUPPORT ou SUPER_ADMIN. */
export const users = pgTable(
  "users",
  {
    id: id(),
    /** Nom complet : copie utilisée par Better Auth (la source métier reste `user_profiles.full_name`, tenue à jour avec elle). */
    name: text("name").notNull().default(""),
    email: text("email").notNull(),
    emailVerified: boolean("email_verified").notNull().default(false),
    platformRole: platformRole("platform_role").notNull().default("USER"),
    status: accountStatus("status").notNull().default("ACTIVE"),
    image: text("image"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("users_email_unique").on(sql`lower(${t.email})`), index("users_platform_role_idx").on(t.platformRole)],
);

export const userProfiles = pgTable(
  "user_profiles",
  {
    userId: uuid("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
    fullName: text("full_name").notNull(),
    phone: text("phone").notNull(),
    avatarUrl: text("avatar_url"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("user_profiles_phone_unique").on(t.phone)],
);

/**
 * Tables de Better Auth (authentification). Les noms de colonnes suivent son schéma ; les identifiants sont des UUID.
 * - `accounts` : une ligne « credential » par utilisateur (le mot de passe haché, format scrypt maison conservé) ;
 * - `sessions` : sessions ouvertes (jeton signé dans le cookie) ;
 * - `verifications` : jetons à usage unique (vérification d'e-mail, réinitialisation de mot de passe).
 */
export const sessions = pgTable(
  "sessions",
  {
    id: id(),
    token: text("token").notNull(),
    expiresAt: instant("expires_at").notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("sessions_token_unique").on(t.token), index("sessions_user_idx").on(t.userId), index("sessions_expires_idx").on(t.expiresAt)],
);

export const accounts = pgTable(
  "accounts",
  {
    id: id(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: instant("access_token_expires_at"),
    refreshTokenExpiresAt: instant("refresh_token_expires_at"),
    scope: text("scope"),
    password: text("password"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("accounts_provider_account_unique").on(t.providerId, t.accountId), index("accounts_user_idx").on(t.userId)],
);

export const verifications = pgTable(
  "verifications",
  {
    id: id(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: instant("expires_at").notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("verifications_identifier_idx").on(t.identifier)],
);
