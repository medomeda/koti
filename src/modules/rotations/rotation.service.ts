import "server-only";
import { audit } from "@/modules/audit/audit.service";
import { dueDateForPeriod } from "@/modules/contributions/frequency";
import { displayName, isoNow, requireAccess, today, type Ctx } from "@/server/context";
import { read, tx, type DbState } from "@/server/db/store";
import { AppError, invalidState } from "@/server/errors";
import { newId } from "@/server/ids";
import type { ISODate, RotationSlot, RotationStatus, Tontine } from "@/types/domain";

/** Statut affiché : CANCELLED est stocké, les autres se déduisent du calendrier. */
export function effectiveRotationStatus(slot: RotationSlot, tontine: Tontine, currentSlotId: string | null, todayDate: ISODate): RotationStatus {
  if (slot.status === "CANCELLED") return "CANCELLED";
  if (tontine.status === "DRAFT" || !slot.scheduledDate) return "UPCOMING";
  if (slot.id === currentSlotId) return "CURRENT";
  return slot.scheduledDate < todayDate ? "COMPLETED" : "UPCOMING";
}

/** Bénéficiaire en cours : premier tour actif dont la date est aujourd'hui ou à venir. */
function currentSlotId(slots: RotationSlot[], tontine: Tontine, todayDate: ISODate): string | null {
  if (tontine.status !== "ACTIVE" && tontine.status !== "PAUSED") return null;
  return slots.filter((x) => x.status !== "CANCELLED" && x.scheduledDate && x.scheduledDate >= todayDate).sort((a, b) => a.position - b.position)[0]?.id ?? null;
}

function sortedSlots(s: Readonly<DbState>, tontineId: string) {
  return s.rotationSlots.filter((x) => x.tontineId === tontineId).sort((a, b) => a.position - b.position);
}

/** Recalcule les dates prévues à partir de la position (position n ↔ échéance n). */
export function recomputeRotationDates(s: DbState, ctx: Ctx, tontine: Tontine) {
  for (const slot of sortedSlots(s, tontine.id)) {
    const date = dueDateForPeriod(tontine.frequency, tontine.startDate, slot.position, tontine.frequencyConfig);
    if (slot.scheduledDate !== date) {
      slot.scheduledDate = date;
      slot.updatedAt = isoNow(ctx);
    }
  }
}

/** Ajoute un membre en fin d'ordre de passage (création, acceptation d'invitation). */
export function appendRotationSlot(s: DbState, ctx: Ctx, tontine: Tontine, memberId: string) {
  if (s.rotationSlots.some((x) => x.tontineId === tontine.id && x.memberId === memberId && x.status !== "CANCELLED")) return;
  const position = Math.max(0, ...s.rotationSlots.filter((x) => x.tontineId === tontine.id).map((x) => x.position)) + 1;
  s.rotationSlots.push({
    id: newId(),
    tontineId: tontine.id,
    memberId,
    position,
    scheduledDate: dueDateForPeriod(tontine.frequency, tontine.startDate, position, tontine.frequencyConfig),
    status: "UPCOMING",
    createdAt: isoNow(ctx),
    updatedAt: isoNow(ctx),
  });
}

export interface RotationView {
  slotId: string;
  memberId: string;
  userId: string;
  name: string;
  avatarUrl: string | null;
  position: number;
  scheduledDate: ISODate | null;
  status: RotationStatus;
  isMe: boolean;
  /** Montant indicatif de la cagnotte : cotisation × membres actifs. */
  potAmount: number;
}

export function listRotation(ctx: Ctx, tontineId: string) {
  return read((s) => {
    const { tontine, member } = requireAccess(s, ctx, tontineId, "rotation.view");
    const t = today(ctx);
    const slots = sortedSlots(s, tontineId);
    const current = currentSlotId(slots, tontine, t);
    const activeCount = s.tontineMembers.filter((m) => m.tontineId === tontineId && m.status === "ACTIVE").length;
    const rows: RotationView[] = slots.map((slot) => {
      const m = s.tontineMembers.find((x) => x.id === slot.memberId)!;
      const profile = s.userProfiles.find((p) => p.userId === m.userId);
      return {
        slotId: slot.id,
        memberId: slot.memberId,
        userId: m.userId,
        name: profile?.fullName ?? "Membre",
        avatarUrl: profile?.avatarUrl ?? null,
        position: slot.position,
        scheduledDate: slot.scheduledDate,
        status: effectiveRotationStatus(slot, tontine, current, t),
        isMe: slot.memberId === member.id,
        potAmount: tontine.contributionAmount * activeCount,
      };
    });
    return { tontine, role: member.role, rows, mySlot: rows.find((r) => r.isMe && r.status !== "CANCELLED") ?? null };
  });
}

/**
 * Réorganise l'ordre de passage.
 * - Brouillon : réorganisation libre.
 * - Active / suspendue : seuls les tours à venir peuvent être permutés entre eux, avec motif
 *   obligatoire ; les tours passés ou en cours sont figés. Chaque changement est historisé.
 * - Clôturée / annulée : lecture seule.
 */
export function reorderRotation(ctx: Ctx, input: { tontineId: string; memberIds: string[]; reason?: string }) {
  tx((s) => {
    const { tontine } = requireAccess(s, ctx, input.tontineId, "rotation.update");
    if (tontine.status === "COMPLETED" || tontine.status === "CANCELLED") throw invalidState("Cette tontine est clôturée : le calendrier n'est plus modifiable.");

    const t = today(ctx);
    const slots = sortedSlots(s, tontine.id).filter((x) => x.status !== "CANCELLED");
    const current = currentSlotId(slots, tontine, t);
    const started = tontine.status !== "DRAFT";
    const movable = started ? slots.filter((x) => effectiveRotationStatus(x, tontine, current, t) === "UPCOMING") : slots;

    const expected = new Set(movable.map((x) => x.memberId));
    if (input.memberIds.length !== expected.size || new Set(input.memberIds).size !== input.memberIds.length || !input.memberIds.every((id) => expected.has(id))) {
      throw new AppError("CONFLICT", "Le calendrier a été modifié entre-temps. Rechargez la page et recommencez.");
    }
    if (started && (!input.reason || input.reason.trim().length < 3)) {
      throw new AppError("VALIDATION", "Un motif est obligatoire pour modifier un calendrier démarré.", { reason: "Motif requis (3 caractères minimum)." });
    }

    const before = slots.map((x) => ({ memberId: x.memberId, position: x.position, name: displayName(s, s.tontineMembers.find((m) => m.id === x.memberId)!.userId) }));
    // Les positions disponibles sont celles des tours déplaçables, dans l'ordre.
    const positions = movable.map((x) => x.position).sort((a, b) => a - b);
    const bySlotMember = new Map(movable.map((x) => [x.memberId, x]));
    // Libère temporairement les positions pour respecter l'unicité (tontine, position).
    movable.forEach((x, i) => (x.position = -1 - i));
    input.memberIds.forEach((memberId, i) => {
      const slot = bySlotMember.get(memberId)!;
      slot.position = positions[i]!;
      slot.updatedAt = isoNow(ctx);
    });
    // Les tours annulés sont repoussés après les tours actifs.
    const maxActive = Math.max(0, ...slots.map((x) => x.position));
    s.rotationSlots
      .filter((x) => x.tontineId === tontine.id && x.status === "CANCELLED")
      .forEach((x, i) => (x.position = maxActive + 1 + i));

    const all = s.rotationSlots.filter((x) => x.tontineId === tontine.id).map((x) => x.position);
    if (new Set(all).size !== all.length) throw new AppError("CONFLICT", "Positions en double détectées.");
    recomputeRotationDates(s, ctx, tontine);

    const after = sortedSlots(s, tontine.id)
      .filter((x) => x.status !== "CANCELLED")
      .map((x) => ({ memberId: x.memberId, position: x.position, name: displayName(s, s.tontineMembers.find((m) => m.id === x.memberId)!.userId) }));
    audit(s, ctx, { tontineId: tontine.id, action: "rotation.reorder", entityType: "rotation", entityId: null, oldValues: { order: before }, newValues: { order: after }, reason: input.reason?.trim() || null });
  });
}
