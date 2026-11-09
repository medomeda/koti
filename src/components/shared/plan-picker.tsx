"use client";

import { Check } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import { useState } from "react";
import { changePlanAction } from "@/actions/billing";
import { Button } from "@/components/ui/button";
import { formatFCFA } from "@/lib/utils/money";
import { cn } from "@/lib/utils/cn";
import type { Plan } from "@/lib/marketing/plans";
import type { PlanId } from "@/types/domain";
import { ConfirmDialog } from "./confirm-dialog";

/**
 * Choix de l'offre. Le bouton d'une offre impossible à prendre (usage trop important)
 * est désactivé et la raison affichée ; le serveur revérifie de toute façon.
 */
export function PlanPicker({ plans, currentId, blockers, selfService }: { plans: Plan[]; currentId: PlanId; blockers: Record<PlanId, string[]>; selfService: Record<PlanId, boolean> }) {
  const [target, setTarget] = useState<Plan | null>(null);
  const current = plans.find((p) => p.id === currentId)!;

  const describe = (p: Plan) => {
    if (p.monthlyPrice === 0) return "Retour à l'offre gratuite : effectif immédiatement. Les factures déjà émises restent disponibles.";
    if (p.monthlyPrice > current.monthlyPrice) return `Passage immédiat à ${formatFCFA(p.monthlyPrice)} par mois, facturé tout de suite, sans prorata.`;
    return `Le nouveau prix de ${formatFCFA(p.monthlyPrice)} par mois s'appliquera à la prochaine période.`;
  };

  return (
    <>
      <div className="grid gap-4 lg:grid-cols-3">
        {plans.map((p) => {
          const isCurrent = p.id === currentId;
          const blocked = blockers[p.id] ?? [];
          return (
            <div key={p.id} className={cn("flex flex-col rounded-xl border bg-card p-5", isCurrent && "border-primary ring-1 ring-primary/40")}>
              <div className="flex items-start justify-between gap-2">
                <h3 className="font-semibold">{p.name}</h3>
                {isCurrent && <span className="rounded-full bg-primary-soft px-2 py-0.5 text-xs font-medium text-primary-soft-foreground">Offre actuelle</span>}
              </div>
              <p className="mt-1 text-2xl font-semibold tabular-nums">
                {p.monthlyPrice === 0 ? "0 FCFA" : formatFCFA(p.monthlyPrice)}
                {p.monthlyPrice > 0 && <span className="ml-1 text-sm font-normal text-muted-foreground">par mois</span>}
              </p>
              <ul className="mt-3 flex-1 space-y-1.5 text-sm text-muted-foreground">
                <li className="flex gap-2">
                  <Check className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
                  {p.limits.tontines} tontine{p.limits.tontines > 1 ? "s" : ""} en cours
                </li>
                <li className="flex gap-2">
                  <Check className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
                  Jusqu&apos;à {p.limits.membersPerTontine} membres par tontine
                </li>
                <li className="flex gap-2">
                  <Check className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
                  Jusqu&apos;à {p.limits.ticketsPerTontine} tickets par tontine
                </li>
                <li className="flex gap-2">
                  <Check className={cn("mt-0.5 size-4 shrink-0", p.limits.multipleTickets ? "text-primary" : "text-muted-foreground/40")} aria-hidden />
                  <span className={cn(!p.limits.multipleTickets && "line-through opacity-70")}>Tickets multiples</span>
                </li>
              </ul>
              {!isCurrent && blocked.length > 0 && <p className="mt-3 text-xs text-warning-soft-foreground">Impossible pour l&apos;instant : {blocked.join(" ; ")}.</p>}
              {!isCurrent && !selfService[p.id] ? (
                <Button asChild className="mt-4" variant="outline">
                  <Link href="/contact">Demander l&apos;activation</Link>
                </Button>
              ) : (
              <Button className="mt-4" variant={isCurrent ? "ghost" : "outline"} disabled={isCurrent || blocked.length > 0} onClick={() => setTarget(p)}>
                {isCurrent ? "Offre en cours" : p.monthlyPrice === 0 ? "Revenir au gratuit" : p.monthlyPrice > current.monthlyPrice ? "Choisir cette offre" : "Passer à cette offre"}
              </Button>
              )}
            </div>
          );
        })}
      </div>
      <ConfirmDialog
        open={target !== null}
        onOpenChange={(o) => !o && setTarget(null)}
        title={target ? `Passer à l'offre « ${target.name} » ?` : ""}
        description={target ? describe(target) : undefined}
        confirmLabel="Confirmer le changement"
        onConfirm={async () => {
          if (!target) return null;
          const res = await changePlanAction({ planId: target.id });
          if (!res.ok) return res.error;
          toast.success(`Offre « ${target.name} » activée.`);
          return null;
        }}
      />
    </>
  );
}
