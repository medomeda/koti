"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils/cn";

export function TontineNav({ tontineId, isAdmin }: { tontineId: string; isAdmin: boolean }) {
  const pathname = usePathname();
  const base = `/tontines/${tontineId}`;
  const items = [
    { href: base, label: "Vue d'ensemble", exact: true },
    { href: `${base}/members`, label: "Membres" },
    { href: `${base}/payments`, label: "Paiements" },
    { href: `${base}/rotations`, label: "Tours de main" },
    ...(isAdmin ? [{ href: `${base}/settings`, label: "Paramètres" }] : []),
  ];
  return (
    <nav aria-label="Sections de la tontine" className="scrollbar-thin -mx-4 overflow-x-auto border-b px-4 sm:mx-0 sm:px-0">
      <ul className="flex min-w-max gap-1">
        {items.map((it) => {
          const active = it.exact ? pathname === it.href : pathname.startsWith(it.href);
          return (
            <li key={it.href}>
              <Link
                href={it.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "-mb-px inline-flex h-11 items-center border-b-2 px-3 text-sm font-medium transition-colors",
                  active ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:border-border hover:text-foreground",
                )}
              >
                {it.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
