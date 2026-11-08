import "server-only";
import type {
  Account,
  AuthSession,
  AdminNote,
  Announcement,
  StaffInvitation,
  AuditLog,
  ContactRequest,
  ContributionObligation,
  ContributionPeriod,
  Invoice,
  Invitation,
  Notification,
  Payment,
  PlanSetting,
  RotationCycle,
  RotationSlot,
  Subscription,
  Tontine,
  TontineMember,
  TontineTicket,
  User,
  UserProfile,
} from "@/types/domain";

/**
 * Forme de l'état applicatif manipulé par la logique métier.
 *
 * L'état n'est plus conservé ici : il est chargé depuis PostgreSQL pour le périmètre d'une opération, passé à la
 * logique métier (`runOnState`), puis la différence est réécrite (voir `server/db/uow`). `read()` et `tx()` sont les
 * seuls points d'accès des services ; hors d'une unité de travail, ils lèvent une erreur.
 */

export interface DbState {
  version: number;
  users: User[];
  accounts: Account[];
  sessions: AuthSession[];
  userProfiles: UserProfile[];
  tontines: Tontine[];
  tontineMembers: TontineMember[];
  tontineTickets: TontineTicket[];
  rotationCycles: RotationCycle[];
  invitations: Invitation[];
  contributionPeriods: ContributionPeriod[];
  contributionObligations: ContributionObligation[];
  payments: Payment[];
  rotationSlots: RotationSlot[];
  notifications: Notification[];
  auditLogs: AuditLog[];
  /** Messages reçus par le formulaire de contact du site vitrine. */
  contactRequests: ContactRequest[];
  /** Abonnements (un par client) et factures simulées. */
  subscriptions: Subscription[];
  invoices: Invoice[];
  /** Notes internes de l'équipe KOTI sur les clients (espace d'administration). */
  adminNotes: AdminNote[];
  /** Réglages d'offres modifiés depuis l'administration (vide = valeurs d'origine). */
  planSettings: PlanSetting[];
  announcements: Announcement[];
  staffInvitations: StaffInvitation[];
  /** Verrous des tâches planifiées (protection contre les exécutions multiples). */
  jobRuns: Array<{ key: string; ranAt: string }>;
}

export const SCHEMA_VERSION = 9;

export function emptyState(): DbState {
  return {
    version: SCHEMA_VERSION,
    users: [],
    accounts: [],
    sessions: [],
    userProfiles: [],
    tontines: [],
    tontineMembers: [],
    tontineTickets: [],
    rotationCycles: [],
    invitations: [],
    contributionPeriods: [],
    contributionObligations: [],
    payments: [],
    rotationSlots: [],
    notifications: [],
    auditLogs: [],
    contactRequests: [],
    subscriptions: [],
    invoices: [],
    adminNotes: [],
    planSettings: [],
    announcements: [],
    staffInvitations: [],
    jobRuns: [],
  };
}


let current: DbState | null = null;

const outside = (): never => {
  throw new Error("Accès aux données hors unité de travail : passez par `@/server/pg/services`.");
};

export function read<T>(fn: (state: Readonly<DbState>) => T): T {
  return fn(current ?? outside());
}

/** Les écritures portent sur l'état fourni ; la transaction PostgreSQL (verrous, écriture de la différence) est gérée autour. */
export function tx<T>(fn: (state: DbState) => T): T {
  return fn(current ?? outside());
}

/**
 * Exécute du code métier synchrone sur un état fourni (chargé depuis PostgreSQL) : pendant l'appel, `read()` et `tx()`
 * travaillent sur cet état. Sûr parce que le code appelé est synchrone : rien ne peut s'intercaler.
 */
export function runOnState<T>(state: DbState, fn: () => T): T {
  if (current) throw new Error("runOnState ne peut pas être imbriqué.");
  current = state;
  try {
    return fn();
  } finally {
    current = null;
  }
}
