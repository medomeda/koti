"use client";

import { LayoutList, Rows3, Users } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { NativeSelect } from "@/components/ui/input";
import { cn } from "@/lib/utils/cn";

export type PaymentsView = "list" | "period" | "member";

const VIEWS: Array<{ value: PaymentsView; label: string; short: string; icon: React.ReactNode }> = [
  { value: "period", label: "Par échéance", short: "Échéances", icon: <Rows3 /> },
  { value: "member", label: "Par membre", short: "Membres", icon: <Users /> },
  { value: "list", label: "Liste", short: "Liste", icon: <LayoutList /> },
];

/**
 * Filtres et mode d'affichage de la page Paiements d'une tontine.
 * Tout est porté par l'URL (?view, ?period, ?member) : partageable, compatible bouton retour.
 */
export function PaymentsToolbar({ view, period, member, periods, members }: { view: PaymentsView; period: number; member: string; periods: Array<{ value: number; label: string }>; members: Array<{ value: string; label: string }> }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();

  const update = (key: string, value: string, fallback: string) => {
    const next = new URLSearchParams(params);
    if (!value || value === fallback) next.delete(key);
    else next.set(key, value);
    next.delete("page");
    const qs = next.toString();
    startTransition(() => router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false }));
  };

  return (
    <div className={cn("flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between", pending && "opacity-70")} aria-busy={pending || undefined}>
      <div role="radiogroup" aria-label="Affichage" className="inline-flex w-full rounded-lg bg-muted p-1 sm:w-auto">
        {VIEWS.map((v) => (
          <button
            key={v.value}
            type="button"
            role="radio"
            aria-checked={view === v.value}
            aria-label={v.label}
            onClick={() => update("view", v.value, "period")}
            className={cn(
              "inline-flex h-8 flex-1 items-center justify-center gap-1.5 rounded-md px-3 text-sm font-medium transition-colors sm:flex-none [&_svg]:size-4",
              view === v.value ? "bg-card text-foreground shadow-xs" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {v.icon}
            <span className="sm:hidden">{v.short}</span>
            <span className="hidden sm:inline">{v.label}</span>
          </button>
        ))}
      </div>
      <div className="grid grid-cols-1 gap-2 sm:flex">
        <label className="sr-only" htmlFor="filter-member">
          Membre
        </label>
        <NativeSelect id="filter-member" value={member} onChange={(e) => update("member", e.target.value, "")} className="h-10 sm:h-9 sm:w-52">
          <option value="">Tous les membres</option>
          {members.map((m) => (
            <option key={m.value} value={m.value}>
              {m.label}
            </option>
          ))}
        </NativeSelect>
        <label className="sr-only" htmlFor="filter-period">
          Échéance
        </label>
        <NativeSelect id="filter-period" value={period || ""} onChange={(e) => update("period", e.target.value, "")} className="h-10 sm:h-9 sm:w-52">
          <option value="">Toutes les échéances</option>
          {periods.map((p) => (
            <option key={p.value} value={p.value}>
              {p.label}
            </option>
          ))}
        </NativeSelect>
      </div>
    </div>
  );
}
