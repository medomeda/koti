import { Receipt } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { PaymentsToolbar, type PaymentsView } from "@/components/shared/payments-toolbar";
import { ObligationGroupSection, ObligationsTable, type ObligationGroup } from "@/components/shared/tontine-payments";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, EmptyState, StatCard } from "@/components/ui/feedback";
import { Pagination } from "@/components/ui/pagination";
import { guard } from "@/lib/auth/guard";
import { requireUser } from "@/lib/auth/session";
import { OBLIGATION_STATUS } from "@/lib/constants/labels";
import { cn } from "@/lib/utils/cn";
import { formatDate, formatShortDate } from "@/lib/utils/dates";
import { formatFCFA } from "@/lib/utils/money";
import { type ObligationView } from "@/modules/payments/payment.service";
import { ctxFor } from "@/server/context";
import type { ObligationStatus } from "@/types/domain";
import { listTontineObligations } from "@/server/pg/services";

export const metadata: Metadata = { title: "Paiements de la tontine" };

const STATUS_FILTERS: Array<ObligationStatus | "ALL"> = ["ALL", "DECLARED", "LATE", "PENDING", "REJECTED", "PAID"];
const VIEWS: PaymentsView[] = ["period", "member", "list"];
const ROWS_PER_PAGE = 25;
const GROUPS_PER_PAGE = 6;

type Search = { status?: string; period?: string; member?: string; view?: string; page?: string };

/** Déclarations à valider d'abord, puis retards, puis le reste. */
const urgency = (r: ObligationView) => (r.status === "DECLARED" ? 0 : r.status === "LATE" ? 1 : 2);

function groupRows(rows: ObligationView[], by: "period" | "member"): ObligationGroup[] {
  const map = new Map<string, ObligationView[]>();
  for (const r of rows) {
    const key = by === "period" ? String(r.periodNumber) : r.memberId;
    map.set(key, [...(map.get(key) ?? []), r]);
  }
  const groups = [...map.entries()].map(([key, items]): ObligationGroup => {
    const first = items[0]!;
    const sorted = [...items].sort((a, b) => urgency(a) - urgency(b) || (by === "period" ? a.memberName.localeCompare(b.memberName, "fr") : b.periodNumber - a.periodNumber));
    return by === "period"
      ? { key, title: `Échéance n°${first.periodNumber}`, subtitle: formatDate(first.dueDate), rows: sorted }
      : { key, title: first.memberName, subtitle: `${items.length} échéance${items.length > 1 ? "s" : ""}`, avatarName: first.memberName, rows: sorted };
  });
  return by === "period" ? groups.sort((a, b) => Number(b.key) - Number(a.key)) : groups.sort((a, b) => a.title.localeCompare(b.title, "fr"));
}

export default async function TontinePaymentsPage({ params, searchParams }: { params: Promise<{ tontineId: string }>; searchParams: Promise<Search> }) {
  const { tontineId } = await params;
  const sp = await searchParams;
  const user = await requireUser();
  const { tontine, role, rows, stats, periods, sharing, summary } = (await guard(async () => (await listTontineObligations(ctxFor(user.id), tontineId))));
  const isAdmin = role === "ADMIN";
  /** Administrateur, ou membre quand l'administrateur a activé la transparence : toutes les lignes sont visibles. */
  const showAll = isAdmin || sharing;

  // Filtres validés contre les valeurs existantes : une URL modifiée à la main ne casse rien.
  const memberOptions = [...new Map(rows.map((r) => [r.memberId, r.memberName])).entries()].map(([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label, "fr"));
  const status = STATUS_FILTERS.includes(sp.status as ObligationStatus) ? (sp.status as ObligationStatus) : "ALL";
  const period = periods.includes(Number(sp.period)) ? Number(sp.period) : 0;
  const member = showAll && memberOptions.some((m) => m.value === sp.member) ? sp.member! : "";
  const view: PaymentsView = showAll ? (VIEWS.includes(sp.view as PaymentsView) ? (sp.view as PaymentsView) : "period") : "list";

  const matchesStatus = (r: ObligationView, s: ObligationStatus | "ALL") => s === "ALL" || (s === "REJECTED" ? r.rejected : r.status === s);
  const inScope = (r: ObligationView) => (!period || r.periodNumber === period) && (!member || r.memberId === member);
  const filtered = rows.filter((r) => inScope(r) && matchesStatus(r, status));
  const countBy = (s: ObligationStatus | "ALL") => rows.filter((r) => inScope(r) && matchesStatus(r, s)).length;

  const href = (over: Partial<Record<keyof Search, string | number>>) => {
    const q = new URLSearchParams();
    const merged = { status: status === "ALL" ? "" : status, period: period || "", member, view: view === "period" ? "" : view, page: "", ...over };
    for (const [k, v] of Object.entries(merged)) if (v !== "" && v !== undefined && v !== "ALL") q.set(k, String(v));
    const qs = q.toString();
    return `/tontines/${tontine.id}/payments${qs ? `?${qs}` : ""}`;
  };

  // Pagination : par lignes en mode liste, par sections en mode groupé.
  const grouped = view === "list" ? null : groupRows(filtered, view);
  const unit = grouped ? grouped.length : filtered.length;
  const perPage = grouped ? GROUPS_PER_PAGE : ROWS_PER_PAGE;
  const pages = Math.max(1, Math.ceil(unit / perPage));
  const page = Math.min(pages, Math.max(1, Number(sp.page) || 1));
  const slice = <T,>(items: T[]) => items.slice((page - 1) * perPage, page * perPage);
  const listRows = view === "list" ? slice([...filtered].sort((a, b) => (showAll && status === "ALL" ? urgency(a) - urgency(b) : 0) || b.periodNumber - a.periodNumber || a.memberName.localeCompare(b.memberName, "fr"))) : [];

  const periodOptions = periods.map((p) => {
    const due = rows.find((r) => r.periodNumber === p)?.dueDate;
    return { value: p, label: `N°${p}${due ? ` · ${formatShortDate(due)}` : ""}` };
  });
  const memberName = memberOptions.find((m) => m.value === member)?.label;

  return (
    <div className="space-y-5">
      {stats && (
        <section aria-label="Indicateurs" className="grid grid-cols-2 gap-3 lg:grid-cols-5 [&>*:last-child]:col-span-2 lg:[&>*:last-child]:col-span-1">
          <StatCard label="Total attendu" value={formatFCFA(stats.totalExpected)} hint="À ce jour" />
          <StatCard label="Total confirmé" value={formatFCFA(stats.totalConfirmed)} tone="success" />
          <StatCard label="En attente" value={stats.pendingCount} tone={stats.pendingCount ? "warning" : "neutral"} hint="À valider" href={href({ status: "DECLARED", period: "", member: "" })} />
          <StatCard label="Retards" value={stats.lateCount} tone={stats.lateCount ? "danger" : "neutral"} href={href({ status: "LATE", period: "", member: "" })} />
          <StatCard label="Membres à jour" value={`${stats.membersUpToDate.count}/${stats.membersUpToDate.total}`} tone="success" href={href({ view: "member", status: "", period: "", member: "" })} />
        </section>
      )}

      {!isAdmin && summary && (
        <section aria-label="Situation de la tontine" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard label="Cotisations réglées" value={`${summary.paidCount}/${summary.dueCount}`} tone="success" hint={`${formatFCFA(summary.paidAmount)} sur ${formatFCFA(summary.dueAmount)}`} />
          <StatCard label="En attente" value={summary.declaredCount} tone={summary.declaredCount ? "warning" : "neutral"} hint={`${formatFCFA(summary.declaredAmount)} à valider`} />
          <StatCard label="Retards" value={summary.lateCount} tone={summary.lateCount ? "danger" : "neutral"} hint={`${formatFCFA(summary.lateAmount)} à régler`} />
          <StatCard label="Membres à jour" value={`${summary.membersUpToDate}/${summary.memberCount}`} tone="success" />
        </section>
      )}
      {!isAdmin && sharing && <Alert tone="brand">L&apos;administrateur a activé la transparence : chacun voit l&apos;état et le montant des paiements des autres membres. Les justificatifs et références restent privés.</Alert>}

      <Card>
        <CardHeader className="block space-y-3">
          <div>
            <CardTitle>{showAll ? "Cotisations des membres" : "Mes cotisations"}</CardTitle>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {isAdmin ? (memberName ? `Filtré sur ${memberName}${period ? `, échéance n°${period}` : ""}.` : period ? `Échéance n°${period}.` : "Toutes les échéances générées.") : sharing ? "Toutes les échéances de la tontine." : "Seules vos propres échéances sont visibles."}
            </p>
          </div>
          {showAll && rows.length > 0 && <PaymentsToolbar view={view} period={period} member={member} periods={periodOptions} members={memberOptions} />}
        </CardHeader>
        <nav aria-label="Filtrer par statut" className="scrollbar-thin flex gap-1.5 overflow-x-auto border-b px-4 py-2.5 sm:px-5">
          {STATUS_FILTERS.map((s) => (
            <Link
              key={s}
              href={href({ status: s })}
              aria-current={status === s ? "page" : undefined}
              className={cn("inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full px-3 text-xs font-medium transition-colors", status === s ? "bg-foreground text-background" : "bg-muted text-muted-foreground hover:text-foreground")}
            >
              {s === "ALL" ? "Tous" : OBLIGATION_STATUS[s].label}
              <span className="tabular-nums opacity-70">{countBy(s)}</span>
            </Link>
          ))}
          {(period > 0 || member) && (
            <Link href={href({ period: "", member: "" })} className="inline-flex h-8 shrink-0 items-center rounded-full px-3 text-xs font-medium text-primary hover:underline">
              Effacer les filtres
            </Link>
          )}
        </nav>

        {filtered.length === 0 ? (
          <EmptyState
            icon={<Receipt />}
            title={rows.length === 0 ? "Aucune échéance pour le moment" : "Aucun résultat"}
            description={rows.length === 0 ? (tontine.status === "DRAFT" ? "Les échéances seront générées au démarrage de la tontine." : "Les échéances apparaissent au fil du calendrier.") : "Modifiez les filtres pour voir d'autres échéances."}
          />
        ) : grouped ? (
          <>
            <div>
              {slice(grouped).map((g, i) => (
                <ObligationGroupSection key={g.key} group={g} isAdmin={isAdmin} showMembers={showAll} hide={view === "period" ? "period" : "member"} defaultOpen={(page === 1 && i === 0) || grouped.length === 1} />
              ))}
            </div>
            <Pagination page={page} pages={pages} total={grouped.length} unit={view === "period" ? "échéances" : "membres"} hrefFor={(pg) => href({ page: pg })} />
          </>
        ) : (
          <>
            <ObligationsTable rows={listRows} isAdmin={isAdmin} showMembers={showAll} />
            <Pagination page={page} pages={pages} total={filtered.length} hrefFor={(pg) => href({ page: pg })} />
          </>
        )}
      </Card>
    </div>
  );
}
