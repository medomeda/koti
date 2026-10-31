import "server-only";
import { audit } from "@/modules/audit/audit.service";
import { effectiveObligationStatus, ensureObligations, isInPause, nextDueDate } from "@/modules/contributions/contribution.service";
import { appendRotationSlot, listRotation, recomputeRotationDates } from "@/modules/rotations/rotation.service";
import type { TontineFormValues } from "@/lib/validations";
import { sumAmounts } from "@/lib/utils/money";
import { isoNow, requireAccess, today, type Ctx } from "@/server/context";
import { read, tx, type DbState } from "@/server/db/store";
import { AppError, invalidState } from "@/server/errors";
import { newId } from "@/server/ids";
import type { FrequencyConfig, ISODate, MemberRole, Tontine, TontineStatus, Weekday } from "@/types/domain";

function frequencyConfigOf(v: TontineFormValues): FrequencyConfig {
  if (v.frequency !== "TWICE_WEEKLY") return {};
  const days = [v.weekday1, v.weekday2].sort((a, b) => a! - b!) as [Weekday, Weekday];
  return { weekdays: days };
}

/** Création (PRD §6.8) : tontine + adhésion ADMIN acceptée + 1er tour, dans une seule transaction. */
export function createTontine(ctx: Ctx, v: TontineFormValues): string {
  return tx((s) => {
    const id = newId();
    const now = isoNow(ctx);
    const tontine: Tontine = {
      id,
      name: v.name,
      description: v.description,
      contributionAmount: v.contributionAmount,
      currency: "XOF",
      frequency: v.frequency,
      frequencyConfig: frequencyConfigOf(v),
      startDate: v.startDate,
      expectedMemberCount: v.expectedMemberCount,
      rotationMode: v.rotationMode,
      status: "DRAFT",
      pauses: [],
      creatorId: ctx.userId,
      createdAt: now,
      updatedAt: now,
    };
    s.tontines.push(tontine);
    const memberId = newId();
    s.tontineMembers.push({ id: memberId, tontineId: id, userId: ctx.userId, role: "ADMIN", status: "ACTIVE", joinedAt: now, createdAt: now });
    appendRotationSlot(s, ctx, tontine, memberId);
    audit(s, ctx, { tontineId: id, action: "tontine.create", entityType: "tontine", entityId: id, newValues: { name: v.name, contributionAmount: v.contributionAmount, frequency: v.frequency, startDate: v.startDate } });
    return id;
  });
}

/** Modification : nom et description toujours ; paramètres financiers uniquement en brouillon. */
export function updateTontine(ctx: Ctx, input: { tontineId: string; name: string; description: string; financial?: TontineFormValues }) {
  tx((s) => {
    const { tontine } = requireAccess(s, ctx, input.tontineId, "tontine.update");
    if (tontine.status === "COMPLETED" || tontine.status === "CANCELLED") throw invalidState("Une tontine clôturée est en lecture seule.");
    const old = { name: tontine.name, description: tontine.description, contributionAmount: tontine.contributionAmount, frequency: tontine.frequency, startDate: tontine.startDate, expectedMemberCount: tontine.expectedMemberCount };
    tontine.name = input.name;
    tontine.description = input.description;
    if (input.financial) {
      if (tontine.status !== "DRAFT") throw invalidState("Les paramètres financiers sont verrouillés après le démarrage.");
      const f = input.financial;
      const active = s.tontineMembers.filter((m) => m.tontineId === tontine.id && m.status === "ACTIVE").length;
      if (f.expectedMemberCount < active) throw new AppError("VALIDATION", `Le nombre prévu ne peut pas être inférieur aux ${active} membres actuels.`, { expectedMemberCount: `Minimum : ${active}.` });
      tontine.contributionAmount = f.contributionAmount;
      tontine.frequency = f.frequency;
      tontine.frequencyConfig = frequencyConfigOf(f);
      tontine.startDate = f.startDate;
      tontine.expectedMemberCount = f.expectedMemberCount;
      recomputeRotationDates(s, ctx, tontine);
    }
    tontine.updatedAt = isoNow(ctx);
    audit(s, ctx, { tontineId: tontine.id, action: "tontine.update", entityType: "tontine", entityId: tontine.id, oldValues: old, newValues: { name: tontine.name, description: tontine.description, contributionAmount: tontine.contributionAmount, frequency: tontine.frequency, startDate: tontine.startDate, expectedMemberCount: tontine.expectedMemberCount } });
  });
}

const TRANSITIONS: Record<"activate" | "pause" | "resume" | "close", { from: TontineStatus[]; to: TontineStatus; label: string }> = {
  activate: { from: ["DRAFT"], to: "ACTIVE", label: "démarrer" },
  pause: { from: ["ACTIVE"], to: "PAUSED", label: "suspendre" },
  resume: { from: ["PAUSED"], to: "ACTIVE", label: "reprendre" },
  close: { from: ["ACTIVE", "PAUSED", "DRAFT"], to: "COMPLETED", label: "clôturer" },
};

export type TontineTransition = keyof typeof TRANSITIONS;

export function changeTontineStatus(ctx: Ctx, tontineId: string, transition: TontineTransition, reason?: string) {
  tx((s) => {
    const permission = transition === "close" ? "tontine.close" : transition === "activate" ? "tontine.update" : "tontine.suspend";
    const { tontine } = requireAccess(s, ctx, tontineId, permission);
    const rule = TRANSITIONS[transition];
    if (!rule.from.includes(tontine.status)) throw invalidState(`Impossible de ${rule.label} une tontine dans l'état actuel.`);
    if (transition === "close" && (!reason || reason.trim().length < 3)) throw new AppError("VALIDATION", "Un motif est requis pour clôturer.");
    if (transition === "close" && s.contributionObligations.some((o) => o.tontineId === tontineId && o.status === "DECLARED")) {
      throw invalidState("Des paiements déclarés attendent encore votre validation : traitez-les avant de clôturer.");
    }
    const old = tontine.status;
    tontine.status = rule.to;
    tontine.updatedAt = isoNow(ctx);
    if (transition === "close" && old === "DRAFT") tontine.status = "CANCELLED";
    if (transition === "pause") {
      tontine.pauses = [...tontine.pauses, { from: today(ctx), to: null }];
      // Les échéances futures générées par anticipation, encore vierges, tombent dans la pause : on les retire.
      const t = today(ctx);
      const ahead = new Set(s.contributionPeriods.filter((p) => p.tontineId === tontineId && p.dueDate >= t).map((p) => p.id));
      const untouched = (o: { id: string; periodId: string; status: string }) => ahead.has(o.periodId) && o.status === "PENDING" && !s.payments.some((p) => p.obligationId === o.id);
      const keep = new Set(s.contributionObligations.filter((o) => ahead.has(o.periodId) && !untouched(o)).map((o) => o.periodId));
      s.contributionObligations = s.contributionObligations.filter((o) => !untouched(o));
      for (const p of s.contributionPeriods) if (ahead.has(p.id) && !keep.has(p.id)) p.status = "CLOSED";
    }
    if (transition === "resume") {
      tontine.pauses = tontine.pauses.map((p) => (p.to === null ? { ...p, to: today(ctx) } : p));
      // Périodes à venir fermées lors de la suspension mais désormais hors pause : rouvertes.
      for (const p of s.contributionPeriods) if (p.tontineId === tontineId && p.status === "CLOSED" && p.dueDate >= today(ctx) && !isInPause(tontine, p.dueDate)) p.status = "OPEN";
    }
    if (tontine.status === "ACTIVE") ensureObligations(s, ctx, tontine);
    audit(s, ctx, { tontineId, action: `tontine.${transition}`, entityType: "tontine", entityId: tontineId, oldValues: { status: old }, newValues: { status: tontine.status }, reason: reason?.trim() || null });
  });
}

/** Rattrapage des échéances pour toutes les tontines actives de l'utilisateur (idempotent). */
export function syncUserTontines(ctx: Ctx) {
  const ids = read((s) => s.tontineMembers.filter((m) => m.userId === ctx.userId && m.status === "ACTIVE").map((m) => m.tontineId));
  const needs = read((s) => ids.some((id) => {
    const t = s.tontines.find((x) => x.id === id);
    return t?.status === "ACTIVE" && wouldGenerate(s, ctx, t);
  }));
  if (!needs) return;
  tx((s) => {
    for (const id of ids) {
      const t = s.tontines.find((x) => x.id === id);
      if (t) ensureObligations(s, ctx, t);
    }
  });
}

function wouldGenerate(s: Readonly<DbState>, ctx: Ctx, t: Tontine): boolean {
  const copy = { ...s, contributionPeriods: [...s.contributionPeriods], contributionObligations: [...s.contributionObligations] } as DbState;
  return ensureObligations(copy, ctx, t) > 0;
}

export interface TontineCard {
  id: string;
  name: string;
  status: TontineStatus;
  role: MemberRole;
  memberCount: number;
  expectedMemberCount: number;
  contributionAmount: number;
  frequency: Tontine["frequency"];
  nextDueDate: ISODate | null;
  myOutstanding: number;
  myLate: number;
  pendingValidations: number;
}

export function listMyTontines(ctx: Ctx): TontineCard[] {
  return read((s) => {
    const t = today(ctx);
    return s.tontineMembers
      .filter((m) => m.userId === ctx.userId && m.status === "ACTIVE")
      .map((m) => {
        const tontine = s.tontines.find((x) => x.id === m.tontineId)!;
        const mine = s.contributionObligations.filter((o) => o.memberId === m.id);
        const memberIds = new Set(s.tontineMembers.filter((x) => x.tontineId === tontine.id).map((x) => x.id));
        return {
          id: tontine.id,
          name: tontine.name,
          status: tontine.status,
          role: m.role,
          memberCount: s.tontineMembers.filter((x) => x.tontineId === tontine.id && x.status === "ACTIVE").length,
          expectedMemberCount: tontine.expectedMemberCount,
          contributionAmount: tontine.contributionAmount,
          frequency: tontine.frequency,
          nextDueDate: nextDueDate(tontine, t),
          myOutstanding: mine.filter((o) => o.status === "PENDING" || o.status === "REJECTED").length,
          myLate: mine.filter((o) => effectiveObligationStatus(o, t) === "LATE").length,
          pendingValidations: m.role === "ADMIN" ? s.contributionObligations.filter((o) => memberIds.has(o.memberId) && o.status === "DECLARED").length : 0,
        };
      })
      .sort((a, b) => statusRank(a.status) - statusRank(b.status) || a.name.localeCompare(b.name, "fr"));
  });
}

const statusRank = (st: TontineStatus) => ({ ACTIVE: 0, DRAFT: 1, PAUSED: 2, COMPLETED: 3, CANCELLED: 4 })[st];

/** Accès + données d'en-tête d'une tontine (utilisé par le layout de l'espace tontine). */
export function getTontineAccess(ctx: Ctx, tontineId: string) {
  return read((s) => {
    const { tontine, member } = requireAccess(s, ctx, tontineId);
    return { tontine, role: member.role, memberId: member.id };
  });
}

export function getTontineOverview(ctx: Ctx, tontineId: string) {
  return read((s) => {
    const { tontine, member } = requireAccess(s, ctx, tontineId);
    const t = today(ctx);
    const activeMembers = s.tontineMembers.filter((m) => m.tontineId === tontineId && m.status === "ACTIVE");
    const obligations = s.contributionObligations.filter((o) => o.tontineId === tontineId);
    const rotation = listRotation(ctx, tontineId);
    const nextBeneficiary = rotation.rows.find((r) => r.status === "CURRENT") ?? rotation.rows.find((r) => r.status === "UPCOMING") ?? null;
    const base = {
      tontine,
      role: member.role,
      memberCount: activeMembers.length,
      nextDueDate: nextDueDate(tontine, t),
      nextBeneficiary,
      mySlot: rotation.mySlot,
      pendingInvitations: member.role === "ADMIN" ? s.invitations.filter((i) => i.tontineId === tontineId && i.status === "PENDING" && new Date(i.expiresAt) > ctx.now).length : 0,
    };

    const mine = obligations.filter((o) => o.memberId === member.id);
    const minePaidAmount = sumAmounts(s.payments.filter((p) => p.status === "PAID" && mine.some((o) => o.id === p.obligationId)).map((p) => p.amount));
    const personal = {
      toPay: mine.filter((o) => o.status === "PENDING" || o.status === "REJECTED").length,
      toPayAmount: sumAmounts(mine.filter((o) => o.status === "PENDING" || o.status === "REJECTED").map((o) => o.expectedAmount)),
      paidCount: mine.filter((o) => o.status === "PAID").length,
      paidAmount: minePaidAmount,
      declared: mine.filter((o) => o.status === "DECLARED").length,
      late: mine.filter((o) => effectiveObligationStatus(o, t) === "LATE").length,
    };

    if (member.role !== "ADMIN") return { ...base, personal, admin: null };

    const dueSoFar = obligations.filter((o) => o.dueDate <= t);
    const paidPayments = s.payments.filter((p) => p.status === "PAID" && obligations.some((o) => o.id === p.obligationId));
    const lateByMember = new Set(obligations.filter((o) => effectiveObligationStatus(o, t) === "LATE").map((o) => o.memberId));
    const periods = s.contributionPeriods.filter((p) => p.tontineId === tontineId).sort((a, b) => a.periodNumber - b.periodNumber);
    const progress = periods.map((p) => {
      const os = obligations.filter((o) => o.periodId === p.id);
      return { periodNumber: p.periodNumber, dueDate: p.dueDate, expected: os.length, paid: os.filter((o) => o.status === "PAID").length };
    });
    return {
      ...base,
      personal,
      admin: {
        expectedPerPeriod: tontine.contributionAmount * activeMembers.length,
        totalExpected: sumAmounts(dueSoFar.map((o) => o.expectedAmount)),
        totalConfirmed: sumAmounts(paidPayments.map((p) => p.amount)),
        pendingValidations: obligations.filter((o) => o.status === "DECLARED").length,
        lateCount: obligations.filter((o) => effectiveObligationStatus(o, t) === "LATE").length,
        membersUpToDate: activeMembers.filter((m) => !lateByMember.has(m.id)).length,
        progress: progress.slice(-8),
      },
    };
  });
}
