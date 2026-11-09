import { pgEnum } from "drizzle-orm/pg-core";
import { CONTACT_TOPICS, FREQUENCIES, PAYMENT_METHODS, PAYMENT_PROOF_MODES, ROTATION_MODES, TONTINE_STATUSES } from "@/types/domain";

/**
 * Énumérations PostgreSQL. Les valeurs reprennent exactement celles de `src/types/domain.ts` :
 * le typage TypeScript et la base ne peuvent pas diverger sans erreur de compilation.
 */
export const platformRole = pgEnum("platform_role", ["USER", "SUPPORT", "SUPER_ADMIN"]);
export const accountStatus = pgEnum("account_status", ["ACTIVE", "SUSPENDED"]);
export const planId = pgEnum("plan_id", ["FREE", "PRO", "ASSOCIATION"]);
export const subscriptionStatus = pgEnum("subscription_status", ["TRIAL", "ACTIVE"]);

export const tontineStatus = pgEnum("tontine_status", TONTINE_STATUSES);
export const frequency = pgEnum("frequency", FREQUENCIES);
export const rotationMode = pgEnum("rotation_mode", ROTATION_MODES);
export const memberRole = pgEnum("member_role", ["ADMIN", "MEMBER"]);
export const memberStatus = pgEnum("member_status", ["ACTIVE", "LEFT", "REMOVED"]);
export const ticketStatus = pgEnum("ticket_status", ["ACTIVE", "INACTIVE"]);
export const rotationCycleStatus = pgEnum("rotation_cycle_status", ["ACTIVE", "COMPLETED"]);
export const invitationStatus = pgEnum("invitation_status", ["PENDING", "ACCEPTED", "REFUSED", "EXPIRED", "CANCELLED"]);
export const periodStatus = pgEnum("period_status", ["OPEN", "CLOSED"]);
/** LATE n'est jamais stocké : il se calcule (échéance passée, non payée, sans déclaration en cours). */
export const obligationStatus = pgEnum("obligation_status", ["PENDING", "DECLARED", "PAID", "REJECTED"]);
export const paymentProofMode = pgEnum("payment_proof_mode", PAYMENT_PROOF_MODES);
export const paymentMethod = pgEnum("payment_method", PAYMENT_METHODS);
export const paymentStatus = pgEnum("payment_status", ["DECLARED", "PAID", "REJECTED"]);
export const rotationStatus = pgEnum("rotation_status", ["UPCOMING", "CURRENT", "COMPLETED", "CANCELLED"]);
export const notificationType = pgEnum("notification_type", [
  "INVITATION_RECEIVED",
  "INVITATION_ACCEPTED",
  "INVITATION_REFUSED",
  "DUE_SOON",
  "DUE_OVERDUE",
  "PAYMENT_DECLARED",
  "PAYMENT_VALIDATED",
  "PAYMENT_REJECTED",
  "ROTATION_SOON",
]);
export const contactTopic = pgEnum("contact_topic", CONTACT_TOPICS);
export const contactStatus = pgEnum("contact_status", ["NEW", "HANDLED"]);
export const staffInvitationStatus = pgEnum("staff_invitation_status", ["PENDING", "ACCEPTED", "REVOKED"]);
export const announcementTone = pgEnum("announcement_tone", ["info", "warning", "success"]);
