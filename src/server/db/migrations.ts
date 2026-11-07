import type { DbState } from "./store";
import type { ContributionObligation, RotationCycle, RotationSlot, Tontine, TontineMember, TontineTicket } from "@/types/domain";

/**
 * Migration v2 → v3 : introduction des tickets de participation.
 *
 * Principes (aucune donnée n'est supprimée ni modifiée, hors ajout de champs) :
 * - chaque adhésion existante reçoit UN ticket initial (TKT-001, 002… dans l'ordre des adhésions) ;
 * - obligations et tours existants sont rattachés au ticket de leur adhésion ; montants, dates,
 *   statuts, références et historiques de validation restent strictement identiques ;
 * - les paiements ne sont pas touchés (ils pointent déjà vers leur obligation) ;
 * - une tontine déjà démarrée reçoit un cycle initial de la longueur qu'elle avait (nombre de membres prévu) ;
 * - toute situation ambiguë interrompt la migration avec un message précis, sans deviner.
 *
 * Fonction pure : ne touche ni au fichier ni à l'état d'origine (copie profonde).
 */
export function migrateV2ToV3(legacy: unknown): DbState {
  const old = structuredClone(legacy) as Record<string, unknown> & { version: number };
  const fail = (msg: string): never => {
    throw new Error(`Migration v2→v3 interrompue : ${msg}`);
  };

  const tontines = (old.tontines ?? []) as Array<Tontine & Partial<Pick<Tontine, "multipleTicketsAllowed" | "maxTicketsPerMember" | "nextTicketNumber">>>;
  const members = (old.tontineMembers ?? []) as TontineMember[];
  const obligations = (old.contributionObligations ?? []) as ContributionObligation[];
  const slots = (old.rotationSlots ?? []) as RotationSlot[];

  const tickets: TontineTicket[] = [];
  const cycles: RotationCycle[] = [];
  const ticketByMember = new Map<string, TontineTicket>();
  const cycleByTontine = new Map<string, RotationCycle>();

  for (const tontine of tontines) {
    let n = 0;
    for (const m of members.filter((x) => x.tontineId === tontine.id)) {
      n++;
      const ticket: TontineTicket = {
        id: crypto.randomUUID(),
        tontineId: tontine.id,
        memberId: m.id,
        ticketNumber: n,
        status: m.status === "ACTIVE" ? "ACTIVE" : "INACTIVE",
        createdBy: tontine.creatorId,
        createdAt: m.createdAt,
        deletedAt: null,
      };
      tickets.push(ticket);
      ticketByMember.set(m.id, ticket);
    }
    tontine.multipleTicketsAllowed = false;
    tontine.maxTicketsPerMember = 1;
    tontine.nextTicketNumber = n + 1;

    if (tontine.status === "ACTIVE" || tontine.status === "PAUSED" || tontine.status === "COMPLETED") {
      const cycle: RotationCycle = {
        id: crypto.randomUUID(),
        tontineId: tontine.id,
        status: tontine.status === "COMPLETED" ? "COMPLETED" : "ACTIVE",
        size: tontine.expectedMemberCount,
        createdAt: tontine.updatedAt,
      };
      cycles.push(cycle);
      cycleByTontine.set(tontine.id, cycle);
    }
  }

  for (const o of obligations) {
    const t = ticketByMember.get(o.memberId);
    if (!t || t.tontineId !== o.tontineId) fail(`l'obligation ${o.id} référence une adhésion introuvable (${o.memberId}).`);
    o.ticketId = t!.id;
  }

  const activeSlotsOfMember = new Map<string, number>();
  for (const sl of slots) {
    const t = ticketByMember.get(sl.memberId);
    if (!t || t.tontineId !== sl.tontineId) fail(`le tour ${sl.id} référence une adhésion introuvable (${sl.memberId}).`);
    sl.ticketId = t!.id;
    sl.cycleId = cycleByTontine.get(sl.tontineId)?.id ?? null;
    if (sl.status !== "CANCELLED") {
      const c = (activeSlotsOfMember.get(sl.memberId) ?? 0) + 1;
      activeSlotsOfMember.set(sl.memberId, c);
      if (c > 1) fail(`l'adhésion ${sl.memberId} a plusieurs tours non annulés : impossible de savoir quel ticket doit en hériter.`);
    }
  }

  return { ...(old as unknown as DbState), version: 3, tontineTickets: tickets, rotationCycles: cycles, tontines: tontines as Tontine[] };
}

/** Migration v3 → v4 : ajout des messages de contact du site vitrine (aucune donnée existante n'est touchée). */
export function migrateV3ToV4(legacy: unknown): DbState {
  const old = structuredClone(legacy) as Record<string, unknown> & { version: number };
  return { ...(old as unknown as DbState), version: 4, contactRequests: (old.contactRequests as DbState["contactRequests"] | undefined) ?? [] };
}
