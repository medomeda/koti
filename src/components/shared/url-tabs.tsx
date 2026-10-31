"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { ReactNode } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/misc";

/** Onglets synchronisés avec l'URL (?tab=…) : lien profond et bouton retour fonctionnels. */
export function UrlTabs({ value, items }: { value: string; items: Array<{ value: string; label: ReactNode; count?: number; content: ReactNode }> }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const onChange = (v: string) => {
    const next = new URLSearchParams(params);
    if (v === items[0]?.value) next.delete("tab");
    else next.set("tab", v);
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };
  return (
    <Tabs value={value} onValueChange={onChange}>
      <TabsList className="mb-4">
        {items.map((it) => (
          <TabsTrigger key={it.value} value={it.value}>
            {it.label}
            {it.count !== undefined && <span className="rounded-full bg-muted px-1.5 text-xs tabular-nums text-muted-foreground">{it.count}</span>}
          </TabsTrigger>
        ))}
      </TabsList>
      {items.map((it) => (
        <TabsContent key={it.value} value={it.value} className="focus-visible:outline-none">
          {it.content}
        </TabsContent>
      ))}
    </Tabs>
  );
}
