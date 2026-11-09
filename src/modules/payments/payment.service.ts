import "server-only";
import { audit } from "@/modules/audit/audit.service";
import { effectiveObligationStatus } from "@/modules/contributions/contribution.service";
import { formatTicketNumber, memberActiveTickets } from "@/modules/tickets/ticket.rules";
import { notify } from "@/modules/notifications/notification.service";
import { formatDate } from "@/lib/utils/dates";
import { formatFCFA, sumAmounts } from "@/lib/utils/money";
import { displayName, isoNow, requireAccess, today, type Ctx } from "@/server/context";
import { read, tx, type DbState } from "@/server/db/store";
import { AppError, conflict, invalidState, notFound } from "@/server/errors";
import { newId } from "@/server/ids";
import type { ContributionObligation, ISODate, ObligationStatus, Payment, PaymentMethod, TontineStatus, PaymentProofMode } from "@/types/domain";

const PAYABLE_TONTINE: TontineStatus[] = ["ACTIVE", "PAUSED"];

export interface ObligationView {
  id: string;
  tontineId: string;
  tontineName: string;
  tontineStatus: TontineStatus;
  periodNumber: number;
  memberId: string;
  memberName: string;
  /** Ticket concerné (une obligation = un ticket = une période). */
  ticketId: string;
  ticketLabel: string;
  /** Nombre de tickets actifs du membre : l'étiquette du ticket n'est mise en avant que s'il en a plusieurs. */
  memberTicketCount: number;
  expectedAmount: number;
  dueDate: ISODate;
  status: ObligationStatus;
  /** Dernière déclaration (la plus récente), le cas échéant. */
  lastPayment: PaymentView | null;
  /** Dernière déclaration refusée et pas encore remplacée (indépendant de l'affichage « En retard »). */
  rejected: boolean;
  canDeclare: boolean;
  /** Échéance de l'utilisateur lui-même (l'historique détaillé et les justificatifs ne sont ouverts que pour celles-là et aux administrateurs). */
  mine: boolean;
  /** Options de la tontine utiles à l'écran de déclaration. */
  paymentProofMode: PaymentProofMode;
  membersSeePayments: boolean;
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
  /** Justificatif joint (lisible par le membre concerné et les administrateurs seulement). */
  proofId: string | null;
}

function toPaymentView(s: Readonly<DbState>, p: Payment): PaymentView {
  return {
    proofId: p.proofId ?? null,
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

/**
 * Vue « transparence » d'un paiement d'un AUTRE membre : l'état, le montant, la date et le mode seulement. La référence
 * de transaction, le commentaire, le motif de refus et le justificatif restent réservés au membre et aux administrateurs.
 */
function publicPaymentView(p: PaymentView): PaymentView {
  return { ...p, reference: "", comment: "", rejectionReason: "", proofId: null };
}

function toObligationView(s: Readonly<DbState>, o: ContributionObligation, t: ISODate, myMemberIds: Set<string>): ObligationView {
  const tontine = s.tontines.find((x) => x.id === o.tontineId)!;
  const member = s.tontineMembers.find((m) => m.id === o.memberId)!;
  const period = s.contributionPeriods.find((p) => p.id === o.periodId)!;
  const last = paymentsOf(s, o.id)[0];
  const ticket = s.tontineTickets.find((x) => x.id === o.ticketId)!;
  return {
    id: o.id,
    tontineId: o.tontineId,
    tontineName: tontine.name,
    tontineStatus: tontine.status,
    periodNumber: period.periodNumber,
    memberId: o.memberId,
    memberName: displayName(s, member.userId),
    ticketId: o.ticketId,
    ticketLabel: formatTicketNumber(ticket.ticketNumber),
    memberTicketCount: memberActiveTickets(s, o.memberId).length,
    expectedAmount: o.expectedAmount,
    dueDate: o.dueDate,
    status: effectiveObligationStatus(o, t),
    lastPayment: last ? toPaymentView(s, last) : null,
    rejected: o.status === "REJECTED",
    mine: myMemberIds.has(o.memberId),
    paymentProofMode: tontine.paymentProofMode,
    membersSeePayments: tontine.membersSeePayments,
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

/** Résumé de la période en cours pour la transparence : combien de cotisations réglées / en attente / en retard. */
function summaryOf(s: Readonly<DbState>, tontineId: string, rows: ObligationView[], t: ISODate) {
  const due = rows.filter((r) => r.dueDate <= t);
  const paid = due.filter((r) => r.status === "PAID").length;
  const late = due.filter((r) => r.status === "LATE").length;
  const declared = rows.filter((r) => r.status === "DECLARED").length;
  const active = s.tontineMembers.filter((m) => m.tontineId === tontineId && m.status === "ACTIVE");
  const lateMembers = new Set(rows.filter((r) => r.status === "LATE").map((r) => r.memberId));
  return { dueCount: due.length, paidCount: paid, lateCount: late, declaredCount: declared, membersUpToDate: active.filter((m) => !lateMembers.has(m.id)).length, memberCount: active.length };
}

/**
 * Vue d'une tontine : l'administrateur voit tout ; le membre voit ses propres lignes, et celles des autres membres
 * (sans leurs justificatifs ni références) seulement si l'administrateur a activé l'option « transparence ».
 */
export function listTontineObligations(ctx: Ctx, tontineId: string) {
  return read((s) => {
    const { tontine, member } = requireAccess(s, ctx, tontineId, "payment.viewOwn");
    const t = today(ctx);
    const isAdmin = member.role === "ADMIN";
    const mine = new Set([member.id]);
    const sharing = tontine.membersSeePayments;
    const source = s.contributionObligations.filter((o) => o.tontineId === tontineId && (isAdmin || sharing || o.memberId === member.id));
    const rows = source
      .map((o) => {
        const view = toObligationView(s, o, t, mine);
        return isAdmin || o.memberId === member.id || !view.lastPayment ? view : { ...view, lastPayment: publicPaymentView(view.lastPayment) };
      })
      .sort((a, b) => b.periodNumber - a.periodNumber || a.memberName.localeCompare(b.memberName, "fr"));
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
    // Résumé collectif, visible des membres seulement en mode transparence.
    const summary = sharing || isAdmin ? summaryOf(s, tontineId, rows, t) : null;
    return { tontine, role: member.role, rows, stats, periods, sharing, summary };
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
  input: { obligationId: string; amount: number; paymentDate: ISODate; paymentMethod: PaymentMethod; reference: string; comment: string; proofId?: string },
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
    // Option « justificatif » de la tontine. (Que le justificatif appartienne bien à ce membre est vérifié avant, dans la façade.)
    if (tontine.paymentProofMode === "REQUIRED" && !input.proofId) throw new AppError("VALIDATION", "L'administrateur exige un justificatif de paiement (capture d'écran ou photo du reçu).", { proof: "Justificatif obligatoire." });
    if (tontine.paymentProofMode === "OFF" && input.proofId) throw new AppError("VALIDATION", "Cette tontine n'utilise pas de justificatif de paiement.", { proof: "Justificatif non utilisé." });

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
      ...(input.proofId ? { proofId: input.proofId } : {}),
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
    audit(s, ctx, { tontineId: tontine.id, action: "payment.declare", entityType: "payment", entityId: id, newValues: { obligationId: o.id, amount: input.amount, method: input.paymentMethod, proof: Boolean(input.proofId) } });
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
