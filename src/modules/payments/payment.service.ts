import "server-only";
import { audit } from "@/modules/audit/audit.service";
import { effectiveObligationStatus } from "@/modules/contributions/contribution.service";
import { notify } from "@/modules/notifications/notification.service";
import { formatDate } from "@/lib/utils/dates";
import { formatFCFA, sumAmounts } from "@/lib/utils/money";
import { displayName, isoNow, requireAccess, today, type Ctx } from "@/server/context";
import { read, tx, type DbState } from "@/server/db/store";
import { AppError, conflict, invalidState, notFound } from "@/server/errors";
import { newId } from "@/server/ids";
import type { ContributionObligation, ISODate, ObligationStatus, Payment, PaymentMethod, TontineStatus } from "@/types/domain";

const PAYABLE_TONTINE: TontineStatus[] = ["ACTIVE", "PAUSED"];

export interface ObligationView {
  id: string;
  tontineId: string;
  tontineName: string;
  tontineStatus: TontineStatus;
  periodNumber: number;
  memberId: string;
  memberName: string;
  expectedAmount: number;
  dueDate: ISODate;
  status: ObligationStatus;
  /** Dernière déclaration (la plus récente), le cas échéant. */
  lastPayment: PaymentView | null;
  /** Dernière déclaration refusée et pas encore remplacée (indépendant de l'affichage « En retard »). */
  rejected: boolean;
  canDeclare: boolean;
}

export interface PaymentView {
  id: string;
  amount: number;
  paymentDate: ISODate;
  paymentMethod: PaymentMethod;
  reference: string;
  comment: string;
  status: Payment["status"];
  declaredAt: string;
  validatedAt: string | null;
  validatedByName: string | null;
  rejectionReason: string;
}

function toPaymentView(s: Readonly<DbState>, p: Payment): PaymentView {
  return {
    id: p.id,
    amount: p.amount,
    paymentDate: p.paymentDate,
    paymentMethod: p.paymentMethod,
    reference: p.reference,
    comment: p.comment,
    status: p.status,
    declaredAt: p.createdAt,
    validatedAt: p.validatedAt,
    validatedByName: p.validatedBy ? displayName(s, p.validatedBy) : null,
    rejectionReason: p.rejectionReason,
  };
}

function paymentsOf(s: Readonly<DbState>, obligationId: string) {
  return s.payments.filter((p) => p.obligationId === obligationId).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

function toObligationView(s: Readonly<DbState>, o: ContributionObligation, t: ISODate, myMemberIds: Set<string>): ObligationView {
  const tontine = s.tontines.find((x) => x.id === o.tontineId)!;
  const member = s.tontineMembers.find((m) => m.id === o.memberId)!;
  const period = s.contributionPeriods.find((p) => p.id === o.periodId)!;
  const last = paymentsOf(s, o.id)[0];
  return {
    id: o.id,
    tontineId: o.tontineId,
    tontineName: tontine.name,
    tontineStatus: tontine.status,
    periodNumber: period.periodNumber,
    memberId: o.memberId,
    memberName: displayName(s, member.userId),
    expectedAmount: o.expectedAmount,
    dueDate: o.dueDate,
    status: effectiveObligationStatus(o, t),
    lastPayment: last ? toPaymentView(s, last) : null,
    rejected: o.status === "REJECTED",
    canDeclare: myMemberIds.has(o.memberId) && member.status === "ACTIVE" && (o.status === "PENDING" || o.status === "REJECTED") && PAYABLE_TONTINE.includes(tontine.status),
  };
}

/** Page globale Paiements : UNIQUEMENT les obligations de l'utilisateur, toutes tontines confondues. */
export function listMyObligations(ctx: Ctx) {
  return read((s) => {
    const t = today(ctx);
    const myMembers = s.tontineMembers.filter((m) => m.userId === ctx.userId);
    const ids = new Set(myMembers.map((m) => m.id));
    const rows = s.contributionObligations.filter((o) => ids.has(o.memberId)).map((o) => toObligationView(s, o, t, ids));
    const byDue = (a: ObligationView, b: ObligationView) => a.dueDate.localeCompare(b.dueDate);
    return {
      toPay: rows.filter((r) => r.status === "PENDING" || r.status === "LATE" || r.status === "REJECTED").sort(byDue),
      pending: rows.filter((r) => r.status === "DECLARED").sort(byDue),
      history: rows.filter((r) => r.status === "PAID" || r.lastPayment).sort((a, b) => b.dueDate.localeCompare(a.dueDate)),
    };
  });
}

/** Vue d'une tontine : l'administrateur voit tout, le membre ne voit que ses propres lignes. */
export function listTontineObligations(ctx: Ctx, tontineId: string) {
  return read((s) => {
    const { tontine, member } = requireAccess(s, ctx, tontineId, "payment.viewOwn");
    const t = today(ctx);
    const isAdmin = member.role === "ADMIN";
    const mine = new Set([member.id]);
    const source = s.contributionObligations.filter((o) => o.tontineId === tontineId && (isAdmin || o.memberId === member.id));
    const rows = source.map((o) => toObligationView(s, o, t, mine)).sort((a, b) => b.periodNumber - a.periodNumber || a.memberName.localeCompare(b.memberName, "fr"));
    const stats = isAdmin
      ? {
          totalExpected: sumAmounts(source.filter((o) => o.dueDate <= t).map((o) => o.expectedAmount)),
          totalConfirmed: sumAmounts(s.payments.filter((p) => p.status === "PAID" && source.some((o) => o.id === p.obligationId)).map((p) => p.amount)),
          pendingCount: rows.filter((r) => r.status === "DECLARED").length,
          lateCount: rows.filter((r) => r.status === "LATE").length,
          membersUpToDate: (() => {
            const active = s.tontineMembers.filter((m) => m.tontineId === tontineId && m.status === "ACTIVE");
            const late = new Set(rows.filter((r) => r.status === "LATE").map((r) => r.memberId));
            return { count: active.filter((m) => !late.has(m.id)).length, total: active.length };
          })(),
        }
      : null;
    const periods = [...new Set(rows.map((r) => r.periodNumber))].sort((a, b) => b - a);
    return { tontine, role: member.role, rows, stats, periods };
  });
}

/** Historique complet des déclarations d'une obligation (y compris refusées). */
export function getObligationHistory(ctx: Ctx, obligationId: string) {
  return read((s) => {
    const o = s.contributionObligations.find((x) => x.id === obligationId);
    if (!o) throw notFound();
    const { member } = requireAccess(s, ctx, o.tontineId, "payment.viewOwn");
    if (member.role !== "ADMIN" && o.memberId !== member.id) throw notFound();
    return paymentsOf(s, o.id).map((p) => toPaymentView(s, p));
  });
}

/**
 * Déclaration (PRD §6.21). Garde-fous :
 * - l'obligation appartient à l'utilisateur (on ne déclare jamais pour autrui) ;
 * - pas de double déclaration : refusée si une déclaration est déjà en cours de validation ;
 * - une déclaration refusée est conservée, la nouvelle s'ajoute à l'historique.
 */
export function declarePayment(
  ctx: Ctx,
  input: { obligationId: string; amount: number; paymentDate: ISODate; paymentMethod: PaymentMethod; reference: string; comment: string },
): string {
  return tx((s) => {
    const o = s.contributionObligations.find((x) => x.id === input.obligationId);
    if (!o) throw notFound("Échéance introuvable.");
    const { tontine, member } = requireAccess(s, ctx, o.tontineId, "payment.declare");
    if (o.memberId !== member.id) throw notFound("Échéance introuvable.");
    if (!PAYABLE_TONTINE.includes(tontine.status)) throw invalidState("Cette tontine n'accepte pas de déclaration dans son état actuel.");
    if (o.status === "DECLARED") throw conflict("Une déclaration est déjà en attente de validation pour cette échéance.");
    if (o.status === "PAID") throw conflict("Cette échéance est déjà réglée.");
    if (input.paymentDate > today(ctx)) throw new AppError("VALIDATION", "La date de paiement ne peut pas être dans le futur.", { paymentDate: "Date future non autorisée." });

    const id = newId();
    s.payments.push({
      id,
      obligationId: o.id,
      amount: input.amount,
      paymentDate: input.paymentDate,
      paymentMethod: input.paymentMethod,
      reference: input.reference,
      comment: input.comment,
      status: "DECLARED",
      declaredBy: ctx.userId,
      validatedBy: null,
      validatedAt: null,
      rejectionReason: "",
      createdAt: isoNow(ctx),
      updatedAt: isoNow(ctx),
    });
    o.status = "DECLARED";
    o.updatedAt = isoNow(ctx);

    const admins = s.tontineMembers.filter((m) => m.tontineId === tontine.id && m.role === "ADMIN" && m.status === "ACTIVE" && m.userId !== ctx.userId);
    for (const a of admins) {
      notify(s, ctx, {
        userId: a.userId,
        tontineId: tontine.id,
        type: "PAYMENT_DECLARED",
        title: "Paiement à valider",
        message: `${displayName(s, ctx.userId)} a déclaré ${formatFCFA(input.amount)} pour l'échéance du ${formatDate(o.dueDate)}.`,
        resourceType: "payment",
        resourceId: id,
      });
    }
    audit(s, ctx, { tontineId: tontine.id, action: "payment.declare", entityType: "payment", entityId: id, newValues: { obligationId: o.id, amount: input.amount, method: input.paymentMethod } });
    return id;
  });
}

function loadForReview(s: DbState, ctx: Ctx, paymentId: string, permission: "payment.validate" | "payment.reject") {
  const p = s.payments.find((x) => x.id === paymentId);
  const o = p && s.contributionObligations.find((x) => x.id === p.obligationId);
  if (!p || !o) throw notFound("Paiement introuvable.");
  const { tontine } = requireAccess(s, ctx, o.tontineId, permission);
  if (!PAYABLE_TONTINE.includes(tontine.status)) throw invalidState("Cette tontine est en lecture seule.");
  // Anti double validation : seule une déclaration en attente peut être traitée.
  if (p.status !== "DECLARED" || o.status !== "DECLARED") throw conflict("Ce paiement a déjà été traité.");
  return { p, o, tontine };
}

export function validatePayment(ctx: Ctx, paymentId: string) {
  tx((s) => {
    const { p, o, tontine } = loadForReview(s, ctx, paymentId, "payment.validate");
    p.status = "PAID";
    p.validatedBy = ctx.userId;
    p.validatedAt = isoNow(ctx);
    p.updatedAt = isoNow(ctx);
    o.status = "PAID";
    o.updatedAt = isoNow(ctx);
    const owner = s.tontineMembers.find((m) => m.id === o.memberId)!;
    if (owner.userId !== ctx.userId) {
      notify(s, ctx, { userId: owner.userId, tontineId: tontine.id, type: "PAYMENT_VALIDATED", title: "Paiement validé", message: `Votre paiement de ${formatFCFA(p.amount)} (« ${tontine.name} ») a été confirmé.`, resourceType: "payment", resourceId: p.id });
    }
    audit(s, ctx, { tontineId: tontine.id, action: "payment.validate", entityType: "payment", entityId: p.id, oldValues: { status: "DECLARED" }, newValues: { status: "PAID", amount: p.amount } });
  });
}

export function rejectPayment(ctx: Ctx, input: { paymentId: string; reason: string }) {
  tx((s) => {
    const { p, o, tontine } = loadForReview(s, ctx, input.paymentId, "payment.reject");
    p.status = "REJECTED";
    p.rejectionReason = input.reason;
    p.validatedBy = ctx.userId;
    p.validatedAt = isoNow(ctx);
    p.updatedAt = isoNow(ctx);
    o.status = "REJECTED";
    o.updatedAt = isoNow(ctx);
    const owner = s.tontineMembers.find((m) => m.id === o.memberId)!;
    if (owner.userId !== ctx.userId) {
      notify(s, ctx, { userId: owner.userId, tontineId: tontine.id, type: "PAYMENT_REJECTED", title: "Paiement refusé", message: `Votre déclaration de ${formatFCFA(p.amount)} (« ${tontine.name} ») a été refusée : ${input.reason}`, resourceType: "payment", resourceId: p.id });
    }
    audit(s, ctx, { tontineId: tontine.id, action: "payment.reject", entityType: "payment", entityId: p.id, oldValues: { status: "DECLARED" }, newValues: { status: "REJECTED" }, reason: input.reason });
  });
}
