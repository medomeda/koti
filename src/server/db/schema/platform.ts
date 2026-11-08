import { sql } from "drizzle-orm";
import { boolean, check, index, integer, jsonb, pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { createdAt, day, id, instant, updatedAt } from "./columns";
import { announcementTone, contactStatus, contactTopic, planId, staffInvitationStatus, subscriptionStatus } from "./enums";
import { users } from "./identity";
import { tontines } from "./tontines";

/** Abonnement d'un client (un seul par utilisateur). Simulé : aucun paiement réel avant l'intégration Mobile Money. */
export const subscriptions = pgTable(
  "subscriptions",
  {
    id: id(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
    planId: planId("plan_id").notNull().default("FREE"),
    status: subscriptionStatus("status").notNull().default("ACTIVE"),
    startedAt: instant("started_at").notNull(),
    trialEndsAt: instant("trial_ends_at"),
    trialUsed: boolean("trial_used").notNull().default(false),
    currentPeriodStart: day("current_period_start"),
    currentPeriodEnd: day("current_period_end"),
    canceledAt: instant("canceled_at"),
  },
  (t) => [uniqueIndex("subscriptions_user_unique").on(t.userId), index("subscriptions_plan_idx").on(t.planId, t.status)],
);

/** Facture simulée. Le montant est figé à l'émission : un changement de prix ne modifie jamais l'historique. */
export const invoices = pgTable(
  "invoices",
  {
    id: id(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
    subscriptionId: uuid("subscription_id").notNull().references(() => subscriptions.id, { onDelete: "restrict" }),
    /** « KOTI-2026-0001 » */
    number: text("number").notNull(),
    planId: planId("plan_id").notNull(),
    planName: text("plan_name").notNull(),
    amount: integer("amount").notNull(),
    periodStart: day("period_start").notNull(),
    periodEnd: day("period_end").notNull(),
    issuedAt: instant("issued_at").notNull(),
  },
  (t) => [
    uniqueIndex("invoices_number_unique").on(t.number),
    // Facturation idempotente : une seule facture par abonnement et par période.
    uniqueIndex("invoices_period_unique").on(t.subscriptionId, t.periodStart),
    index("invoices_user_idx").on(t.userId, t.issuedAt),
    check("invoices_amount_positive", sql`${t.amount} > 0`),
  ],
);

/** Réglages d'offres modifiés depuis l'administration (absence de ligne = valeurs d'origine de `plans.ts`). */
export const planSettings = pgTable(
  "plan_settings",
  {
    planId: planId("plan_id").primaryKey(),
    name: text("name").notNull(),
    tagline: text("tagline").notNull().default(""),
    monthlyPrice: integer("monthly_price").notNull(),
    limits: jsonb("limits").$type<{ tontines: number; membersPerTontine: number; ticketsPerTontine: number; multipleTickets: boolean }>().notNull(),
    updatedAt: updatedAt(),
    updatedBy: uuid("updated_by").notNull().references(() => users.id, { onDelete: "restrict" }),
  },
  (t) => [check("plan_settings_price_nonnegative", sql`${t.monthlyPrice} >= 0`)],
);

/** Note interne de l'équipe sur un client : jamais visible par le client. */
export const adminNotes = pgTable(
  "admin_notes",
  {
    id: id(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
    authorId: uuid("author_id").notNull().references(() => users.id, { onDelete: "restrict" }),
    text: text("text").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("admin_notes_user_idx").on(t.userId, t.createdAt)],
);

/** Messages du formulaire de contact du site vitrine (visiteurs non connectés). */
export const contactRequests = pgTable(
  "contact_requests",
  {
    id: id(),
    name: text("name").notNull(),
    email: text("email").notNull(),
    phone: text("phone").notNull().default(""),
    topic: contactTopic("topic").notNull(),
    message: text("message").notNull(),
    status: contactStatus("status").notNull().default("NEW"),
    createdAt: createdAt(),
    handledBy: uuid("handled_by").references(() => users.id, { onDelete: "set null" }),
    handledAt: instant("handled_at"),
    reply: text("reply"),
  },
  (t) => [index("contact_requests_status_idx").on(t.status, t.createdAt), index("contact_requests_email_idx").on(t.email, t.createdAt)],
);

export const announcements = pgTable(
  "announcements",
  {
    id: id(),
    title: text("title").notNull(),
    message: text("message").notNull(),
    tone: announcementTone("tone").notNull().default("info"),
    active: boolean("active").notNull().default(true),
    /** Fin d'affichage (null = jusqu'au retrait manuel). */
    endsAt: instant("ends_at"),
    createdBy: uuid("created_by").notNull().references(() => users.id, { onDelete: "restrict" }),
    createdAt: createdAt(),
  },
  (t) => [index("announcements_active_idx").on(t.active, t.endsAt)],
);

/** Invitation d'un collaborateur dans l'équipe KOTI : seule l'empreinte du jeton est stockée. */
export const staffInvitations = pgTable(
  "staff_invitations",
  {
    id: id(),
    email: text("email").notNull(),
    role: text("role").$type<"SUPPORT" | "SUPER_ADMIN">().notNull(),
    tokenHash: text("token_hash").notNull(),
    status: staffInvitationStatus("status").notNull().default("PENDING"),
    invitedBy: uuid("invited_by").notNull().references(() => users.id, { onDelete: "restrict" }),
    expiresAt: instant("expires_at").notNull(),
    createdAt: createdAt(),
    acceptedAt: instant("accepted_at"),
  },
  (t) => [uniqueIndex("staff_invitations_token_unique").on(t.tokenHash), check("staff_invitations_role_valid", sql`${t.role} in ('SUPPORT','SUPER_ADMIN')`)],
);

/** Journal d'audit : append-only (un déclencheur interdit toute modification ou suppression, voir la migration SQL dédiée). */
export const auditLogs = pgTable(
  "audit_logs",
  {
    id: id(),
    actorId: uuid("actor_id").notNull().references(() => users.id, { onDelete: "restrict" }),
    tontineId: uuid("tontine_id").references(() => tontines.id, { onDelete: "restrict" }),
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id"),
    oldValues: jsonb("old_values").$type<Record<string, unknown>>(),
    newValues: jsonb("new_values").$type<Record<string, unknown>>(),
    reason: text("reason"),
    createdAt: createdAt(),
  },
  (t) => [index("audit_logs_tontine_idx").on(t.tontineId, t.createdAt), index("audit_logs_action_idx").on(t.action, t.createdAt), index("audit_logs_actor_idx").on(t.actorId, t.createdAt)],
);

/** Verrous des tâches planifiées (une exécution par clé et par période, même avec plusieurs instances). */
export const jobRuns = pgTable("job_runs", {
  key: text("key").primaryKey(),
  ranAt: instant("ran_at").notNull().defaultNow(),
});
