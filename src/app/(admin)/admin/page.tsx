import { ArrowDownRight, ArrowUpRight, BellRing, Building2, Landmark, Ticket, TrendingUp, Users, Wallet } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { BarChart, Funnel } from "@/components/admin/bar-chart";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, PageHeader, StatCard } from "@/components/ui/feedback";
import { guard } from "@/lib/auth/guard";
import { requireUser } from "@/lib/auth/session";
import { formatFCFA } from "@/lib/utils/money";
import { ctxFor } from "@/server/context";
import { getPlatformOverview } from "@/server/pg/services";

export const metadata: Metadata = { title: "Tableau de bord" };

function Delta({ now, before, unit = "" }: { now: number; before: number; unit?: string }) {
  const diff = now - before;
  if (diff === 0) return <span>stable par rapport au mois dernier</span>;
  const Icon = diff > 0 ? ArrowUpRight : ArrowDownRight;
  return (
    <span className="inline-flex items-center gap-0.5">
      <Icon className="size-3.5" aria-hidden />
      {diff > 0 ? "+" : ""}
      {unit === "FCFA" ? formatFCFA(diff) : diff} par rapport au mois dernier
    </span>
  );
}

export default async function AdminDashboardPage() {
  const user = await requireUser("/admin");
  const o = (await guard(async () => (await getPlatformOverview(ctxFor(user.id)))));
  const k = o.kpis;
  return (
    <>
      <PageHeader title="Tableau de bord" description="Vue d'ensemble de l'activité de la plateforme. Toutes les valeurs sont calculées sur les données fictives de la démonstration." />

      <section aria-label="Indicateurs" className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <StatCard label="Inscrits" value={k.signups.total} icon={<Users />} href="/admin/clients" hint={<Delta now={k.signups.thisMonth} before={k.signups.lastMonth} />} />
        <StatCard label="Organisateurs actifs" value={k.organizers} icon={<Building2 />} href="/admin/clients?type=organizer" hint="Clients avec au moins une tontine en cours" />
        <StatCard label="Tontines actives" value={k.tontines.active} icon={<Landmark />} href="/admin/tontines?status=ACTIVE" hint={`${k.tontines.draft} en préparation · ${k.tontines.paused} suspendue${k.tontines.paused > 1 ? "s" : ""}`} />
        <StatCard label="Tickets gérés" value={k.tickets} icon={<Ticket />} hint="Dans les tontines en cours" />
        <StatCard label="Revenu mensuel récurrent" value={formatFCFA(k.mrr)} tone="success" icon={<TrendingUp />} href="/admin/abonnements" hint={`${k.payingClients} client${k.payingClients > 1 ? "s" : ""} payant${k.payingClients > 1 ? "s" : ""} · ${k.trials} en essai (simulé)`} />
        <StatCard label="Facturé ce mois" value={formatFCFA(k.invoicedThisMonth)} icon={<Wallet />} hint={<Delta now={k.invoicedThisMonth} before={k.invoicedLastMonth} unit="FCFA" />} />
      </section>

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <Card>
          <CardContent className="pt-5">
            <BarChart title="Nouvelles inscriptions" months={o.months} values={o.series.signups} unit="inscriptions" />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <BarChart title="Revenu facturé" months={o.months} values={o.series.revenue} unit="FCFA" format={(n) => (n >= 1000 ? `${Math.round(n / 1000)} k` : String(n))} />
          </CardContent>
        </Card>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-[1.1fr_0.9fr] lg:items-start">
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Du compte à la première cotisation validée</CardTitle>
              <CardDescription>Où les nouveaux clients s&apos;arrêtent.</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <Funnel steps={o.funnel} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div>
              <CardTitle className="flex items-center gap-2">
                <BellRing className="size-4" aria-hidden /> À surveiller
              </CardTitle>
              <CardDescription>Ce qui demande une action de l&apos;équipe.</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="space-y-2.5">
            {o.alerts.length === 0 ? (
              <p className="text-sm text-muted-foreground">Rien de particulier pour l&apos;instant.</p>
            ) : (
              o.alerts.map((a) => (
                <Alert key={a.id} tone={a.tone} title={a.title} action={<Link href={a.href} className="text-sm font-medium underline underline-offset-2">Voir</Link>}>
                  {a.detail}
                </Alert>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
