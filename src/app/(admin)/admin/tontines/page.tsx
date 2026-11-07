import { Landmark, Search } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { TontineStatusBadge } from "@/components/shared/status";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState, PageHeader } from "@/components/ui/feedback";
import { Input, NativeSelect } from "@/components/ui/input";
import { Pagination } from "@/components/ui/pagination";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { guard } from "@/lib/auth/guard";
import { requireUser } from "@/lib/auth/session";
import { HEALTH } from "@/lib/constants/admin-labels";
import { FREQUENCY_UNIT, TONTINE_STATUS } from "@/lib/constants/labels";
import { formatDate } from "@/lib/utils/dates";
import { formatFCFA } from "@/lib/utils/money";
import { listAdminTontines } from "@/modules/admin/admin.service";
import { ctxFor } from "@/server/context";
import { TONTINE_STATUSES, type TontineStatus } from "@/types/domain";

export const metadata: Metadata = { title: "Tontines" };

type Search = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function AdminTontinesPage({ searchParams }: { searchParams: Promise<Search> }) {
  const sp = await searchParams;
  const user = await requireUser("/admin/tontines");
  const status = TONTINE_STATUSES.includes(one(sp.status) as TontineStatus) ? (one(sp.status) as TontineStatus) : undefined;
  const health = Object.keys(HEALTH).includes(one(sp.health) ?? "") ? one(sp.health) : undefined;
  const q = one(sp.q)?.slice(0, 80);
  const data = guard(() => listAdminTontines(ctxFor(user.id), { q, status, health, page: Number(one(sp.page)) || 1 }));
  const hrefFor = (page: number) => {
    const p = new URLSearchParams();
    if (q) p.set("q", q);
    if (status) p.set("status", status);
    if (health) p.set("health", health);
    if (page > 1) p.set("page", String(page));
    const qs = p.toString();
    return qs ? `/admin/tontines?${qs}` : "/admin/tontines";
  };
  return (
    <>
      <PageHeader title="Tontines" description="Vue globale en lecture seule : effectifs, tickets et retards agrégés. Le détail des paiements n'est pas accessible." />
      <Card>
        <form method="get" className="grid gap-3 border-b p-4 sm:grid-cols-2 lg:grid-cols-[1.6fr_1fr_1fr_auto] lg:items-end sm:p-5" role="search">
          <label className="space-y-1.5 text-sm font-medium">
            Recherche
            <span className="relative block">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <Input name="q" defaultValue={q} placeholder="Nom de la tontine ou de l'organisateur" className="pl-9" />
            </span>
          </label>
          <label className="space-y-1.5 text-sm font-medium">
            Statut
            <NativeSelect name="status" defaultValue={status ?? ""}>
              <option value="">Tous</option>
              {TONTINE_STATUSES.map((s) => (
                <option key={s} value={s}>{TONTINE_STATUS[s].label}</option>
              ))}
            </NativeSelect>
          </label>
          <label className="space-y-1.5 text-sm font-medium">
            Santé
            <NativeSelect name="health" defaultValue={health ?? ""}>
              <option value="">Toutes</option>
              {Object.entries(HEALTH).map(([k, v]) => (
                <option key={k} value={k}>{v.label}</option>
              ))}
            </NativeSelect>
          </label>
          <div className="flex gap-2">
            <Button type="submit">Filtrer</Button>
            {(q || status || health) && (
              <Button asChild variant="ghost">
                <Link href="/admin/tontines">Effacer</Link>
              </Button>
            )}
          </div>
        </form>
        {data.rows.length === 0 ? (
          <EmptyState icon={<Landmark />} title="Aucune tontine ne correspond" />
        ) : (
          <>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Tontine</TableHead>
                    <TableHead>Organisateur</TableHead>
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
                  {data.rows.map((t) => (
                    <TableRow key={t.id}>
                      <TableCell className="font-medium">{t.name}</TableCell>
                      <TableCell>
                        <Link href={`/admin/clients/${t.creatorId}`} className="hover:text-primary hover:underline">
                          {t.creatorName}
                        </Link>
                      </TableCell>
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
            </div>
            <Pagination page={data.page} pages={data.pages} total={data.total} hrefFor={hrefFor} unit="tontines" />
          </>
        )}
      </Card>
    </>
  );
}
