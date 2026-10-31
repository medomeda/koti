import type { TontineStatus } from "@/types/domain";

export type TontineTransition = "activate" | "pause" | "resume" | "close";

/** Transitions proposées à l'administrateur selon le statut (le serveur revérifie). */
export function transitionsFor(status: TontineStatus): TontineTransition[] {
  switch (status) {
    case "DRAFT":
      return ["activate", "close"];
    case "ACTIVE":
      return ["pause", "close"];
    case "PAUSED":
      return ["resume", "close"];
    default:
      return [];
  }
}
