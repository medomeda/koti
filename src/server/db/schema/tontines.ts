import { sql } from "drizzle-orm";
import { boolean, check, index, integer, jsonb, pgTable, text, unique, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import type { FrequencyConfig, ISODate } from "@/types/domain";
import { bytea, createdAt, day, id, instant, updatedAt } from "./columns";
import {
  frequency,
  invitationStatus,
  memberRole,
  memberStatus,
  notificationType,
  obligationStatus,
  paymentMethod,
  paymentProofMode,
  paymentStatus,
  periodStatus,
  rotationCycleStatus,
  rotationMode,
  rotationStatus,
  ticketStatus,
  tontineStatus,
} from "./enums";
import { users } from "./identity";

export const tontines = pgTable(
  "tontines",
  {
    id: id(),
    name: text("name").notNull(),
    description: text("description").notNull().default(""),
    contributionAmount: integer("contribution_amount").notNull(),
    currency: text("currency").notNull().default("XOF"),
    frequency: frequency("frequency").notNull(),
    frequencyConfig: jsonb("frequency_config").$type<FrequencyConfig>().notNull().default({}),
    startDate: day("start_date").notNull(),
    expectedMemberCount: integer("expected_member_count").notNull(),
    rotationMode: rotationMode("rotation_mode").notNull().default("MANUAL"),
    multipleTicketsAllowed: boolean("multiple_tickets_allowed").notNull().default(false),
    maxTicketsPerMember: integer("max_tickets_per_member").notNull().default(1),
    /** Compteur : un numéro de ticket n'est jamais réutilisé, même après suppression avant démarrage. */
    nextTicketNumber: integer("next_ticket_number").notNull().default(1),
    paymentProofMode: paymentProofMode("payment_proof_mode").notNull().default("OPTIONAL"),
    membersSeePayments: boolean("members_see_payments").notNull().default(false),
    status: tontineStatus("status").notNull().default("DRAFT"),
    /** Fenêtres de suspension : [{ from, to|null }]. */
    pauses: jsonb("pauses").$type<Array<{ from: ISODate; to: ISODate | null }>>().notNull().default([]),
    creatorId: uuid("creator_id").notNull().references(() => users.id, { onDelete: "restrict" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("tontines_creator_idx").on(t.creatorId),
    index("tontines_status_idx").on(t.status),
    check("tontines_amount_positive", sql`${t.contributionAmount} > 0`),
    check("tontines_members_positive", sql`${t.expectedMemberCount} >= 2`),
    check("tontines_max_tickets_positive", sql`${t.maxTicketsPerMember} >= 1`),
    check("tontines_next_ticket_positive", sql`${t.nextTicketNumber} >= 1`),
  ],
);

/** Une personne = une seule adhésion par tontine (réactivée si elle revient) ; elle peut porter plusieurs tickets. */
export const tontineMembers = pgTable(
  "tontine_members",
  {
    id: id(),
    tontineId: uuid("tontine_id").notNull().references(() => tontines.id, { onDelete: "restrict" }),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
    role: memberRole("role").notNull().default("MEMBER"),
    status: memberStatus("status").notNull().default("ACTIVE"),
    joinedAt: instant("joined_at").notNull(),
    createdAt: createdAt(),
  },
  (t) => [unique("tontine_members_tontine_user_unique").on(t.tontineId, t.userId), index("tontine_members_user_idx").on(t.userId), index("tontine_members_tontine_idx").on(t.tontineId, t.status)],
);

export const rotationCycles = pgTable(
  "rotation_cycles",
  {
    id: id(),
    tontineId: uuid("tontine_id").notNull().references(() => tontines.id, { onDelete: "restrict" }),
    status: rotationCycleStatus("status").notNull().default("ACTIVE"),
    /** Nombre de tours du cycle (= tickets actifs au démarrage). */
    size: integer("size").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("rotation_cycles_tontine_idx").on(t.tontineId), check("rotation_cycles_size_positive", sql`${t.size} >= 1`)],
);

export const tontineTickets = pgTable(
  "tontine_tickets",
  {
    id: id(),
    tontineId: uuid("tontine_id").notNull().references(() => tontines.id, { onDelete: "restrict" }),
    memberId: uuid("member_id").notNull().references(() => tontineMembers.id, { onDelete: "restrict" }),
    ticketNumber: integer("ticket_number").notNull(),
    status: ticketStatus("status").notNull().default("ACTIVE"),
    createdBy: uuid("created_by").notNull().references(() => users.id, { onDelete: "restrict" }),
    createdAt: createdAt(),
    /** Suppression logique (avant démarrage uniquement) : la trace d'audit est conservée. */
    deletedAt: instant("deleted_at"),
  },
  (t) => [unique("tontine_tickets_number_unique").on(t.tontineId, t.ticketNumber), index("tontine_tickets_member_idx").on(t.memberId), check("tontine_tickets_number_positive", sql`${t.ticketNumber} >= 1`)],
);

export const invitations = pgTable(
  "invitations",
  {
    id: id(),
    tontineId: uuid("tontine_id").notNull().references(() => tontines.id, { onDelete: "restrict" }),
    invitedEmail: text("invited_email"),
    invitedPhone: text("invited_phone"),
    invitedUserId: uuid("invited_user_id").references(() => users.id, { onDelete: "set null" }),
    tokenHash: text("token_hash").notNull(),
    status: invitationStatus("status").notNull().default("PENDING"),
    invitedBy: uuid("invited_by").notNull().references(() => users.id, { onDelete: "restrict" }),
    expiresAt: instant("expires_at").notNull(),
    respondedAt: instant("responded_at"),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("invitations_token_unique").on(t.tokenHash),
    index("invitations_tontine_idx").on(t.tontineId, t.status),
    index("invitations_user_idx").on(t.invitedUserId),
    check("invitations_has_contact", sql`${t.invitedEmail} is not null or ${t.invitedPhone} is not null`),
  ],
);

export const contributionPeriods = pgTable(
  "contribution_periods",
  {
    id: id(),
    tontineId: uuid("tontine_id").notNull().references(() => tontines.id, { onDelete: "restrict" }),
    periodNumber: integer("period_number").notNull(),
    dueDate: day("due_date").notNull(),
    status: periodStatus("status").notNull().default("OPEN"),
    createdAt: createdAt(),
  },
  (t) => [unique("contribution_periods_number_unique").on(t.tontineId, t.periodNumber)],
);

export const contributionObligations = pgTable(
  "contribution_obligations",
  {
    id: id(),
    tontineId: uuid("tontine_id").notNull().references(() => tontines.id, { onDelete: "restrict" }),
    periodId: uuid("period_id").notNull().references(() => contributionPeriods.id, { onDelete: "restrict" }),
    /** Adhésion propriétaire du ticket (dénormalisée pour les filtres et l'affichage). */
    memberId: uuid("member_id").notNull().references(() => tontineMembers.id, { onDelete: "restrict" }),
    ticketId: uuid("ticket_id").notNull().references(() => tontineTickets.id, { onDelete: "restrict" }),
    expectedAmount: integer("expected_amount").notNull(),
    dueDate: day("due_date").notNull(),
    status: obligationStatus("status").notNull().default("PENDING"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    // Règle métier : une obligation par ticket et par période (rend la génération des échéances idempotente).
    unique("contribution_obligations_period_ticket_unique").on(t.periodId, t.ticketId),
    index("contribution_obligations_tontine_idx").on(t.tontineId, t.dueDate),
    index("contribution_obligations_member_idx").on(t.memberId, t.status),
    check("contribution_obligations_amount_positive", sql`${t.expectedAmount} > 0`),
  ],
);

/**
 * Justificatifs de paiement : image déjà compressée (WebP), stockée dans la base pour être sauvegardée avec le reste.
 * Table volontairement hors de l'état applicatif (octets jamais chargés par l'unité de travail) ; un justificatif
 * envoyé mais jamais joint à une déclaration est purgé par la tâche horaire.
 */
export const paymentProofs = pgTable(
  "payment_proofs",
  {
    id: id(),
    tontineId: uuid("tontine_id").notNull().references(() => tontines.id, { onDelete: "cascade" }),
    uploadedBy: uuid("uploaded_by").notNull().references(() => users.id, { onDelete: "restrict" }),
    mimeType: text("mime_type").notNull(),
    width: integer("width").notNull(),
    height: integer("height").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    data: bytea("data").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("payment_proofs_tontine_idx").on(t.tontineId), index("payment_proofs_uploader_idx").on(t.uploadedBy, t.createdAt)],
);

export const payments = pgTable(
  "payments",
  {
    id: id(),
    obligationId: uuid("obligation_id").notNull().references(() => contributionObligations.id, { onDelete: "restrict" }),
    amount: integer("amount").notNull(),
    paymentDate: day("payment_date").notNull(),
    paymentMethod: paymentMethod("payment_method").notNull(),
    reference: text("reference").notNull().default(""),
    comment: text("comment").notNull().default(""),
    status: paymentStatus("status").notNull().default("DECLARED"),
    declaredBy: uuid("declared_by").notNull().references(() => users.id, { onDelete: "restrict" }),
    validatedBy: uuid("validated_by").references(() => users.id, { onDelete: "restrict" }),
    validatedAt: instant("validated_at"),
    rejectionReason: text("rejection_reason").notNull().default(""),
    proofId: uuid("proof_id").references(() => paymentProofs.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("payments_proof_unique").on(t.proofId).where(sql`${t.proofId} is not null`),
    index("payments_obligation_idx").on(t.obligationId),
    // Au plus une déclaration en attente ou validée par obligation (une déclaration refusée peut être refaite).
    uniqueIndex("payments_one_open_per_obligation").on(t.obligationId).where(sql`${t.status} in ('DECLARED','PAID')`),
    check("payments_amount_positive", sql`${t.amount} > 0`),
  ],
);

export const rotationSlots = pgTable(
  "rotation_slots",
  {
    id: id(),
    tontineId: uuid("tontine_id").notNull().references(() => tontines.id, { onDelete: "restrict" }),
    /** Cycle de rattachement ; null tant que la tontine n'a pas démarré. */
    cycleId: uuid("cycle_id").references(() => rotationCycles.id, { onDelete: "restrict" }),
    memberId: uuid("member_id").notNull().references(() => tontineMembers.id, { onDelete: "restrict" }),
    /** La rotation est organisée par ticket : un tour de main par ticket. */
    ticketId: uuid("ticket_id").notNull().references(() => tontineTickets.id, { onDelete: "restrict" }),
    position: integer("position").notNull(),
    scheduledDate: day("scheduled_date"),
    status: rotationStatus("status").notNull().default("UPCOMING"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    // Un seul tour actif par ticket (les tours annulés restent pour l'historique).
    uniqueIndex("rotation_slots_one_live_per_ticket").on(t.ticketId).where(sql`${t.status} <> 'CANCELLED'`),
    index("rotation_slots_tontine_idx").on(t.tontineId, t.position),
    index("rotation_slots_member_idx").on(t.memberId),
    check("rotation_slots_position_positive", sql`${t.position} >= 1`),
  ],
);

export const notifications = pgTable(
  "notifications",
  {
    id: id(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    tontineId: uuid("tontine_id").references(() => tontines.id, { onDelete: "set null" }),
    type: notificationType("type").notNull(),
    title: text("title").notNull(),
    message: text("message").notNull(),
    resourceType: text("resource_type"),
    resourceId: text("resource_id"),
    /** Clé d'idempotence : empêche les doublons des rappels planifiés. */
    dedupeKey: text("dedupe_key"),
    readAt: instant("read_at"),
    createdAt: createdAt(),
  },
  (t) => [index("notifications_user_idx").on(t.userId, t.createdAt), uniqueIndex("notifications_dedupe_unique").on(t.userId, t.dedupeKey).where(sql`${t.dedupeKey} is not null`)],
);
