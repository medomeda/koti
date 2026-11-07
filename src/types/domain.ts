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

/** ACTIVE = participation en cours ; INACTIVE = ticket conservé pour l'historique (membre retiré, ticket supprimé avant démarrage). */
export type TicketStatus = "ACTIVE" | "INACTIVE";
export type RotationCycleStatus = "ACTIVE" | "COMPLETED";

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

/** Rôle sur la PLATEFORME (distinct des rôles de tontine ADMIN / MEMBER). */
export type PlatformRole = "USER" | "SUPPORT" | "SUPER_ADMIN";
export type AccountStatus = "ACTIVE" | "SUSPENDED";

export interface User {
  id: string;
  email: string;
  emailVerified: boolean;
  /** Rôle plateforme : USER pour tous les clients et membres, SUPPORT / SUPER_ADMIN pour l'équipe KOTI. */
  platformRole: PlatformRole;
  /** Un compte suspendu ne peut plus se connecter (ses sessions sont refusées). */
  status: AccountStatus;
  createdAt: ISODateTime;
}

export type PlanId = "FREE" | "PRO" | "ASSOCIATION";
export type SubscriptionStatus = "TRIAL" | "ACTIVE";

/** Abonnement d'un client (simulé : aucun paiement réel). Un seul par utilisateur. */
export interface Subscription {
  id: string;
  userId: string;
  planId: PlanId;
  status: SubscriptionStatus;
  startedAt: ISODateTime;
  /** Fin de l'essai gratuit (14 jours) ; null hors essai. */
  trialEndsAt: ISODateTime | null;
  /** Un seul essai par client. */
  trialUsed: boolean;
  /** Période en cours (offres payantes) ; la facture suivante est émise à currentPeriodEnd. */
  currentPeriodStart: ISODate | null;
  currentPeriodEnd: ISODate | null;
  canceledAt: ISODateTime | null;
}

/** Facture simulée. Montant figé à l'émission : un changement de prix ne modifie jamais l'historique. */
export interface Invoice {
  id: string;
  userId: string;
  subscriptionId: string;
  /** « KOTI-2026-0001 » */
  number: string;
  planId: PlanId;
  planName: string;
  amount: number;
  periodStart: ISODate;
  periodEnd: ISODate;
  issuedAt: ISODateTime;
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
  /** Tickets multiples : désactivés par défaut (un ticket par membre). */
  multipleTicketsAllowed: boolean;
  /** Plafond de tickets par membre (1 si les tickets multiples sont désactivés). */
  maxTicketsPerMember: number;
  /** Prochain numéro de ticket : jamais réutilisé, même après suppression avant démarrage. */
  nextTicketNumber: number;
  status: TontineStatus;
  /** Fenêtres de suspension : les échéances qui y tombent ne sont jamais réclamées. */
  pauses: Array<{ from: ISODate; to: ISODate | null }>;
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

/** Participation individuelle d'un membre : porte ses obligations, ses paiements et son tour de main. */
export interface TontineTicket {
  id: string;
  tontineId: string;
  /** Adhésion propriétaire (une personne = une seule adhésion par tontine, plusieurs tickets possibles). */
  memberId: string;
  /** Numéro séquentiel unique dans la tontine, affiché « TKT-001 ». */
  ticketNumber: number;
  status: TicketStatus;
  createdBy: string;
  createdAt: ISODateTime;
  /** Suppression logique (avant démarrage uniquement) : la trace d'audit est conservée. */
  deletedAt: ISODateTime | null;
}

/** Cycle de rotation : créé au démarrage, il compte autant de tours que de tickets actifs. */
export interface RotationCycle {
  id: string;
  tontineId: string;
  status: RotationCycleStatus;
  /** Nombre de tours du cycle (= tickets actifs au démarrage). */
  size: number;
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
  /** Adhésion propriétaire du ticket (dénormalisée : filtres et affichage). */
  memberId: string;
  /** Une obligation par ticket et par période. */
  ticketId: string;
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
  /** Cycle de rattachement ; null tant que la tontine n'a pas démarré. */
  cycleId: string | null;
  memberId: string;
  /** La rotation est organisée par ticket. */
  ticketId: string;
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

/**
 * Réglage d'une offre modifié par l'équipe KOTI. Les valeurs d'origine vivent dans lib/marketing/plans.ts ;
 * un réglage les remplace (nom, accroche, prix, limites). Les factures déjà émises ne changent jamais.
 */
export interface PlanSetting {
  planId: PlanId;
  name: string;
  tagline: string;
  monthlyPrice: number;
  limits: { tontines: number; membersPerTontine: number; ticketsPerTontine: number; multipleTickets: boolean };
  updatedAt: ISODateTime;
  updatedBy: string;
}

/** Note interne de l'équipe KOTI sur un client : jamais visible par le client. */
export interface AdminNote {
  id: string;
  userId: string;
  authorId: string;
  text: string;
  createdAt: ISODateTime;
}

export const CONTACT_TOPICS = ["QUESTION", "DEMO", "PARTNERSHIP", "SUPPORT", "OTHER"] as const;
export type ContactTopic = (typeof CONTACT_TOPICS)[number];
export type ContactRequestStatus = "NEW" | "HANDLED";

/** Message envoyé depuis le formulaire de contact du site vitrine (visiteur non connecté). */
export interface ContactRequest {
  id: string;
  name: string;
  email: string;
  phone: string;
  topic: ContactTopic;
  message: string;
  status: ContactRequestStatus;
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
