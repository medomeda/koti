import { Search, UserSearch } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState, PageHeader } from "@/components/ui/feedback";
import { Input, NativeSelect } from "@/components/ui/input";
import { Pagination } from "@/components/ui/pagination";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { guard } from "@/lib/auth/guard";
import { requireUser } from "@/lib/auth/session";
import { PLAN_TONE } from "@/lib/constants/admin-labels";
import { formatDate } from "@/lib/utils/dates";
import { listClients, type ClientFilters } from "@/modules/admin/admin.service";
import { ctxFor } from "@/server/context";
import type { PlanId } from "@/types/domain";

export const metadata: Metadata = { title: "Clients" };

type Search = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

function StatusBadge({ accountStatus, subscriptionStatus }: { accountStatus: string; subscriptionStatus: string }) {
  if (accountStatus === "SUSPENDED") return <Badge tone="danger" dot>Suspendu</Badge>;
  if (subscriptionStatus === "TRIAL") return <Badge tone="warning" dot>Essai</Badge>;
  return <Badge tone="success" dot>Actif</Badge>;
}

export default async function AdminClientsPage({ searchParams }: { searchParams: Promise<Search> }) {
  const sp = await searchParams;
  const user = await requireUser("/admin/clients");
  const filters: ClientFilters = {
    q: one(sp.q)?.slice(0, 80),
    plan: ["FREE", "PRO", "ASSOCIATION"].includes(one(sp.plan) ?? "") ? (one(sp.plan) as PlanId) : undefined,
    status: ["ACTIVE", "SUSPENDED", "TRIAL"].includes(one(sp.status) ?? "") ? (one(sp.status) as ClientFilters["status"]) : undefined,
    type: ["organizer", "member"].includes(one(sp.type) ?? "") ? (one(sp.type) as ClientFilters["type"]) : undefined,
    activity: one(sp.activity) === "inactive" ? "inactive" : undefined,
    quota: one(sp.quota) === "1",
    page: Number(one(sp.page)) || 1,
  };
  const data = guard(() => listClients(ctxFor(user.id), filters));
  const hrefFor = (page: number) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ q: filters.q, plan: filters.plan, status: filters.status, type: filters.type, activity: filters.activity, quota: filters.quota ? "1" : undefined })) if (v) p.set(k, String(v));
    if (page > 1) p.set("page", String(page));
    const qs = p.toString();
    return qs ? `/admin/clients?${qs}` : "/admin/clients";
  };
  const hasFilter = !!(filters.q || filters.plan || filters.status || filters.type || filters.activity || filters.quota);

  return (
    <>
      <PageHeader title="Clients" description="Toutes les personnes inscrites. Un client est un organisateur dès qu'il a créé une tontine." />
      <Card>
        <form method="get" className="grid gap-3 border-b p-4 sm:grid-cols-2 lg:grid-cols-[1.6fr_1fr_1fr_1fr_auto] lg:items-end sm:p-5" role="search">
          {filters.activity && <input type="hidden" name="activity" value="inactive" />}
          {filters.quota && <input type="hidden" name="quota" value="1" />}
          <label className="space-y-1.5 text-sm font-medium">
            Recherche
            <span className="relative block">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <Input name="q" defaultValue={filters.q} placeholder="Nom ou e-mail" className="pl-9" />
            </span>
          </label>
          <label className="space-y-1.5 text-sm font-medium">
            Offre
            <NativeSelect name="plan" defaultValue={filters.plan ?? ""}>
              <option value="">Toutes</option>
              {data.plans.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </NativeSelect>
          </label>
          <label className="space-y-1.5 text-sm font-medium">
            Statut
            <NativeSelect name="status" defaultValue={filters.status ?? ""}>
              <option value="">Tous</option>
              <option value="ACTIVE">Actif</option>
              <option value="TRIAL">En essai</option>
              <option value="SUSPENDED">Suspendu</option>
            </NativeSelect>
          </label>
          <label className="space-y-1.5 text-sm font-medium">
            Profil
            <NativeSelect name="type" defaultValue={filters.type ?? ""}>
              <option value="">Tous</option>
              <option value="organizer">Organisateurs</option>
              <option value="member">Membres seulement</option>
            </NativeSelect>
          </label>
          <div className="flex gap-2">
            <Button type="submit">Filtrer</Button>
            {hasFilter && (
              <Button asChild variant="ghost">
                <Link href="/admin/clients">Effacer</Link>
              </Button>
            )}
          </div>
        </form>

        {data.rows.length === 0 ? (
          <EmptyState icon={<UserSearch />} title="Aucun client ne correspond" description="Modifiez ou effacez les filtres." />
        ) : (
          <>
            <ul className="divide-y md:hidden">
              {data.rows.map((r) => (
                <li key={r.id}>
                  <Link href={`/admin/clients/${r.id}`} className="block px-4 py-3 hover:bg-muted/40">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate font-medium">{r.name}</p>
                        <p className="truncate text-sm text-muted-foreground">{r.email}</p>
                      </div>
                      <StatusBadge accountStatus={r.accountStatus} subscriptionStatus={r.subscriptionStatus} />
                    </div>
                    <p className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <Badge tone={PLAN_TONE[r.planId]}>{r.planName}</Badge>
                      {r.liveCount} tontine{r.liveCount > 1 ? "s" : ""} · inscrit le {formatDate(r.createdAt.slice(0, 10))}
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
            <div className="hidden md:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Client</TableHead>
                    <TableHead>Offre</TableHead>
                    <TableHead>Statut</TableHead>
                    <TableHead>Profil</TableHead>
                    <TableHead className="text-right">Tontines en cours</TableHead>
                    <TableHead>Inscription</TableHead>
                    <TableHead>Dernière activité</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.rows.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell>
                        <Link href={`/admin/clients/${r.id}`} className="font-medium hover:text-primary hover:underline">
                          {r.name}
                        </Link>
                        <span className="block text-xs text-muted-foreground">{r.email}</span>
                      </TableCell>
                      <TableCell>
                        <Badge tone={PLAN_TONE[r.planId]}>{r.planName}</Badge>
                      </TableCell>
                      <TableCell>
                        <StatusBadge accountStatus={r.accountStatus} subscriptionStatus={r.subscriptionStatus} />
                      </TableCell>
                      <TableCell className="text-muted-foreground">{r.isOrganizer ? "Organisateur" : "Membre"}</TableCell>
                      <TableCell className="text-right tabular-nums">{r.liveCount}</TableCell>
                      <TableCell className="text-muted-foreground">{formatDate(r.createdAt.slice(0, 10))}</TableCell>
                      <TableCell className="text-muted-foreground">{formatDate(r.lastActivityAt.slice(0, 10))}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <Pagination page={data.page} pages={data.pages} total={data.total} hrefFor={hrefFor} unit="clients" />
          </>
        )}
      </Card>
    </>
  );
}
