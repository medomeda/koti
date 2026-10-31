/**
 * Contrats du modèle de données (PRD §10).
 * Les noms reprennent ceux des futures tables Drizzle, en camelCase.
 * Montants : entiers en XOF. Dates calendaires : chaîne « YYYY-MM-DD ». Instants : ISO 8601 UTC.
 */

export type ISODate = string;
export type ISODateTime = string;

export const TONTINE_STATUSES = ["DRAFT", "ACTIVE", "PAUSED", "COMPLETED", "CANCELLED"] as const;
export type TontineStatus = (typeof TONTINE_STATUSES)[number];

export const FREQUENCIES = ["WEEKLY", "TWICE_WEEKLY", "MONTHLY", "YEARLY"] as const;
export type Frequency = (typeof FREQUENCIES)[number];

/** 0 = dimanche … 6 = samedi (convention JS). */
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export type FrequencyConfig = { weekdays?: [Weekday, Weekday] };

export const ROTATION_MODES = ["MANUAL"] as const;
export type RotationMode = (typeof ROTATION_MODES)[number];

export type MemberRole = "ADMIN" | "MEMBER";
export type MemberStatus = "ACTIVE" | "LEFT" | "REMOVED";

export type InvitationStatus = "PENDING" | "ACCEPTED" | "REFUSED" | "EXPIRED" | "CANCELLED";

export type PeriodStatus = "OPEN" | "CLOSED";

/** Statut stocké d'une obligation. LATE est calculé (voir `effectiveObligationStatus`). */
export type StoredObligationStatus = "PENDING" | "DECLARED" | "PAID" | "REJECTED";
export type ObligationStatus = StoredObligationStatus | "LATE";

export const PAYMENT_METHODS = ["CASH", "MOBILE_MONEY", "BANK_TRANSFER", "OTHER"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];
export type PaymentStatus = "DECLARED" | "PAID" | "REJECTED";

export type RotationStatus = "UPCOMING" | "CURRENT" | "COMPLETED" | "CANCELLED";

export type NotificationType =
  | "INVITATION_RECEIVED"
  | "INVITATION_ACCEPTED"
  | "INVITATION_REFUSED"
  | "DUE_SOON"
  | "DUE_OVERDUE"
  | "PAYMENT_DECLARED"
  | "PAYMENT_VALIDATED"
  | "PAYMENT_REJECTED"
  | "ROTATION_SOON";

export interface User {
  id: string;
  email: string;
  emailVerified: boolean;
  createdAt: ISODateTime;
}

export interface UserProfile {
  userId: string;
  fullName: string;
  phone: string;
  avatarUrl: string | null;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

export interface Tontine {
  id: string;
  name: string;
  description: string;
  contributionAmount: number;
  currency: "XOF";
  frequency: Frequency;
  frequencyConfig: FrequencyConfig;
  startDate: ISODate;
  expectedMemberCount: number;
  rotationMode: RotationMode;
  status: TontineStatus;
  creatorId: string;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

export interface TontineMember {
  id: string;
  tontineId: string;
  userId: string;
  role: MemberRole;
  status: MemberStatus;
  joinedAt: ISODateTime;
  createdAt: ISODateTime;
}

export interface Invitation {
  id: string;
  tontineId: string;
  invitedEmail: string | null;
  invitedPhone: string | null;
  invitedUserId: string | null;
  tokenHash: string;
  status: InvitationStatus;
  invitedBy: string;
  expiresAt: ISODateTime;
  respondedAt: ISODateTime | null;
  createdAt: ISODateTime;
}

export interface ContributionPeriod {
  id: string;
  tontineId: string;
  periodNumber: number;
  dueDate: ISODate;
  status: PeriodStatus;
  createdAt: ISODateTime;
}

export interface ContributionObligation {
  id: string;
  tontineId: string;
  periodId: string;
  memberId: string;
  expectedAmount: number;
  dueDate: ISODate;
  status: StoredObligationStatus;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

export interface Payment {
  id: string;
  obligationId: string;
  amount: number;
  paymentDate: ISODate;
  paymentMethod: PaymentMethod;
  reference: string;
  comment: string;
  status: PaymentStatus;
  declaredBy: string;
  validatedBy: string | null;
  validatedAt: ISODateTime | null;
  rejectionReason: string;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

export interface RotationSlot {
  id: string;
  tontineId: string;
  memberId: string;
  position: number;
  scheduledDate: ISODate | null;
  status: RotationStatus;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

export interface Notification {
  id: string;
  userId: string;
  tontineId: string | null;
  type: NotificationType;
  title: string;
  message: string;
  resourceType: string | null;
  resourceId: string | null;
  /** Clé d'idempotence : empêche les doublons des rappels planifiés. */
  dedupeKey: string | null;
  readAt: ISODateTime | null;
  createdAt: ISODateTime;
}

export interface AuditLog {
  id: string;
  actorId: string;
  tontineId: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  oldValues: Record<string, unknown> | null;
  newValues: Record<string, unknown> | null;
  reason: string | null;
  createdAt: ISODateTime;
}
