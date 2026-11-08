"use client";

import { Gift, MessageSquarePlus, Repeat, UserCheck, UserX } from "lucide-react";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";
import type { ActionResult } from "@/actions/_shared";
import { addClientNoteAction, changeClientPlanAction, grantTrialAction, reactivateUserAction, suspendUserAction } from "@/actions/admin";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader } from "@/components/ui/dialog";
import { Field, FormError } from "@/components/ui/field";
import { NativeSelect, Textarea } from "@/components/ui/input";
import type { Plan } from "@/lib/marketing/plans";
import type { PlanId } from "@/types/domain";

/** Boîte de dialogue de formulaire : appelle l'action, affiche l'erreur du serveur, se ferme au succès. */
export function FormDialog({ open, onOpenChange, title, description, submitLabel, onSubmit, children }: { open: boolean; onOpenChange: (o: boolean) => void; title: string; description?: string; submitLabel: string; onSubmit: () => Promise<ActionResult<unknown>>; children: ReactNode }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) setError(null); onOpenChange(o); }}>
      <DialogContent>
        <DialogHeader title={title} description={description} />
        <form
          className="contents"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError(null);
            const res = await onSubmit();
            setBusy(false);
            if (!res.ok) return setError(res.fieldErrors ? Object.values(res.fieldErrors)[0] ?? res.error : res.error);
            onOpenChange(false);
          }}
        >
          <DialogBody>
            {children}
            <FormError message={error} />
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Annuler
            </Button>
            <Button type="submit" loading={busy}>
              {submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function ClientActions({
  userId,
  name,
  suspended,
  currentPlan,
  plans,
  can,
}: {
  userId: string;
  name: string;
  suspended: boolean;
  currentPlan: PlanId;
  plans: Plan[];
  can: { suspend: boolean; plan: boolean; trial: boolean; note: boolean };
}) {
  const [dialog, setDialog] = useState<"plan" | "trial" | "note" | "suspend" | null>(null);
  const [planId, setPlanId] = useState<PlanId>(plans.find((p) => p.id !== currentPlan)!.id);
  const [trialPlan, setTrialPlan] = useState<PlanId>("PRO");
  const [days, setDays] = useState("14");
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const close = (o: boolean) => {
    if (!o) {
      setDialog(null);
      setReason("");
      setNote("");
    }
  };
  const paid = plans.filter((p) => p.monthlyPrice > 0);

  return (
    <>
      <div className="flex flex-wrap gap-2">
        {can.plan && (
          <Button variant="outline" onClick={() => setDialog("plan")}>
            <Repeat /> Changer d&apos;offre
          </Button>
        )}
        {can.trial && (
          <Button variant="outline" onClick={() => setDialog("trial")}>
            <Gift /> Offrir un essai
          </Button>
        )}
        {can.note && (
          <Button variant="outline" onClick={() => setDialog("note")}>
            <MessageSquarePlus /> Ajouter une note
          </Button>
        )}
        {can.suspend && (
          <Button variant={suspended ? "default" : "outline"} className={suspended ? undefined : "text-destructive hover:text-destructive"} onClick={() => setDialog("suspend")}>
            {suspended ? <UserCheck /> : <UserX />} {suspended ? "Réactiver le compte" : "Suspendre le compte"}
          </Button>
        )}
      </div>

      <FormDialog open={dialog === "plan"} onOpenChange={close} title={`Changer l'offre de ${name}`} description="Le changement est immédiat. Il est refusé si l'usage actuel du client dépasse les limites de la nouvelle offre." submitLabel="Changer l'offre" onSubmit={() => changeClientPlanAction({ userId, planId, reason }).then((r) => { if (r.ok) toast.success("Offre modifiée."); return r; })}>
        <Field label="Nouvelle offre" required>
          {(p) => (
            <NativeSelect {...p} value={planId} onChange={(e) => setPlanId(e.target.value as PlanId)}>
              {plans.filter((x) => x.id !== currentPlan).map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name} ({x.monthlyPrice === 0 ? "gratuit" : `${x.monthlyPrice} FCFA par mois`})
                </option>
              ))}
            </NativeSelect>
          )}
        </Field>
        <Field label="Motif (journalisé)" required>
          {(p) => <Textarea {...p} rows={2} maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ex. demande du client par téléphone" />}
        </Field>
      </FormDialog>

      <FormDialog open={dialog === "trial"} onOpenChange={close} title={`Offrir un essai à ${name}`} description="L'essai est gratuit et sans facture. Il remplace l'offre actuelle pendant sa durée." submitLabel="Offrir l'essai" onSubmit={() => grantTrialAction({ userId, planId: trialPlan, days, reason }).then((r) => { if (r.ok) toast.success("Essai offert."); return r; })}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Offre essayée" required>
            {(p) => (
              <NativeSelect {...p} value={trialPlan} onChange={(e) => setTrialPlan(e.target.value as PlanId)}>
                {paid.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.name}
                  </option>
                ))}
              </NativeSelect>
            )}
          </Field>
          <Field label="Durée" required>
            {(p) => (
              <NativeSelect {...p} value={days} onChange={(e) => setDays(e.target.value)}>
                {["7", "14", "30", "60"].map((d) => (
                  <option key={d} value={d}>
                    {d} jours
                  </option>
                ))}
              </NativeSelect>
            )}
          </Field>
        </div>
        <Field label="Motif (journalisé)" required>
          {(p) => <Textarea {...p} rows={2} maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ex. geste commercial" />}
        </Field>
      </FormDialog>

      <FormDialog open={dialog === "note"} onOpenChange={close} title={`Note interne sur ${name}`} description="Visible uniquement par l'équipe KOTI, jamais par le client." submitLabel="Enregistrer la note" onSubmit={() => addClientNoteAction({ userId, text: note }).then((r) => { if (r.ok) toast.success("Note enregistrée."); return r; })}>
        <Field label="Note" required>
          {(p) => <Textarea {...p} rows={4} maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} autoFocus />}
        </Field>
      </FormDialog>

      <ConfirmDialog
        open={dialog === "suspend"}
        onOpenChange={close}
        title={suspended ? `Réactiver le compte de ${name} ?` : `Suspendre le compte de ${name} ?`}
        description={suspended ? "Le client pourra de nouveau se connecter." : "Le client est déconnecté immédiatement et ne peut plus se connecter. Ses tontines et son historique sont conservés."}
        confirmLabel={suspended ? "Réactiver" : "Suspendre"}
        destructive={!suspended}
        reason={{ label: "Motif (journalisé)", required: true, placeholder: suspended ? "Ex. vérification terminée" : "Ex. signalements de messages abusifs" }}
        onConfirm={async (why) => {
          const res = await (suspended ? reactivateUserAction : suspendUserAction)({ userId, reason: why });
          if (!res.ok) return res.fieldErrors?.reason ?? res.error;
          toast.success(suspended ? "Compte réactivé." : "Compte suspendu.");
          return null;
        }}
      />
    </>
  );
}
