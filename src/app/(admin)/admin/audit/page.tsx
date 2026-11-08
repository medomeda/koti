import type { Metadata } from "next";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState, PageHeader } from "@/components/ui/feedback";
import { NativeSelect } from "@/components/ui/input";
import { Pagination } from "@/components/ui/pagination";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { guard } from "@/lib/auth/guard";
import { requireUser } from "@/lib/auth/session";
import { ACTION_LABEL, describeChange } from "@/lib/constants/admin-labels";
import { formatDateTime } from "@/lib/utils/dates";
import { AUDIT_CATEGORIES, listPlatformAudit, type AuditCategory } from "@/modules/admin/support.service";
import { ctxFor } from "@/server/context";

export const metadata: Metadata = { title: "Journal d'audit" };

type Search = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function AdminAuditPage({ searchParams }: { searchParams: Promise<Search> }) {
  const sp = await searchParams;
  const user = await requireUser("/admin/audit");
  const category = (Object.keys(AUDIT_CATEGORIES) as AuditCategory[]).find((k) => k === one(sp.category));
  const actorId = one(sp.actor) || undefined;
  const data = guard(() => listPlatformAudit(ctxFor(user.id), { category, actorId, page: Number(one(sp.page)) || 1 }));
  const hrefFor = (page: number) => {
    const p = new URLSearchParams();
    if (category) p.set("category", category);
    if (actorId) p.set("actor", actorId);
    if (page > 1) p.set("page", String(page));
    const qs = p.toString();
    return qs ? `/admin/audit?${qs}` : "/admin/audit";
  };
  return (
    <>
      <PageHeader title="Journal d'audit" description="Toutes les actions de l'équipe KOTI sur la plateforme : qui, quand, quoi et pourquoi. Le journal ne se modifie pas." />
      <Card>
        <CardHeader>
          <div>
            <CardTitle>Actions de l&apos;équipe</CardTitle>
            <CardDescription>Les plus récentes d&apos;abord.</CardDescription>
          </div>
        </CardHeader>
        <form method="get" className="flex flex-wrap items-end gap-3 border-y p-4 sm:px-5" role="search">
          <label className="space-y-1.5 text-sm font-medium">
            Domaine
            <NativeSelect name="category" defaultValue={category ?? ""}>
              <option value="">Tous</option>
              {(Object.keys(AUDIT_CATEGORIES) as AuditCategory[]).map((k) => (
                <option key={k} value={k}>{AUDIT_CATEGORIES[k].label}</option>
              ))}
            </NativeSelect>
          </label>
          <label className="space-y-1.5 text-sm font-medium">
            Auteur
            <NativeSelect name="actor" defaultValue={actorId ?? ""}>
              <option value="">Tous</option>
              {data.staff.map((m) => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </NativeSelect>
          </label>
          <Button type="submit">Filtrer</Button>
          {(category || actorId) && (
            <Button asChild variant="ghost">
              <Link href="/admin/audit">Effacer</Link>
            </Button>
          )}
        </form>
        {data.rows.length === 0 ? (
          <EmptyState title="Aucune entrée" description="Les actions de l'équipe (suspension, changement d'offre, annonce…) apparaîtront ici." />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Auteur</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Détail</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.rows.map((r) => {
                  const change = describeChange(r.before, r.after);
                  return (
                    <TableRow key={r.id}>
                      <TableCell className="whitespace-nowrap text-muted-foreground">{formatDateTime(r.at)}</TableCell>
                      <TableCell className="whitespace-nowrap font-medium">{r.actorName}</TableCell>
                      <TableCell>
                        <Badge tone="neutral">{ACTION_LABEL[r.action] ?? r.action}</Badge>
                        {r.target && <span className="mt-1 block text-sm">{r.target}</span>}
                      </TableCell>
                      <TableCell className="max-w-md text-sm">
                        {change && <p className="text-muted-foreground">{change}</p>}
                        {r.reason && <p className="mt-0.5">« {r.reason} »</p>}
                        {!change && !r.reason && <span className="text-muted-foreground">—</span>}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
        <Pagination page={data.page} pages={data.pages} total={data.total} hrefFor={hrefFor} unit="entrées" />
      </Card>
    </>
  );
}
