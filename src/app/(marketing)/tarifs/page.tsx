import { Check } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { SiteHeader } from "@/components/marketing/site-header";
import { Button } from "@/components/ui/button";
import { formatFCFA } from "@/lib/utils/money";
import { cn } from "@/lib/utils/cn";
import { getPublicPlans } from "@/server/pg/services";

export const metadata: Metadata = { title: "Tarifs", description: "Une offre gratuite pour démarrer, des offres payantes pour les organisateurs et les associations." };

// Les offres sont réglables depuis l'administration : rendu à la demande.
export const dynamic = "force-dynamic";

export default async function PricingPage() {
  const plans = (await getPublicPlans());
  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-6xl px-4 py-12 sm:px-6 md:py-16">
        <h1 className="font-display text-4xl font-bold tracking-tight sm:text-5xl">Des tarifs simples, payés par l&apos;organisateur</h1>
        <p className="mt-4 max-w-2xl text-lg leading-relaxed text-muted-foreground">Les membres rejoignent gratuitement. Seul l&apos;organisateur choisit une offre, selon le nombre de tontines et de participants qu&apos;il anime.</p>

        <div className="mt-10 grid gap-5 lg:grid-cols-3">
          {plans.map((p) => (
            <section key={p.id} aria-labelledby={`plan-${p.id}`} className={cn("flex flex-col rounded-2xl border p-6 sm:p-7", p.highlighted ? "border-transparent bg-sidebar text-white shadow-xl lg:-my-3 lg:py-9" : "bg-card")}>
              <h2 id={`plan-${p.id}`} className="font-display text-2xl font-bold">
                {p.name}
              </h2>
              <p className={cn("mt-1 text-sm", p.highlighted ? "text-sidebar-foreground" : "text-muted-foreground")}>{p.tagline}</p>
              <p className="mt-5">
                <span className="font-display text-4xl font-bold tabular-nums">{p.monthlyPrice === 0 ? "0 FCFA" : formatFCFA(p.monthlyPrice)}</span>
                {p.monthlyPrice > 0 && <span className={cn("ml-1 text-sm", p.highlighted ? "text-sidebar-foreground" : "text-muted-foreground")}>par mois</span>}
              </p>
              <dl className={cn("mt-5 space-y-1.5 border-t pt-5 text-sm", p.highlighted ? "border-white/15" : "")}>
                <div className="flex justify-between gap-3">
                  <dt className={p.highlighted ? "text-sidebar-foreground" : "text-muted-foreground"}>Tontines</dt>
                  <dd className="font-medium tabular-nums">{p.limits.tontines}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className={p.highlighted ? "text-sidebar-foreground" : "text-muted-foreground"}>Membres par tontine</dt>
                  <dd className="font-medium tabular-nums">jusqu&apos;à {p.limits.membersPerTontine}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className={p.highlighted ? "text-sidebar-foreground" : "text-muted-foreground"}>Tickets par tontine</dt>
                  <dd className="font-medium tabular-nums">jusqu&apos;à {p.limits.ticketsPerTontine}</dd>
                </div>
              </dl>
              <ul className="mt-5 flex-1 space-y-2.5 text-sm">
                {p.features.filter((f) => !f.requires || p.limits[f.requires]).map((f) => (
                  <li key={f.label} className="flex gap-2.5">
                    <Check className={cn("mt-0.5 size-4 shrink-0", p.highlighted ? "text-[#f4c04e]" : "text-primary")} aria-hidden />
                    <span>
                      {f.label}
                      {f.soon && <span className={cn("ml-1.5 rounded-full px-2 py-0.5 text-xs", p.highlighted ? "bg-white/10" : "bg-muted text-muted-foreground")}>bientôt</span>}
                    </span>
                  </li>
                ))}
              </ul>
              <Button asChild size="lg" className={cn("mt-7", p.highlighted && "bg-[#f4c04e] text-[#0f2a1c] hover:bg-[#f7cf75]")} variant={p.highlighted ? "default" : "outline"}>
                <Link href={p.id === "ASSOCIATION" ? "/contact" : "/register"}>{p.cta}</Link>
              </Button>
            </section>
          ))}
        </div>
        <p className="mt-8 text-sm text-muted-foreground">
          Une question sur le choix d&apos;une offre ? <Link href="/contact" className="font-medium text-primary hover:underline">Écrivez-nous</Link> ou consultez les <Link href="/faq" className="font-medium text-primary hover:underline">questions fréquentes</Link>.
        </p>
      </main>
    </>
  );
}
