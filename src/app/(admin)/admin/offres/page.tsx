import { Check, X } from "lucide-react";
import type { Metadata } from "next";
import { PlanEditor } from "@/components/admin/plan-editor";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, DescriptionList, EmptyState, PageHeader } from "@/components/ui/feedback";
import { guard } from "@/lib/auth/guard";
import { requireStaff } from "@/lib/auth/session";
import { PLAN_TONE } from "@/lib/constants/admin-labels";
import { platformCan } from "@/lib/permissions/platform";
import { formatDateTime } from "@/lib/utils/dates";
import { formatFCFA } from "@/lib/utils/money";
import { ctxFor } from "@/server/context";
import { listPlansAdmin, platformRoleOf } from "@/server/pg/services";

export const metadata: Metadata = { title: "Offres" };

const FIELD_LABEL: Record<string, string> = { name: "Nom", tagline: "Accroche", monthlyPrice: "Prix par mois", tontines: "Tontines", membersPerTontine: "Membres par tontine", ticketsPerTontine: "Tickets par tontine", multipleTickets: "Tickets multiples" };

function show(k: string, v: unknown) {
  if (k === "monthlyPrice") return formatFCFA(Number(v));
  if (k === "multipleTickets") return v ? "oui" : "non";
  return String(v);
}

export default async function AdminPlansPage() {
  const user = await requireStaff("/admin/offres");
  const role = (await platformRoleOf(user.id));
  const { plans, history } = (await guard(async () => (await listPlansAdmin(ctxFor(user.id)))));
  const canEdit = platformCan(role, "plan.edit");
  return (
    <>
      <PageHeader title="Offres" description="Les offres proposées aux organisateurs, leurs limites et leur prix. Les réglages sont repris tout de suite par le site, la page d'abonnement des clients et les contrôles de quotas." />
      <Alert tone="neutral" className="mb-5">
        Une modification de limite s&apos;applique aux nouvelles créations : aucune tontine existante n&apos;est bloquée ni supprimée. Une modification de prix s&apos;applique aux prochaines factures ; les factures passées ne changent jamais.
        {!canEdit && " Seul un super-admin peut modifier les offres."}
      </Alert>

      <div className="grid gap-5 lg:grid-cols-3 lg:items-start">
        {plans.map(({ plan, defaults, customized, updatedAt, updatedBy, clients, trials, mrr }) => (
          <Card key={plan.id} className={plan.highlighted ? "border-primary/40" : undefined}>
            <CardHeader>
              <div>
                <CardTitle className="flex flex-wrap items-center gap-2">
                  {plan.name}
                  <Badge tone={PLAN_TONE[plan.id]}>{plan.monthlyPrice === 0 ? "Gratuite" : `${formatFCFA(plan.monthlyPrice)} par mois`}</Badge>
                  {customized && <Badge tone="warning">Modifiée</Badge>}
                </CardTitle>
                <CardDescription>{plan.tagline || "Sans accroche."}</CardDescription>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <DescriptionList
                className="sm:grid-cols-1"
                items={[
                  ["Tontines en cours", `${plan.limits.tontines}${plan.limits.tontines !== defaults.limits.tontines ? ` (origine : ${defaults.limits.tontines})` : ""}`],
                  ["Membres par tontine", `${plan.limits.membersPerTontine}${plan.limits.membersPerTontine !== defaults.limits.membersPerTontine ? ` (origine : ${defaults.limits.membersPerTontine})` : ""}`],
                  ["Tickets au total par tontine", `${plan.limits.ticketsPerTontine}${plan.limits.ticketsPerTontine !== defaults.limits.ticketsPerTontine ? ` (origine : ${defaults.limits.ticketsPerTontine})` : ""}`],
                  [
                    "Tickets multiples",
                    <span key="m" className="inline-flex items-center gap-1.5">
                      {plan.limits.multipleTickets ? <Check className="size-4 text-primary" aria-hidden /> : <X className="size-4 text-muted-foreground" aria-hidden />}
                      {plan.limits.multipleTickets ? "Inclus" : "Non inclus"}
                    </span>,
                  ],
                ]}
              />
              <div className="rounded-lg bg-muted/60 p-3 text-sm">
                <p>
                  <strong>{clients}</strong> client{clients > 1 ? "s" : ""}
                  {trials > 0 && <span className="text-muted-foreground"> · dont {trials} en essai</span>}
                </p>
                <p className="mt-0.5 text-muted-foreground">Revenu mensuel récurrent : {formatFCFA(mrr)}</p>
              </div>
              {customized && updatedAt && (
                <p className="text-xs text-muted-foreground">
                  Dernière modification par {updatedBy} le {formatDateTime(updatedAt)}.
                </p>
              )}
              {canEdit && <PlanEditor plan={{ id: plan.id, name: plan.name, tagline: plan.tagline, monthlyPrice: plan.monthlyPrice, limits: plan.limits }} customized={customized} />}
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="mt-5">
        <CardHeader>
          <div>
            <CardTitle>Historique des modifications</CardTitle>
            <CardDescription>Chaque changement est enregistré avec son auteur et son motif.</CardDescription>
          </div>
        </CardHeader>
        {history.length === 0 ? (
          <EmptyState title="Aucune modification" description="Les offres ont encore leurs valeurs d'origine." />
        ) : (
          <ol className="divide-y">
            {history.map((h) => {
              const changes = h.after ? Object.keys(h.after).filter((k) => JSON.stringify(h.before?.[k]) !== JSON.stringify(h.after![k])) : [];
              return (
                <li key={h.id} className="space-y-1 px-4 py-3 text-sm sm:px-5">
                  <p className="font-medium">
                    {plans.find((p) => p.plan.id === h.planId)?.plan.name ?? h.planId} · {h.by}
                    <span className="ml-2 text-xs font-normal text-muted-foreground">{formatDateTime(h.at)}</span>
                  </p>
                  <ul className="list-disc pl-5 text-muted-foreground">
                    {changes.map((k) => (
                      <li key={k}>
                        {FIELD_LABEL[k] ?? k} : {show(k, h.before?.[k])} → <span className="text-foreground">{show(k, h.after![k])}</span>
                      </li>
                    ))}
                  </ul>
                  {h.reason && <p className="text-xs">Motif : {h.reason}</p>}
                </li>
              );
            })}
          </ol>
        )}
      </Card>
    </>
  );
}
