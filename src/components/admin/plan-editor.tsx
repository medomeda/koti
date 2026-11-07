"use client";

import { RotateCcw, SlidersHorizontal } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { previewPlanAction, resetPlanAction, updatePlanAction } from "@/actions/admin";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Alert } from "@/components/ui/feedback";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader } from "@/components/ui/dialog";
import { Field, FormError } from "@/components/ui/field";
import { Input, Textarea } from "@/components/ui/input";
import { formatFCFA } from "@/lib/utils/money";
import type { PlanId } from "@/types/domain";

export interface EditablePlan {
  id: PlanId;
  name: string;
  tagline: string;
  monthlyPrice: number;
  limits: { tontines: number; membersPerTontine: number; ticketsPerTontine: number; multipleTickets: boolean };
}

interface Impact {
  clients: number;
  overLimit: number;
  examples: Array<{ userId: string; name: string; problems: string[] }>;
  mrrBefore: number;
  mrrAfter: number;
  changed: boolean;
}

/**
 * Réglage d'une offre (SUPER_ADMIN). Un aperçu de l'impact est calculé par le serveur pendant la saisie ;
 * l'enregistrement exige un motif et est journalisé. Les contrôles de validité sont refaits côté serveur.
 */
export function PlanEditor({ plan, customized }: { plan: EditablePlan; customized: boolean }) {
  const [open, setOpen] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [v, setV] = useState({ name: plan.name, tagline: plan.tagline, monthlyPrice: String(plan.monthlyPrice), tontines: String(plan.limits.tontines), membersPerTontine: String(plan.limits.membersPerTontine), ticketsPerTontine: String(plan.limits.ticketsPerTontine), multipleTickets: plan.limits.multipleTickets });
  const [reason, setReason] = useState("");
  const [impact, setImpact] = useState<Impact | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof typeof v>(k: K, value: (typeof v)[K]) => setV((p) => ({ ...p, [k]: value }));

  const payload = () => ({
    planId: plan.id,
    name: v.name,
    tagline: v.tagline,
    monthlyPrice: v.monthlyPrice,
    limits: { tontines: v.tontines, membersPerTontine: v.membersPerTontine, ticketsPerTontine: v.ticketsPerTontine, multipleTickets: v.multipleTickets },
  });

  // Aperçu de l'impact (débattu) : rien n'est enregistré.
  useEffect(() => {
    if (!open) return;
    const timer = setTimeout(async () => {
      const res = await previewPlanAction(payload());
      if (res.ok) {
        setImpact(res.data);
        setFieldErrors({});
      } else {
        setImpact(null);
        setFieldErrors(res.fieldErrors ?? {});
      }
    }, 350);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, v]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await updatePlanAction({ ...payload(), reason });
    setBusy(false);
    if (!res.ok) {
      setFieldErrors(res.fieldErrors ?? {});
      return setError(res.error);
    }
    toast.success(`Offre « ${v.name} » mise à jour.`);
    setOpen(false);
    setReason("");
  };

  const err = (k: string) => fieldErrors[k] ?? fieldErrors[`limits.${k}`];

  return (
    <>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={() => setOpen(true)}>
          <SlidersHorizontal /> Modifier les réglages
        </Button>
        {customized && (
          <Button variant="ghost" onClick={() => setResetting(true)}>
            <RotateCcw /> Valeurs d&apos;origine
          </Button>
        )}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader title={`Réglages de l'offre « ${plan.name} »`} description="Les limites s'appliquent aux nouvelles créations (aucune tontine existante n'est bloquée). Le prix s'applique aux prochaines factures." />
          <form onSubmit={submit} className="contents" noValidate>
            <DialogBody>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Nom de l'offre" required error={err("name")}>
                  {(p) => <Input {...p} value={v.name} onChange={(e) => set("name", e.target.value)} maxLength={40} />}
                </Field>
                <Field label="Prix par mois (FCFA)" required error={err("monthlyPrice")}>
                  {(p) => <Input {...p} type="number" inputMode="numeric" min={0} step={500} value={v.monthlyPrice} onChange={(e) => set("monthlyPrice", e.target.value)} disabled={plan.id === "FREE"} />}
                </Field>
              </div>
              <Field label="Accroche" error={err("tagline")} hint="Phrase affichée sur la page des tarifs.">
                {(p) => <Input {...p} value={v.tagline} onChange={(e) => set("tagline", e.target.value)} maxLength={120} />}
              </Field>
              <div className="grid gap-4 sm:grid-cols-3">
                <Field label="Tontines en cours" required error={err("tontines")}>
                  {(p) => <Input {...p} type="number" inputMode="numeric" min={1} value={v.tontines} onChange={(e) => set("tontines", e.target.value)} />}
                </Field>
                <Field label="Membres par tontine" required error={err("membersPerTontine")}>
                  {(p) => <Input {...p} type="number" inputMode="numeric" min={2} value={v.membersPerTontine} onChange={(e) => set("membersPerTontine", e.target.value)} />}
                </Field>
                <Field label="Tickets par tontine" required error={err("ticketsPerTontine")}>
                  {(p) => <Input {...p} type="number" inputMode="numeric" min={1} value={v.ticketsPerTontine} onChange={(e) => set("ticketsPerTontine", e.target.value)} />}
                </Field>
              </div>
              <label className="flex items-start gap-3 text-sm">
                <input type="checkbox" className="mt-0.5 size-4 accent-[var(--primary)]" checked={v.multipleTickets} onChange={(e) => set("multipleTickets", e.target.checked)} />
                <span>
                  <span className="font-medium">Tickets multiples autorisés</span>
                  <span className="block text-muted-foreground">Un membre peut détenir plusieurs tickets dans la même tontine.</span>
                </span>
              </label>

              {impact && (
                <Alert tone={impact.overLimit > 0 ? "warning" : "neutral"} title="Impact de ces réglages">
                  <p>
                    {impact.clients} client{impact.clients > 1 ? "s" : ""} sur cette offre
                    {impact.changed ? (
                      impact.overLimit > 0 ? (
                        <>
                          , dont <strong>{impact.overLimit}</strong> au-dessus des nouvelles limites : leurs tontines continuent, mais ils ne pourront plus en créer ni les agrandir.
                        </>
                      ) : (
                        ", aucun au-dessus des nouvelles limites."
                      )
                    ) : (
                      ". Aucun changement."
                    )}
                  </p>
                  {impact.examples.length > 0 && (
                    <ul className="mt-1.5 list-disc space-y-0.5 pl-4 text-xs">
                      {impact.examples.map((x) => (
                        <li key={x.userId}>
                          {x.name} : {x.problems.join(" ; ")}
                        </li>
                      ))}
                    </ul>
                  )}
                  {impact.mrrBefore !== impact.mrrAfter && (
                    <p className="mt-1.5">
                      Revenu mensuel récurrent de l&apos;offre : {formatFCFA(impact.mrrBefore)} → <strong>{formatFCFA(impact.mrrAfter)}</strong>.
                    </p>
                  )}
                </Alert>
              )}

              <Field label="Motif (journalisé)" required>
                {(p) => <Textarea {...p} rows={2} maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ex. ajustement tarifaire après les retours des testeurs" />}
              </Field>
              <FormError message={error} />
            </DialogBody>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>
                Annuler
              </Button>
              <Button type="submit" loading={busy} disabled={!impact?.changed || reason.trim().length < 3}>
                Enregistrer
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={resetting}
        onOpenChange={setResetting}
        title={`Revenir aux valeurs d'origine de « ${plan.name} » ?`}
        description="Le nom, l'accroche, le prix et les limites reprennent leurs valeurs initiales. Les factures déjà émises ne changent pas."
        confirmLabel="Revenir aux valeurs d'origine"
        reason={{ label: "Motif (journalisé)", required: true }}
        onConfirm={async (why) => {
          const res = await resetPlanAction({ planId: plan.id, reason: why });
          if (!res.ok) return res.fieldErrors?.reason ?? res.error;
          toast.success("Valeurs d'origine rétablies.");
          return null;
        }}
      />
    </>
  );
}
