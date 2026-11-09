import type { Metadata } from "next";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader, StatCard } from "@/components/ui/feedback";
import { NativeSelect } from "@/components/ui/input";
import { Pagination } from "@/components/ui/pagination";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { guard } from "@/lib/auth/guard";
import { requireStaff } from "@/lib/auth/session";
import { PLAN_TONE } from "@/lib/constants/admin-labels";
import { formatDate } from "@/lib/utils/dates";
import { formatFCFA } from "@/lib/utils/money";
import { ctxFor } from "@/server/context";
import type { PlanId } from "@/types/domain";
import { listPlatformSubscriptions } from "@/server/pg/services";

export const metadata: Metadata = { title: "Abonnements" };

type Search = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function AdminSubscriptionsPage({ searchParams }: { searchParams: Promise<Search> }) {
  const sp = await searchParams;
  const user = await requireStaff("/admin/abonnements");
  const plan = ["FREE", "PRO", "ASSOCIATION"].includes(one(sp.plan) ?? "") ? (one(sp.plan) as PlanId) : undefined;
  const status = one(sp.status) === "TRIAL" ? "TRIAL" : one(sp.status) === "ACTIVE" ? "ACTIVE" : undefined;
  const data = (await guard(async () => (await listPlatformSubscriptions(ctxFor(user.id), { plan, status, page: Number(one(sp.page)) || 1 }))));
  const hrefFor = (page: number) => {
    const p = new URLSearchParams();
    if (plan) p.set("plan", plan);
    if (status) p.set("status", status);
    if (page > 1) p.set("page", String(page));
    const qs = p.toString();
    return qs ? `/admin/abonnements?${qs}` : "/admin/abonnements";
  };
  return (
    <>
      <PageHeader title="Abonnements" description="Répartition des offres et facturation. Le règlement est manuel : activez l'offre d'un client depuis sa fiche une fois son paiement reçu." />

      <section aria-label="Répartition par offre" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {data.breakdown.map((b) => (
          <StatCard key={b.planId} label={b.name} value={`${b.clients} client${b.clients > 1 ? "s" : ""}`} hint={b.price === 0 ? "Gratuite" : `${formatFCFA(b.mrr)} par mois${b.trials ? ` · ${b.trials} en essai` : ""}`} href={`/admin/abonnements?plan=${b.planId}`} />
        ))}
        <StatCard label="Revenu mensuel récurrent" value={formatFCFA(data.mrr)} tone="success" hint="Abonnements payants actifs" />
      </section>

      <Card className="mt-5">
        <CardHeader>
          <div>
            <CardTitle>Abonnements</CardTitle>
            <CardDescription>Du plus élevé au plus bas.</CardDescription>
          </div>
        </CardHeader>
        <form method="get" className="flex flex-wrap items-end gap-3 border-y p-4 sm:px-5" role="search">
          <label className="space-y-1.5 text-sm font-medium">
            Offre
            <NativeSelect name="plan" defaultValue={plan ?? ""}>
              <option value="">Toutes</option>
              {data.breakdown.map((p) => (
                <option key={p.planId} value={p.planId}>{p.name}</option>
              ))}
            </NativeSelect>
          </label>
          <label className="space-y-1.5 text-sm font-medium">
            Statut
            <NativeSelect name="status" defaultValue={status ?? ""}>
              <option value="">Tous</option>
              <option value="ACTIVE">Actif</option>
              <option value="TRIAL">En essai</option>
            </NativeSelect>
          </label>
          <Button type="submit">Filtrer</Button>
          {(plan || status) && (
            <Button asChild variant="ghost">
              <Link href="/admin/abonnements">Effacer</Link>
            </Button>
          )}
        </form>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Client</TableHead>
                <TableHead>Offre</TableHead>
                <TableHead>Statut</TableHead>
                <TableHead className="text-right">Prix par mois</TableHead>
                <TableHead>Depuis le</TableHead>
                <TableHead>Prochaine échéance</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.rows.map((r) => (
                <TableRow key={r.userId}>
                  <TableCell>
                    <Link href={`/admin/clients/${r.userId}`} className="font-medium hover:text-primary hover:underline">
                      {r.clientName}
                    </Link>
                    <span className="block text-xs text-muted-foreground">{r.email}</span>
                  </TableCell>
                  <TableCell>
                    <Badge tone={PLAN_TONE[r.planId]}>{r.planName}</Badge>
                  </TableCell>
                  <TableCell>{r.status === "TRIAL" ? <Badge tone="warning" dot>Essai</Badge> : <Badge tone="success" dot>Actif</Badge>}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.price === 0 ? "—" : formatFCFA(r.price)}</TableCell>
                  <TableCell className="text-muted-foreground">{formatDate(r.startedAt.slice(0, 10))}</TableCell>
                  <TableCell className="text-muted-foreground">{r.status === "TRIAL" && r.trialEndsAt ? `Fin d'essai le ${formatDate(r.trialEndsAt.slice(0, 10))}` : r.nextBilling ? formatDate(r.nextBilling) : "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <Pagination page={data.page} pages={data.pages} total={data.total} hrefFor={hrefFor} unit="abonnements" />
      </Card>

      <Card className="mt-5">
        <CardHeader>
          <div>
            <CardTitle>Dernières factures</CardTitle>
            <CardDescription>Factures de tous les clients.</CardDescription>
          </div>
        </CardHeader>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Numéro</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Client</TableHead>
                <TableHead>Offre</TableHead>
                <TableHead className="text-right">Montant</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.recentInvoices.map((i) => (
                <TableRow key={i.id}>
                  <TableCell className="font-medium tabular-nums">{i.number}</TableCell>
                  <TableCell>{formatDate(i.issuedAt.slice(0, 10))}</TableCell>
                  <TableCell>
                    <Link href={`/admin/clients/${i.userId}`} className="hover:text-primary hover:underline">
                      {i.clientName}
                    </Link>
                  </TableCell>
                  <TableCell>{i.planName}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatFCFA(i.amount)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Card>
    </>
  );
}
