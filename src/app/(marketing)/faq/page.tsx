import type { Metadata } from "next";
import { ChevronDown } from "lucide-react";
import Link from "next/link";
import { SiteHeader } from "@/components/marketing/site-header";
import { FAQ } from "@/lib/marketing/plans";

export const metadata: Metadata = { title: "Questions fréquentes" };

export default function FaqPage() {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-3xl px-4 py-12 sm:px-6 md:py-16">
        <h1 className="font-display text-4xl font-bold tracking-tight sm:text-5xl">Questions fréquentes</h1>
        <div className="mt-8 divide-y rounded-xl border bg-card">
          {FAQ.map((f) => (
            <details key={f.q} className="group px-5 py-4">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-medium [&::-webkit-details-marker]:hidden">
                {f.q}
                <ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" aria-hidden />
              </summary>
              <p className="mt-3 max-w-2xl leading-relaxed text-muted-foreground">{f.a}</p>
            </details>
          ))}
        </div>
        <p className="mt-8 text-muted-foreground">
          Votre question n&apos;y est pas ? <Link href="/contact" className="font-medium text-primary hover:underline">Écrivez-nous</Link>.
        </p>
      </main>
    </>
  );
}
