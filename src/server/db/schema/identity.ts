import { sql } from "drizzle-orm";
import { boolean, index, pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { accountStatus, platformRole } from "./enums";
import { createdAt, id, instant, updatedAt } from "./columns";

/** Comptes. Les clients et membres ont le rôle USER ; l'équipe KOTI SUPPORT ou SUPER_ADMIN. */
export const users = pgTable(
  "users",
  {
    id: id(),
    email: text("email").notNull(),
    emailVerified: boolean("email_verified").notNull().default(false),
    platformRole: platformRole("platform_role").notNull().default("USER"),
    status: accountStatus("status").notNull().default("ACTIVE"),
    createdAt: createdAt(),
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

/** Mot de passe (scrypt). Remplacé par les tables Better Auth à l'étape « authentification ». */
export const credentials = pgTable("credentials", {
  userId: uuid("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  passwordHash: text("password_hash").notNull(),
});

/** Sessions : seule l'empreinte SHA-256 du jeton est stockée. */
export const sessions = pgTable(
  "sessions",
  {
    tokenHash: text("token_hash").primaryKey(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    expiresAt: instant("expires_at").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("sessions_user_idx").on(t.userId), index("sessions_expires_idx").on(t.expiresAt)],
);
