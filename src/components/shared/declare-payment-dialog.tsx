"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import { declarePaymentAction } from "@/actions/payments";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader } from "@/components/ui/dialog";
import { Alert } from "@/components/ui/feedback";
import { Field, FormError } from "@/components/ui/field";
import { Input, NativeSelect, Textarea } from "@/components/ui/input";
import { PAYMENT_METHOD_LABEL } from "@/lib/constants/labels";
import { formatDate, todayISO } from "@/lib/utils/dates";
import { formatFCFA } from "@/lib/utils/money";
import { declarePaymentSchema, type DeclarePaymentInput } from "@/lib/validations";
import { PAYMENT_METHODS } from "@/types/domain";

export interface DeclareTarget {
  id: string;
  tontineName: string;
  expectedAmount: number;
  dueDate: string;
  periodNumber: number;
  rejectionReason?: string | null;
}

export function DeclarePaymentButton({ target, size = "sm", label = "Déclarer" }: { target: DeclareTarget; size?: "sm" | "default"; label?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button size={size} onClick={() => setOpen(true)}>
        {label}
      </Button>
      {open && <DeclarePaymentDialog target={target} open={open} onOpenChange={setOpen} />}
    </>
  );
}

function DeclarePaymentDialog({ target, open, onOpenChange }: { target: DeclareTarget; open: boolean; onOpenChange: (v: boolean) => void }) {
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);
  const today = todayISO();
  const { register, handleSubmit, formState, setError, control } = useForm<DeclarePaymentInput>({
    resolver: zodResolver(declarePaymentSchema),
    defaultValues: { obligationId: target.id, amount: target.expectedAmount, paymentDate: today, paymentMethod: "MOBILE_MONEY", reference: "", comment: "" },
  });
  const amount = Number(useWatch({ control, name: "amount" }));
  const e = formState.errors;

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    const res = await declarePaymentAction(values);
    if (!res.ok) {
      setFormError(res.error);
      for (const [k, v] of Object.entries(res.fieldErrors ?? {})) setError(k as keyof DeclarePaymentInput, { message: v });
      return;
    }
    toast.success("Paiement déclaré. L'administrateur va le vérifier.");
    onOpenChange(false);
    router.refresh();
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader title="Déclarer un paiement" description={`${target.tontineName} · échéance n°${target.periodNumber} du ${formatDate(target.dueDate)}`} />
        <form onSubmit={onSubmit} noValidate className="contents">
          <DialogBody>
            {target.rejectionReason && (
              <Alert tone="danger" title="Déclaration précédente refusée">
                {target.rejectionReason}
              </Alert>
            )}
            <div className="flex items-center justify-between rounded-lg bg-primary-soft px-4 py-3 text-primary-soft-foreground">
              <span className="text-sm">Montant attendu</span>
              <span className="text-lg font-semibold tabular-nums">{formatFCFA(target.expectedAmount)}</span>
            </div>
            <input type="hidden" {...register("obligationId")} />
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Montant versé (FCFA)" required error={e.amount?.message}>
                {(p) => <Input {...p} {...register("amount")} type="number" inputMode="numeric" min={1} step={1} />}
              </Field>
              <Field label="Date du paiement" required error={e.paymentDate?.message}>
                {(p) => <Input {...p} {...register("paymentDate")} type="date" max={today} />}
              </Field>
            </div>
            {Number.isFinite(amount) && amount > 0 && amount !== target.expectedAmount && (
              <Alert tone="warning">Le montant diffère du montant attendu ({formatFCFA(target.expectedAmount)}). L&apos;administrateur en sera informé lors de la validation.</Alert>
            )}
            <Field label="Mode de paiement" required error={e.paymentMethod?.message}>
              {(p) => (
                <NativeSelect {...p} {...register("paymentMethod")}>
                  {PAYMENT_METHODS.map((m) => (
                    <option key={m} value={m}>
                      {PAYMENT_METHOD_LABEL[m]}
                    </option>
                  ))}
                </NativeSelect>
              )}
            </Field>
            <Field label="Référence" hint="Facultatif — ex. identifiant de transaction Mobile Money." error={e.reference?.message}>
              {(p) => <Input {...p} {...register("reference")} maxLength={60} autoComplete="off" />}
            </Field>
            <Field label="Commentaire" error={e.comment?.message}>
              {(p) => <Textarea {...p} {...register("comment")} rows={2} maxLength={500} />}
            </Field>
            <p className="text-xs text-muted-foreground">Justificatif : l&apos;envoi de fichiers sera disponible avec le stockage sécurisé (phase backend).</p>
            <FormError message={formError} />
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={formState.isSubmitting}>
              Annuler
            </Button>
            <Button type="submit" loading={formState.isSubmitting}>
              Déclarer le paiement
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
