import type {
  Frequency,
  InvitationStatus,
  MemberRole,
  MemberStatus,
  NotificationType,
  ObligationStatus,
  PaymentMethod, PaymentProofMode,
  PaymentStatus,
  RotationStatus,
  TontineStatus,
  Weekday,
} from "@/types/domain";

export type Tone = "neutral" | "brand" | "success" | "warning" | "danger";

export const APP_NAME = "KOTI";

export const TONTINE_STATUS: Record<TontineStatus, { label: string; tone: Tone }> = {
  DRAFT: { label: "Brouillon", tone: "neutral" },
  ACTIVE: { label: "Active", tone: "success" },
  PAUSED: { label: "Suspendue", tone: "warning" },
  COMPLETED: { label: "Clôturée", tone: "neutral" },
  CANCELLED: { label: "Annulée", tone: "danger" },
};

export const FREQUENCY_LABEL: Record<Frequency, string> = {
  WEEKLY: "Hebdomadaire",
  TWICE_WEEKLY: "Deux fois par semaine",
  MONTHLY: "Mensuelle",
  YEARLY: "Annuelle",
};

/** Suffixe affiché après le montant : « 10 000 FCFA / semaine ». */
export const FREQUENCY_UNIT: Record<Frequency, string> = {
  WEEKLY: "semaine",
  TWICE_WEEKLY: "échéance (2×/sem.)",
  MONTHLY: "mois",
  YEARLY: "an",
};

export const WEEKDAY_LABEL: Record<Weekday, string> = {
  0: "Dimanche",
  1: "Lundi",
  2: "Mardi",
  3: "Mercredi",
  4: "Jeudi",
  5: "Vendredi",
  6: "Samedi",
};

export const ROLE_LABEL: Record<MemberRole, string> = { ADMIN: "Administrateur", MEMBER: "Membre" };

export const MEMBER_STATUS: Record<MemberStatus, { label: string; tone: Tone }> = {
  ACTIVE: { label: "Actif", tone: "success" },
  LEFT: { label: "Parti", tone: "neutral" },
  REMOVED: { label: "Retiré", tone: "danger" },
};

export const INVITATION_STATUS: Record<InvitationStatus, { label: string; tone: Tone }> = {
  PENDING: { label: "En attente", tone: "warning" },
  ACCEPTED: { label: "Acceptée", tone: "success" },
  REFUSED: { label: "Refusée", tone: "danger" },
  EXPIRED: { label: "Expirée", tone: "neutral" },
  CANCELLED: { label: "Annulée", tone: "neutral" },
};

export const OBLIGATION_STATUS: Record<ObligationStatus, { label: string; tone: Tone }> = {
  PENDING: { label: "À payer", tone: "neutral" },
  DECLARED: { label: "En validation", tone: "warning" },
  PAID: { label: "Payé", tone: "success" },
  REJECTED: { label: "Refusé", tone: "danger" },
  LATE: { label: "En retard", tone: "danger" },
};

export const PAYMENT_STATUS: Record<PaymentStatus, { label: string; tone: Tone }> = {
  DECLARED: { label: "Déclaré", tone: "warning" },
  PAID: { label: "Validé", tone: "success" },
  REJECTED: { label: "Refusé", tone: "danger" },
};

export const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = {
  CASH: "Espèces",
  MOBILE_MONEY: "Mobile Money",
  BANK_TRANSFER: "Virement",
  OTHER: "Autre",
};

export const ROTATION_STATUS: Record<RotationStatus, { label: string; tone: Tone }> = {
  UPCOMING: { label: "À venir", tone: "neutral" },
  CURRENT: { label: "En cours", tone: "brand" },
  COMPLETED: { label: "Passé", tone: "success" },
  CANCELLED: { label: "Annulé", tone: "danger" },
};

export const NOTIFICATION_TYPE_LABEL: Record<NotificationType, string> = {
  INVITATION_RECEIVED: "Invitation",
  INVITATION_ACCEPTED: "Invitation acceptée",
  INVITATION_REFUSED: "Invitation refusée",
  DUE_SOON: "Échéance à venir",
  DUE_OVERDUE: "Retard",
  PAYMENT_DECLARED: "Paiement déclaré",
  PAYMENT_VALIDATED: "Paiement validé",
  PAYMENT_REJECTED: "Paiement refusé",
  ROTATION_SOON: "Tour de main",
};

/** Option « justificatif de paiement » d'une tontine. */
export const PAYMENT_PROOF_MODE_LABEL: Record<PaymentProofMode, { label: string; help: string }> = {
  OFF: { label: "Aucun justificatif", help: "Les membres déclarent leur paiement sans pièce jointe." },
  OPTIONAL: { label: "Justificatif facultatif", help: "Les membres peuvent joindre une capture d'écran ou une photo du reçu ; ce n'est jamais exigé." },
  REQUIRED: { label: "Justificatif obligatoire", help: "Un paiement ne peut être déclaré qu'avec une capture d'écran ou une photo du reçu. Les déclarations déjà faites ne changent pas." },
};
