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
