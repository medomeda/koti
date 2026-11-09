import { Mail, Phone } from "lucide-react";
import type { Metadata } from "next";
import { ClientActions } from "@/components/admin/client-actions";
import { UsageMeter } from "@/components/shared/usage-meter";
import { TontineStatusBadge } from "@/components/shared/status";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, DescriptionList, EmptyState, PageHeader } from "@/components/ui/feedback";
import { Avatar } from "@/components/ui/misc";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { guard } from "@/lib/auth/guard";
import { requireStaff } from "@/lib/auth/session";
import { HEALTH, PLAN_TONE } from "@/lib/constants/admin-labels";
import { FREQUENCY_UNIT } from "@/lib/constants/labels";
import { platformCan } from "@/lib/permissions/platform";
import { formatDate, formatDateTime } from "@/lib/utils/dates";
import { formatFCFA } from "@/lib/utils/money";
import { ctxFor } from "@/server/context";
import { getClient, platformRoleOf } from "@/server/pg/services";

export const metadata: Metadata = { title: "Fiche client" };

export default async function AdminClientPage({ params }: { params: Promise<{ userId: string }> }) {
  const { userId } = await params;
  const me = await requireStaff(`/admin/clients/${userId}`);
  const role = (await platformRoleOf(me.id));
  const c = (await guard(async () => (await getClient(ctxFor(me.id), userId))));
  const sub = c.subscription;
  const suspended = c.user.status === "SUSPENDED";
  const paid = c.plan.monthlyPrice > 0;

  return (
    <>
      <PageHeader title={c.user.name} back={{ href: "/admin/clients", label: "Clients" }} description={undefined} />
      <div className="-mt-3 mb-5 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted-foreground">
        <Avatar name={c.user.name} className="size-9" />
        <span className="inline-flex items-center gap-1.5">
          <Mail className="size-3.5" aria-hidden /> {c.user.email}
        </span>
        {c.user.phone && (
          <span className="inline-flex items-center gap-1.5">
            <Phone className="size-3.5" aria-hidden /> {c.user.phone}
          </span>
        )}
        {suspended ? <Badge tone="danger" dot>Compte suspendu</Badge> : <Badge tone="success" dot>Compte actif</Badge>}
        <Badge tone={PLAN_TONE[c.plan.id]}>{c.plan.name}</Badge>
        {sub?.status === "TRIAL" && <Badge tone="warning">Essai gratuit</Badge>}
      </div>

      <div className="mb-5">
        <ClientActions
          userId={c.user.id}
          name={c.user.name}
          suspended={suspended}
          currentPlan={c.plan.id}
          plans={c.plans}
          can={{ suspend: platformCan(role, "client.suspend"), plan: platformCan(role, "client.plan"), note: platformCan(role, "client.note") }}
        />
      </div>

      {suspended && (
        <Alert tone="danger" className="mb-5" title="Ce compte est suspendu">
          Le client ne peut pas se connecter. Le motif figure dans la chronologie ci-dessous.
        </Alert>
      )}

      <div className="grid gap-5 lg:grid-cols-3 lg:items-start">
        <Card>
          <CardHeader>
            <CardTitle>Compte</CardTitle>
          </CardHeader>
          <CardContent>
            <DescriptionList
              className="sm:grid-cols-1"
              items={[
                ["Inscription", formatDate(c.user.createdAt.slice(0, 10))],
                ["Dernière activité", formatDate(c.user.lastActivityAt.slice(0, 10))],
                ["Tontines organisées", String(c.tontines.length)],
                ["Participe comme membre à", `${c.memberships} tontine${c.memberships > 1 ? "s" : ""}`],
              ]}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Offre</CardTitle>
          </CardHeader>
          <CardContent>
            <DescriptionList
              className="sm:grid-cols-1"
              items={[
                ["Offre", `${c.plan.name}${paid ? ` · ${formatFCFA(c.plan.monthlyPrice)} par mois` : " · gratuite"}`],
                ["Statut", sub?.status === "TRIAL" ? `Essai jusqu'au ${formatDate((sub.trialEndsAt ?? "").slice(0, 10))}` : "Active"],
                ...(sub?.status === "ACTIVE" && paid && sub.currentPeriodEnd ? ([["Prochaine facture", formatDate(sub.currentPeriodEnd)]] as Array<[string, string]>) : []),
                ["Depuis le", formatDate((sub?.startedAt ?? c.user.createdAt).slice(0, 10))],
              ]}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div>
              <CardTitle>Consommation</CardTitle>
              <CardDescription>Par rapport à son offre.</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <UsageMeter label="Tontines en cours" used={c.usage.tontines.length} limit={c.plan.limits.tontines} />
            {c.usage.tontines.length > 0 && <UsageMeter label="Plus gros effectif" used={Math.max(...c.usage.tontines.map((t) => t.members))} limit={c.plan.limits.membersPerTontine} />}
          </CardContent>
        </Card>
      </div>

      <Card className="mt-5">
        <CardHeader>
          <div>
            <CardTitle>Tontines organisées</CardTitle>
            <CardDescription>Chiffres agrégés : le détail des paiements et l&apos;identité des membres ne sont pas exposés.</CardDescription>
          </div>
        </CardHeader>
        {c.tontines.length === 0 ? (
          <EmptyState title="Aucune tontine organisée" description="Ce client n'a pas encore créé de tontine." />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tontine</TableHead>
                <TableHead>Statut</TableHead>
                <TableHead className="text-right">Membres</TableHead>
                <TableHead className="text-right">Tickets</TableHead>
                <TableHead className="text-right">Cotisation</TableHead>
                <TableHead className="text-right">Retards</TableHead>
                <TableHead>Santé</TableHead>
                <TableHead>Créée le</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {c.tontines.map((t) => (
                <TableRow key={t.id}>
                  <TableCell className="font-medium">{t.name}</TableCell>
                  <TableCell>
                    <TontineStatusBadge status={t.status} />
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{t.members}</TableCell>
                  <TableCell className="text-right tabular-nums">{t.tickets}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatFCFA(t.contributionAmount)} <span className="text-xs text-muted-foreground">/ {FREQUENCY_UNIT[t.frequency]}</span>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{t.due ? `${t.late} / ${t.due}` : "—"}</TableCell>
                  <TableCell>
                    <Badge tone={HEALTH[t.health].tone}>{HEALTH[t.health].label}</Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{formatDate(t.createdAt.slice(0, 10))}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      <div className="mt-5 grid gap-5 lg:grid-cols-2 lg:items-start">
        <Card>
          <CardHeader>
            <CardTitle>Notes internes</CardTitle>
          </CardHeader>
          {c.notes.length === 0 ? (
            <EmptyState title="Aucune note" description="Les notes ne sont visibles que par l'équipe KOTI." />
          ) : (
            <ul className="divide-y">
              {c.notes.map((n) => (
                <li key={n.id} className="px-4 py-3 text-sm sm:px-5">
                  <p className="leading-relaxed">{n.text}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {n.authorName} · {formatDateTime(n.createdAt)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Chronologie</CardTitle>
          </CardHeader>
          <ol className="max-h-[520px] divide-y overflow-y-auto">
            {c.timeline.map((e, i) => (
              <li key={`${e.at}-${i}`} className="px-4 py-2.5 text-sm sm:px-5">
                <p className="font-medium">{e.label}</p>
                <p className="text-xs text-muted-foreground">
                  {formatDateTime(e.at)}
                  {e.detail ? ` · ${e.detail}` : ""}
                </p>
              </li>
            ))}
          </ol>
        </Card>
      </div>

      <Card className="mt-5">
        <CardHeader>
          <div>
            <CardTitle>Factures</CardTitle>
            <CardDescription>Factures émises.</CardDescription>
          </div>
        </CardHeader>
        {c.invoices.length === 0 ? (
          <EmptyState title="Aucune facture" />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Numéro</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Période</TableHead>
                <TableHead>Offre</TableHead>
                <TableHead className="text-right">Montant</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {c.invoices.map((i) => (
                <TableRow key={i.id}>
                  <TableCell className="font-medium tabular-nums">{i.number}</TableCell>
                  <TableCell>{formatDate(i.issuedAt.slice(0, 10))}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatDate(i.periodStart)} au {formatDate(i.periodEnd)}
                  </TableCell>
                  <TableCell>{i.planName}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatFCFA(i.amount)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>
    </>
  );
}
