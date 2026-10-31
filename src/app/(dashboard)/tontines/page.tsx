import { Plus, Users } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { TontineCard } from "@/components/shared/tontine-card";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState, PageHeader } from "@/components/ui/feedback";
import { requireUser } from "@/lib/auth/session";
import { cn } from "@/lib/utils/cn";
import { listMyTontines } from "@/modules/tontines/tontine.service";
import { ctxFor } from "@/server/context";

export const metadata: Metadata = { title: "Tontines" };

const FILTERS = [
  { value: "all", label: "Toutes" },
  { value: "admin", label: "J'administre" },
  { value: "member", label: "Je participe" },
  { value: "archived", label: "Archivées" },
] as const;
type Filter = (typeof FILTERS)[number]["value"];

export default async function TontinesPage({ searchParams }: { searchParams: Promise<{ filter?: string }> }) {
  const user = await requireUser();
  const { filter: raw } = await searchParams;
  const filter: Filter = FILTERS.some((f) => f.value === raw) ? (raw as Filter) : "all";
  const all = listMyTontines(ctxFor(user.id));
  const archived = (s: string) => s === "COMPLETED" || s === "CANCELLED";
  const list = all.filter((t) =>
    filter === "admin" ? t.role === "ADMIN" && !archived(t.status) : filter === "member" ? t.role === "MEMBER" && !archived(t.status) : filter === "archived" ? archived(t.status) : !archived(t.status),
  );
  const counts: Record<Filter, number> = {
    all: all.filter((t) => !archived(t.status)).length,
    admin: all.filter((t) => t.role === "ADMIN" && !archived(t.status)).length,
    member: all.filter((t) => t.role === "MEMBER" && !archived(t.status)).length,
    archived: all.filter((t) => archived(t.status)).length,
  };

  return (
    <>
      <PageHeader
        title="Tontines"
        description="Toutes les tontines que vous administrez ou auxquelles vous participez."
        actions={
          <Button asChild>
            <Link href="/tontines/new">
              <Plus /> Créer une tontine
            </Link>
          </Button>
        }
      />
      <nav aria-label="Filtrer les tontines" className="scrollbar-thin -mx-4 mb-5 flex gap-2 overflow-x-auto px-4 pb-1">
        {FILTERS.map((f) => (
          <Link
            key={f.value}
            href={f.value === "all" ? "/tontines" : `/tontines?filter=${f.value}`}
            aria-current={filter === f.value ? "page" : undefined}
            className={cn(
              "inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-sm font-medium transition-colors",
              filter === f.value ? "border-primary bg-primary text-primary-foreground" : "bg-card text-muted-foreground hover:text-foreground",
            )}
          >
            {f.label}
            <span className={cn("tabular-nums text-xs", filter === f.value ? "opacity-80" : "")}>{counts[f.value]}</span>
          </Link>
        ))}
      </nav>
      {list.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Users />}
            title={filter === "all" ? "Aucune tontine" : "Aucune tontine dans cette catégorie"}
            description={filter === "all" ? "Créez une tontine ou acceptez une invitation pour commencer." : undefined}
            action={
              filter === "all" && (
                <Button asChild>
                  <Link href="/tontines/new">
                    <Plus /> Créer une tontine
                  </Link>
                </Button>
              )
            }
          />
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {list.map((t) => (
            <TontineCard key={t.id} t={t} />
          ))}
        </div>
      )}
    </>
  );
}
