import { CheckCircle2, Clock, History } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { ObligationRow } from "@/components/shared/obligation-row";
import { PaymentStatusBadge, ObligationStatusBadge } from "@/components/shared/status";
import { UrlTabs } from "@/components/shared/url-tabs";
import { Card } from "@/components/ui/card";
import { EmptyState, PageHeader, StatCard } from "@/components/ui/feedback";
import { requireUser } from "@/lib/auth/session";
import { PAYMENT_METHOD_LABEL } from "@/lib/constants/labels";
import { formatDate, formatDateTime, todayISO } from "@/lib/utils/dates";
import { formatFCFA, sumAmounts } from "@/lib/utils/money";
import { listMyObligations, type ObligationView } from "@/modules/payments/payment.service";
import { ctxFor } from "@/server/context";

export const metadata: Metadata = { title: "Mes paiements" };

const TABS = ["to-pay", "pending", "history"] as const;

function HistoryRow({ o }: { o: ObligationView }) {
  const p = o.lastPayment;
  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-1.5 px-4 py-3.5 sm:px-5">
      <div className="min-w-0 basis-full sm:basis-auto sm:flex-1">
        <Link href={`/tontines/${o.tontineId}/payments`} className="font-medium hover:text-primary hover:underline">
          {o.tontineName}
        </Link>
        <p className="text-sm text-muted-foreground">
          N°{o.periodNumber} · échéance du {formatDate(o.dueDate)}
        </p>
        {p && (
          <p className="text-xs text-muted-foreground">
            {PAYMENT_METHOD_LABEL[p.paymentMethod]} le {formatDate(p.paymentDate)}
            {p.reference && <> · réf. {p.reference}</>}
            {p.validatedAt && p.status === "PAID" && <> · validé {formatDateTime(p.validatedAt)}</>}
          </p>
        )}
      </div>
      <div className="flex w-full items-center gap-3 sm:w-auto">
        <span className="mr-auto font-semibold tabular-nums sm:mr-0">{formatFCFA(p?.amount ?? o.expectedAmount)}</span>
        {p ? <PaymentStatusBadge status={p.status} /> : <ObligationStatusBadge status={o.status} />}
      </div>
    </li>
  );
}

export default async function PaymentsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const user = await requireUser("/payments");
  const { tab } = await searchParams;
  const current = TABS.includes(tab as (typeof TABS)[number]) ? tab! : "to-pay";
  const today = todayISO();
  const { toPay, pending, history } = listMyObligations(ctxFor(user.id));
  const late = toPay.filter((o) => o.status === "LATE");
  const paidTotal = sumAmounts(history.filter((o) => o.status === "PAID").map((o) => o.lastPayment?.amount ?? o.expectedAmount));

  const list = (rows: ObligationView[], empty: React.ReactNode, render: (o: ObligationView) => React.ReactNode) => <Card>{rows.length === 0 ? empty : <ul className="divide-y">{rows.map(render)}</ul>}</Card>;

  return (
    <>
      <PageHeader title="Mes paiements" description="Vos cotisations dans toutes vos tontines. Vous seul voyez ces informations." />
      <section aria-label="Synthèse" className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="À payer" value={formatFCFA(sumAmounts(toPay.map((o) => o.expectedAmount)))} hint={`${toPay.length} échéance${toPay.length > 1 ? "s" : ""}`} />
        <StatCard label="En retard" value={late.length} tone={late.length ? "danger" : "neutral"} hint={late.length ? formatFCFA(sumAmounts(late.map((o) => o.expectedAmount))) : "Aucun retard"} />
        <StatCard label="En validation" value={pending.length} tone={pending.length ? "warning" : "neutral"} hint="Déclarations envoyées" />
        <StatCard label="Total confirmé" value={formatFCFA(paidTotal)} tone="success" hint="Paiements validés" />
      </section>
      <UrlTabs
        value={current}
        items={[
          {
            value: "to-pay",
            label: "À payer",
            count: toPay.length,
            content: list(toPay, <EmptyState icon={<CheckCircle2 />} title="Rien à payer" description="Toutes vos échéances sont réglées ou en cours de validation." />, (o) => <ObligationRow key={o.id} o={o} today={today} />),
          },
          {
            value: "pending",
            label: "En validation",
            count: pending.length,
            content: list(pending, <EmptyState icon={<Clock />} title="Aucune déclaration en attente" description="Les paiements que vous déclarez apparaissent ici jusqu'à leur validation par l'administrateur." />, (o) => <HistoryRow key={o.id} o={o} />),
          },
          {
            value: "history",
            label: "Historique",
            count: history.length,
            content: list(history, <EmptyState icon={<History />} title="Aucun historique" description="Vos paiements validés et refusés apparaîtront ici." />, (o) => <HistoryRow key={o.id} o={o} />),
          },
        ]}
      />
    </>
  );
}
