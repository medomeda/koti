import { Receipt } from "lucide-react";
import type { Metadata } from "next";
import { PlanPicker } from "@/components/shared/plan-picker";
import { UsageMeter as Meter } from "@/components/shared/usage-meter";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import Link from "next/link";
import { Alert, EmptyState, PageHeader } from "@/components/ui/feedback";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireUser } from "@/lib/auth/session";
import { formatDate } from "@/lib/utils/dates";
import { formatFCFA } from "@/lib/utils/money";
import { ctxFor } from "@/server/context";
import { getAccount } from "@/server/pg/services";

export const metadata: Metadata = { title: "Mon abonnement" };

export default async function AccountPage() {
  const user = await requireUser("/account");
  const a = (await getAccount(ctxFor(user.id)));
  const sub = a.subscription;
  const paid = a.plan.monthlyPrice > 0;
  return (
    <>
      <PageHeader title="Mon abonnement" description="Votre offre, votre consommation et vos factures." back={{ href: "/profile", label: "Profil" }} />
      {a.manual && (
        <Alert tone="brand" className="mb-5">
          Chaque offre payante commence par 14 jours d&apos;essai gratuit. Ensuite, l&apos;équipe KOTI active votre offre dès réception de votre paiement :{" "}
          <Link href="/contact" className="font-medium underline">contactez-nous</Link>. Le paiement en ligne arrivera plus tard.
        </Alert>
      )}

      <div className="grid gap-5 lg:grid-cols-2 lg:items-start">
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Offre actuelle</CardTitle>
              <CardDescription>Seul l&apos;organisateur d&apos;une tontine a une offre. Participer à une tontine reste gratuit.</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-xl font-semibold">{a.plan.name}</p>
              {sub?.status === "TRIAL" ? <Badge tone="warning">Essai gratuit</Badge> : <Badge tone="success">Active</Badge>}
            </div>
            <p className="text-sm text-muted-foreground">{paid ? `${formatFCFA(a.plan.monthlyPrice)} par mois` : "Gratuite"}</p>
            {sub?.status === "TRIAL" && sub.trialEndsAt && (
              <p className="text-sm">
                Essai gratuit jusqu&apos;au <strong>{formatDate(sub.trialEndsAt.slice(0, 10))}</strong> ({a.trialDaysLeft} jour{(a.trialDaysLeft ?? 0) > 1 ? "s" : ""} restant{(a.trialDaysLeft ?? 0) > 1 ? "s" : ""}). La première facture suivra.
              </p>
            )}
            {sub?.status === "ACTIVE" && paid && sub.currentPeriodEnd && (
              <p className="text-sm">
                Prochaine facture le <strong>{formatDate(sub.currentPeriodEnd)}</strong>.
              </p>
            )}
            {!paid && sub?.canceledAt && <p className="text-sm text-muted-foreground">Retour à l&apos;offre gratuite le {formatDate(sub.canceledAt.slice(0, 10))}.</p>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div>
              <CardTitle>Consommation</CardTitle>
              <CardDescription>Par rapport aux limites de votre offre.</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <Meter label="Tontines en cours" used={a.usage.tontines.length} limit={a.plan.limits.tontines} />
            {a.usage.tontines.length === 0 ? (
              <p className="text-sm text-muted-foreground">Vous n&apos;organisez aucune tontine pour l&apos;instant.</p>
            ) : (
              <ul className="divide-y rounded-lg border">
                {a.usage.tontines.map((t) => (
                  <li key={t.id} className="space-y-2 px-3 py-3">
                    <p className="text-sm font-medium">{t.name}</p>
                    <Meter label="Membres" used={t.members} limit={a.plan.limits.membersPerTontine} />
                    <Meter label="Tickets" used={t.tickets} limit={a.plan.limits.ticketsPerTontine} />
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <section aria-labelledby="offres" className="mt-8">
        <h2 id="offres" className="mb-3 text-lg font-semibold">
          Changer d&apos;offre
        </h2>
        <PlanPicker plans={a.plans} currentId={a.plan.id} blockers={a.blockers} selfService={a.selfService} trialAvailable={!sub?.trialUsed} manual={a.manual} />
      </section>

      <Card className="mt-8">
        <CardHeader>
          <div>
            <CardTitle>Factures</CardTitle>
            <CardDescription>Vos factures émises par KOTI.</CardDescription>
          </div>
        </CardHeader>
        {a.invoices.length === 0 ? (
          <EmptyState icon={<Receipt />} title="Aucune facture" description="Votre première facture apparaîtra quand vous choisirez une offre payante." />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Numéro</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Période</TableHead>
                <TableHead>Offre</TableHead>
                <TableHead className="text-right">Montant</TableHead>
                <TableHead>Statut</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {a.invoices.map((i) => (
                <TableRow key={i.id}>
                  <TableCell className="font-medium tabular-nums">{i.number}</TableCell>
                  <TableCell>{formatDate(i.issuedAt.slice(0, 10))}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatDate(i.periodStart)} au {formatDate(i.periodEnd)}
                  </TableCell>
                  <TableCell>{i.planName}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatFCFA(i.amount)}</TableCell>
                  <TableCell>
                    <Badge tone="success">Payée</Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>
    </>
  );
}
