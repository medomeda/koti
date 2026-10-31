import { Receipt } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { DeclarePaymentButton } from "@/components/shared/declare-payment-dialog";
import { HistoryButton, ReviewActions } from "@/components/shared/payment-review";
import { ObligationStatusBadge } from "@/components/shared/status";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState, StatCard } from "@/components/ui/feedback";
import { Pagination } from "@/components/ui/pagination";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { guard } from "@/lib/auth/guard";
import { requireUser } from "@/lib/auth/session";
import { OBLIGATION_STATUS, PAYMENT_METHOD_LABEL } from "@/lib/constants/labels";
import { cn } from "@/lib/utils/cn";
import { formatDate, formatDateTime } from "@/lib/utils/dates";
import { formatFCFA } from "@/lib/utils/money";
import { listTontineObligations, type ObligationView } from "@/modules/payments/payment.service";
import { ctxFor } from "@/server/context";
import type { ObligationStatus } from "@/types/domain";

export const metadata: Metadata = { title: "Paiements de la tontine" };

const STATUS_FILTERS: Array<ObligationStatus | "ALL"> = ["ALL", "DECLARED", "LATE", "PENDING", "REJECTED", "PAID"];

function declareTarget(o: ObligationView) {
  return { id: o.id, tontineName: o.tontineName, expectedAmount: o.expectedAmount, dueDate: o.dueDate, periodNumber: o.periodNumber, rejectionReason: o.status === "REJECTED" ? o.lastPayment?.rejectionReason : null };
}

function RowActions({ o, isAdmin }: { o: ObligationView; isAdmin: boolean }) {
  const p = o.lastPayment;
  return (
    <div className="flex items-center justify-end gap-1.5">
      {isAdmin && o.status === "DECLARED" && p && (
        <ReviewActions paymentId={p.id} memberName={o.memberName} amount={p.amount} expectedAmount={o.expectedAmount} method={PAYMENT_METHOD_LABEL[p.paymentMethod]} reference={p.reference} paymentDate={p.paymentDate} />
      )}
      {o.canDeclare && <DeclarePaymentButton target={declareTarget(o)} label={o.status === "REJECTED" ? "Redéclarer" : "Déclarer"} />}
      <HistoryButton obligationId={o.id} label={`${o.memberName} · échéance n°${o.periodNumber} du ${formatDate(o.dueDate)}`} />
    </div>
  );
}

export default async function TontinePaymentsPage({ params, searchParams }: { params: Promise<{ tontineId: string }>; searchParams: Promise<{ status?: string; period?: string; page?: string }> }) {
  const { tontineId } = await params;
  const sp = await searchParams;
  const user = await requireUser();
  const { tontine, role, rows, stats, periods } = guard(() => listTontineObligations(ctxFor(user.id), tontineId));
  const isAdmin = role === "ADMIN";
  const status = STATUS_FILTERS.includes(sp.status as ObligationStatus) ? (sp.status as ObligationStatus) : "ALL";
  const period = Number(sp.period) || 0;
  const filtered = rows.filter((r) => (status === "ALL" || r.status === status) && (!period || r.periodNumber === period));
  // En attente de validation en premier pour l'administrateur.
  if (isAdmin && status === "ALL") filtered.sort((a, b) => Number(b.status === "DECLARED") - Number(a.status === "DECLARED"));
  const PAGE_SIZE = 25;
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const page = Math.min(pages, Math.max(1, Number(sp.page) || 1));
  const visible = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const href = (s: string, p = period, pg = 1) => {
    const q = new URLSearchParams();
    if (s !== "ALL") q.set("status", s);
    if (p) q.set("period", String(p));
    if (pg > 1) q.set("page", String(pg));
    const qs = q.toString();
    return `/tontines/${tontine.id}/payments${qs ? `?${qs}` : ""}`;
  };
  const countBy = (s: ObligationStatus | "ALL") => rows.filter((r) => (s === "ALL" || r.status === s) && (!period || r.periodNumber === period)).length;

  return (
    <div className="space-y-5">
      {stats && (
        <section aria-label="Indicateurs" className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          <StatCard label="Total attendu" value={formatFCFA(stats.totalExpected)} hint="À ce jour" />
          <StatCard label="Total confirmé" value={formatFCFA(stats.totalConfirmed)} tone="success" />
          <StatCard label="En attente" value={stats.pendingCount} tone={stats.pendingCount ? "warning" : "neutral"} hint="À valider" href={href("DECLARED")} />
          <StatCard label="Retards" value={stats.lateCount} tone={stats.lateCount ? "danger" : "neutral"} href={href("LATE")} />
          <StatCard label="Membres à jour" value={`${stats.membersUpToDate.count}/${stats.membersUpToDate.total}`} tone="success" />
        </section>
      )}

      <Card>
        <CardHeader className="gap-y-3">
          <div>
            <CardTitle>{isAdmin ? "Cotisations des membres" : "Mes cotisations"}</CardTitle>
            {!isAdmin && <p className="mt-0.5 text-sm text-muted-foreground">Seules vos propres échéances sont visibles.</p>}
          </div>
          {periods.length > 1 && (
            <form className="flex items-center gap-2" action={`/tontines/${tontine.id}/payments`}>
              {status !== "ALL" && <input type="hidden" name="status" value={status} />}
              <label htmlFor="period" className="text-sm text-muted-foreground">
                Échéance
              </label>
              <select id="period" name="period" defaultValue={period || ""} className="h-9 rounded-lg border border-input bg-card px-2 text-sm">
                <option value="">Toutes</option>
                {periods.map((p) => (
                  <option key={p} value={p}>
                    N°{p}
                  </option>
                ))}
              </select>
              <button type="submit" className="h-9 rounded-lg border px-3 text-sm font-medium hover:bg-muted">
                Filtrer
              </button>
            </form>
          )}
        </CardHeader>
        <nav aria-label="Filtrer par statut" className="scrollbar-thin flex gap-1.5 overflow-x-auto border-b px-4 py-2.5 sm:px-5">
          {STATUS_FILTERS.map((s) => (
            <Link
              key={s}
              href={href(s)}
              aria-current={status === s ? "page" : undefined}
              className={cn("inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full px-3 text-xs font-medium transition-colors", status === s ? "bg-foreground text-background" : "bg-muted text-muted-foreground hover:text-foreground")}
            >
              {s === "ALL" ? "Tous" : OBLIGATION_STATUS[s].label}
              <span className="tabular-nums opacity-70">{countBy(s)}</span>
            </Link>
          ))}
        </nav>

        {filtered.length === 0 ? (
          <EmptyState
            icon={<Receipt />}
            title={rows.length === 0 ? "Aucune échéance pour le moment" : "Aucun résultat"}
            description={rows.length === 0 ? (tontine.status === "DRAFT" ? "Les échéances seront générées au démarrage de la tontine." : "Les échéances apparaissent au fil du calendrier.") : "Modifiez les filtres pour voir d'autres échéances."}
          />
        ) : (
          <>
            <ul className="divide-y md:hidden">
              {visible.map((o) => (
                <li key={o.id} className="space-y-2 px-4 py-3.5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-medium">{isAdmin ? o.memberName : `Échéance n°${o.periodNumber}`}</p>
                      <p className="text-sm text-muted-foreground">
                        {isAdmin && <>N°{o.periodNumber} · </>}
                        {formatDate(o.dueDate)}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold tabular-nums">{formatFCFA(o.lastPayment?.amount ?? o.expectedAmount)}</p>
                      <ObligationStatusBadge status={o.status} />
                    </div>
                  </div>
                  {o.lastPayment && o.status === "DECLARED" && <p className="text-xs text-muted-foreground">Déclaré {formatDateTime(o.lastPayment.declaredAt)} · {PAYMENT_METHOD_LABEL[o.lastPayment.paymentMethod]}</p>}
                  <RowActions o={o} isAdmin={isAdmin} />
                </li>
              ))}
            </ul>
            <div className="hidden md:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    {isAdmin && <TableHead>Membre</TableHead>}
                    <TableHead>Période</TableHead>
                    <TableHead className="text-right">Montant</TableHead>
                    <TableHead>Déclaration</TableHead>
                    <TableHead>Statut</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visible.map((o) => (
                    <TableRow key={o.id} className={cn(o.status === "DECLARED" && isAdmin && "bg-warning-soft/40")}>
                      {isAdmin && <TableCell className="font-medium">{o.memberName}</TableCell>}
                      <TableCell>
                        <span className="font-medium">N°{o.periodNumber}</span>
                        <span className="block text-xs text-muted-foreground">{formatDate(o.dueDate)}</span>
                      </TableCell>
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
                      </TableCell>
                      <TableCell>
                        <RowActions o={o} isAdmin={isAdmin} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <Pagination page={page} pages={pages} total={filtered.length} hrefFor={(pg) => href(status, period, pg)} />
          </>
        )}
      </Card>
    </div>
  );
}
