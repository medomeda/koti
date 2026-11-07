import { ChevronDown } from "lucide-react";
import { DeclarePaymentButton } from "@/components/shared/declare-payment-dialog";
import { HistoryButton, ReviewActions } from "@/components/shared/payment-review";
import { ObligationStatusBadge } from "@/components/shared/status";
import { Avatar } from "@/components/ui/misc";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PAYMENT_METHOD_LABEL } from "@/lib/constants/labels";
import { cn } from "@/lib/utils/cn";
import { formatDate, formatDateTime } from "@/lib/utils/dates";
import { formatFCFA, sumAmounts } from "@/lib/utils/money";
import type { ObligationView } from "@/modules/payments/payment.service";

function declareTarget(o: ObligationView) {
  return { id: o.id, tontineName: o.tontineName, expectedAmount: o.expectedAmount, dueDate: o.dueDate, periodNumber: o.periodNumber, ticketLabel: o.ticketLabel, rejectionReason: o.rejected ? o.lastPayment?.rejectionReason : null };
}

function hasPrimaryAction(o: ObligationView, isAdmin: boolean) {
  return (isAdmin && o.status === "DECLARED" && !!o.lastPayment) || o.canDeclare;
}

function RowActions({ o, isAdmin, withHistory = true }: { o: ObligationView; isAdmin: boolean; withHistory?: boolean }) {
  const p = o.lastPayment;
  return (
    <div className="flex items-center justify-end gap-1.5">
      {isAdmin && o.status === "DECLARED" && p && (
        <ReviewActions paymentId={p.id} memberName={o.memberName} amount={p.amount} expectedAmount={o.expectedAmount} method={PAYMENT_METHOD_LABEL[p.paymentMethod]} reference={p.reference} paymentDate={p.paymentDate} />
      )}
      {o.canDeclare && <DeclarePaymentButton target={declareTarget(o)} label={o.rejected ? "Redéclarer" : "Déclarer"} />}
      {withHistory && <HistoryButton obligationId={o.id} label={`${o.memberName} · ${o.ticketLabel} · échéance n°${o.periodNumber} du ${formatDate(o.dueDate)}`} />}
    </div>
  );
}

/**
 * Lignes d'échéances : tableau sur desktop, liste sur mobile.
 * `hide` retire la colonne qui sert déjà de regroupement (« period » ou « member »).
 */
export function ObligationsTable({ rows, isAdmin, hide }: { rows: ObligationView[]; isAdmin: boolean; hide?: "member" | "period" }) {
  const showMember = isAdmin && hide !== "member";
  const showPeriod = hide !== "period";
  return (
    <>
      <ul className="divide-y md:hidden">
        {rows.map((o) => (
          <li key={o.id} className="space-y-2 px-4 py-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-medium">
                  {showMember ? o.memberName : `Échéance n°${o.periodNumber}`} <span className="text-xs font-normal text-muted-foreground">· {o.ticketLabel}</span>
                </p>
                <p className="text-sm text-muted-foreground">
                  {showMember && showPeriod && <>N°{o.periodNumber} · </>}
                  {formatDate(o.dueDate)}
                </p>
              </div>
              <div className="text-right">
                <p className="font-semibold tabular-nums">{formatFCFA(o.lastPayment?.amount ?? o.expectedAmount)}</p>
                <div className="mt-0.5 flex items-center justify-end gap-1">
                  <ObligationStatusBadge status={o.status} />
                  <HistoryButton obligationId={o.id} label={`${o.memberName} · ${o.ticketLabel} · échéance n°${o.periodNumber} du ${formatDate(o.dueDate)}`} />
                </div>
              </div>
            </div>
            {o.lastPayment && o.status === "DECLARED" && (
              <p className="text-xs text-muted-foreground">
                Déclaré {formatDateTime(o.lastPayment.declaredAt)} · {PAYMENT_METHOD_LABEL[o.lastPayment.paymentMethod]}
              </p>
            )}
            {o.rejected && o.lastPayment?.rejectionReason && <p className="text-xs text-destructive-soft-foreground">Refusé : {o.lastPayment.rejectionReason}</p>}
            {hasPrimaryAction(o, isAdmin) && <RowActions o={o} isAdmin={isAdmin} withHistory={false} />}
          </li>
        ))}
      </ul>
      <div className="hidden md:block">
        {/* Largeurs fixes : les colonnes restent alignées d'une section groupée à l'autre. */}
        <Table className="table-fixed">
          <TableHeader>
            <TableRow>
              {showMember && <TableHead className="w-[20%]">Membre</TableHead>}
              {showPeriod && <TableHead className="w-[15%]">Période</TableHead>}
              <TableHead className="w-[13%] text-right">Montant</TableHead>
              <TableHead className="w-[19%]">Déclaration</TableHead>
              <TableHead className="w-[16%]">Statut</TableHead>
              <TableHead className="text-right">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((o) => (
              <TableRow key={o.id} className={cn(o.status === "DECLARED" && isAdmin && "bg-warning-soft/40")}>
                {showMember && (
                  <TableCell className="truncate font-medium">
                    {o.memberName}
                    <span className="block text-xs font-normal text-muted-foreground">{o.ticketLabel}</span>
                  </TableCell>
                )}
                {showPeriod && (
                  <TableCell>
                    <span className="font-medium">N°{o.periodNumber}</span>
                    <span className="block text-xs text-muted-foreground">{formatDate(o.dueDate)}</span>
                  </TableCell>
                )}
                <TableCell className="text-right tabular-nums">
                  {formatFCFA(o.lastPayment?.amount ?? o.expectedAmount)}
                  {o.lastPayment && o.lastPayment.amount !== o.expectedAmount && <span className="block text-xs text-warning">attendu {formatFCFA(o.expectedAmount)}</span>}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {o.lastPayment ? (
                    <span className="text-xs leading-relaxed">
                      {formatDateTime(o.lastPayment.declaredAt)}
                      <span className="block">
                        {PAYMENT_METHOD_LABEL[o.lastPayment.paymentMethod]}
                        {o.lastPayment.reference && ` · ${o.lastPayment.reference}`}
                      </span>
                    </span>
                  ) : (
                    "—"
                  )}
                </TableCell>
                <TableCell>
                  <ObligationStatusBadge status={o.status} />
                  {o.rejected && o.lastPayment?.rejectionReason && <span className="mt-1 block max-w-48 truncate text-xs text-destructive-soft-foreground" title={o.lastPayment.rejectionReason}>Refusé : {o.lastPayment.rejectionReason}</span>}
                </TableCell>
                <TableCell>
                  <RowActions o={o} isAdmin={isAdmin} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </>
  );
}

export interface ObligationGroup {
  key: string;
  title: string;
  subtitle: string;
  avatarName?: string;
  rows: ObligationView[];
}

function summarize(rows: ObligationView[]) {
  const paid = rows.filter((r) => r.status === "PAID");
  return {
    paid: paid.length,
    total: rows.length,
    collected: sumAmounts(paid.map((r) => r.lastPayment?.amount ?? r.expectedAmount)),
    expected: sumAmounts(rows.map((r) => r.expectedAmount)),
    late: rows.filter((r) => r.status === "LATE").length,
    declared: rows.filter((r) => r.status === "DECLARED").length,
  };
}

/**
 * Section repliable (élément natif <details> : accessible au clavier, sans JavaScript).
 * Ouverte par défaut si elle demande une action (validation, retard) ou si elle est la première.
 */
export function ObligationGroupSection({ group, isAdmin, hide, defaultOpen }: { group: ObligationGroup; isAdmin: boolean; hide: "member" | "period"; defaultOpen: boolean }) {
  const s = summarize(group.rows);
  const pct = s.total ? Math.round((s.paid / s.total) * 100) : 0;
  return (
    <details open={defaultOpen || s.declared > 0 || s.late > 0} className="group border-b last:border-b-0">
      <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/40 sm:px-5 [&::-webkit-details-marker]:hidden">
        {group.avatarName && <Avatar name={group.avatarName} className="size-8" />}
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">{group.title}</p>
          <p className="text-xs text-muted-foreground">{group.subtitle}</p>
        </div>
        <div className="hidden w-40 sm:block" aria-hidden>
          <div className="h-1.5 overflow-hidden rounded-full bg-muted">
            <div className={cn("h-full rounded-full", pct === 100 ? "bg-primary" : s.late ? "bg-warning" : "bg-primary/60")} style={{ width: `${pct}%` }} />
          </div>
        </div>
        <div className="text-right text-xs leading-relaxed">
          <p className="font-semibold tabular-nums text-foreground">
            {s.paid}/{s.total} payé{s.paid > 1 ? "s" : ""}
          </p>
          <p className="hidden tabular-nums text-muted-foreground sm:block">
            {formatFCFA(s.collected)} / {formatFCFA(s.expected)}
          </p>
        </div>
        <div className="hidden flex-col items-end gap-1 sm:flex">
          {s.declared > 0 && <span className="rounded-full bg-warning-soft px-2 py-0.5 text-xs font-medium text-warning-soft-foreground">{s.declared} à valider</span>}
          {s.late > 0 && <span className="rounded-full bg-destructive-soft px-2 py-0.5 text-xs font-medium text-destructive-soft-foreground">{s.late} retard{s.late > 1 ? "s" : ""}</span>}
        </div>
        <ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" aria-hidden />
      </summary>
      {(s.declared > 0 || s.late > 0) && (
        <div className="flex gap-1.5 px-4 pb-2 sm:hidden">
          {s.declared > 0 && <span className="rounded-full bg-warning-soft px-2 py-0.5 text-xs font-medium text-warning-soft-foreground">{s.declared} à valider</span>}
          {s.late > 0 && <span className="rounded-full bg-destructive-soft px-2 py-0.5 text-xs font-medium text-destructive-soft-foreground">{s.late} retard{s.late > 1 ? "s" : ""}</span>}
        </div>
      )}
      <div className="border-t bg-card">
        <ObligationsTable rows={group.rows} isAdmin={isAdmin} hide={hide} />
      </div>
    </details>
  );
}
