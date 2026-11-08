import type { ContactTopic } from "@/types/domain";
import type { Tone } from "./labels";

export const TOPIC_LABEL: Record<ContactTopic, string> = {
  QUESTION: "Question",
  DEMO: "Démonstration",
  PARTNERSHIP: "Partenariat",
  SUPPORT: "Problème de compte",
  OTHER: "Autre",
};

export const HEALTH: Record<"OK" | "ATTENTION" | "CRITIQUE" | "NOUVELLE", { label: string; tone: Tone }> = {
  OK: { label: "Saine", tone: "success" },
  ATTENTION: { label: "À surveiller", tone: "warning" },
  CRITIQUE: { label: "Retards importants", tone: "danger" },
  NOUVELLE: { label: "Pas encore d'échéance", tone: "neutral" },
};

export const PLAN_TONE = { FREE: "neutral", PRO: "success", ASSOCIATION: "brand" } as const satisfies Record<string, Tone>;

export const ACTION_LABEL: Record<string, string> = {
  "admin.user.suspend": "Compte suspendu",
  "admin.user.reactivate": "Compte réactivé",
  "admin.subscription.change": "Offre d'un client modifiée",
  "admin.trial.grant": "Essai offert",
  "admin.note.add": "Note interne ajoutée",
  "admin.plan.update": "Réglage d'une offre",
  "admin.message.handle": "Message traité",
  "admin.message.reopen": "Message rouvert",
  "admin.announcement.create": "Annonce publiée",
  "admin.announcement.publish": "Annonce republiée",
  "admin.announcement.unpublish": "Annonce retirée",
};

const FIELD_LABEL: Record<string, string> = {
  status: "statut",
  planId: "offre",
  days: "jours",
  name: "nom",
  tagline: "accroche",
  monthlyPrice: "prix",
  tontines: "tontines",
  membersPerTontine: "membres",
  ticketsPerTontine: "tickets",
  multipleTickets: "tickets multiples",
  active: "visible",
  title: "titre",
  tone: "type",
  endsAt: "fin",
};
const SKIP = new Set(["userId", "title"]);

const VALUE_LABEL: Record<string, string> = {
  NEW: "à traiter",
  HANDLED: "traité",
  ACTIVE: "actif",
  SUSPENDED: "suspendu",
  FREE: "Découverte",
  PRO: "Organisateur",
  ASSOCIATION: "Association",
  info: "information",
  warning: "avertissement",
  success: "bonne nouvelle",
};
const show = (v: unknown) => (v === true ? "oui" : v === false ? "non" : v === null || v === undefined ? "—" : (VALUE_LABEL[String(v)] ?? String(v)));

/** Résume un « avant → après » en une phrase courte : seules les valeurs qui changent sont citées. */
export function describeChange(before: Record<string, unknown> | null, after: Record<string, unknown> | null): string | null {
  const keys = [...new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})])].filter((k) => !SKIP.has(k));
  const parts = keys
    .filter((k) => JSON.stringify(before?.[k]) !== JSON.stringify(after?.[k]))
    // Une valeur absente de l'« après » n'est pas une suppression (ex. essai offert) ; une valeur nulle à la création est sans intérêt.
    .filter((k) => !(after && !(k in after)) && !(!(before && k in before) && (after?.[k] === null || after?.[k] === undefined)))
    .map((k) => (before && k in before ? `${FIELD_LABEL[k] ?? k} : ${show(before[k])} → ${show(after?.[k])}` : `${FIELD_LABEL[k] ?? k} : ${show(after?.[k])}`));
  return parts.length ? parts.join(" · ") : null;
}
