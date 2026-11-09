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
import { shrinkImage } from "@/lib/utils/image-client";
import { PAYMENT_METHODS, type PaymentProofMode } from "@/types/domain";
import { Paperclip, X } from "lucide-react";

export interface DeclareTarget {
  id: string;
  tontineName: string;
  expectedAmount: number;
  dueDate: string;
  periodNumber: number;
  /** Ticket concerné par la déclaration. */
  ticketLabel?: string;
  rejectionReason?: string | null;
  /** Options de la tontine : justificatif (aucun / facultatif / obligatoire) et transparence. */
  proofMode?: PaymentProofMode;
  sharing?: boolean;
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
  const [proof, setProof] = useState<File | null>(null);
  const [proofError, setProofError] = useState<string | null>(null);
  const proofMode = target.proofMode ?? "OPTIONAL";
  const today = todayISO();
  const { register, handleSubmit, formState, setError, control } = useForm<DeclarePaymentInput>({
    resolver: zodResolver(declarePaymentSchema),
    defaultValues: { obligationId: target.id, amount: target.expectedAmount, paymentDate: today, paymentMethod: "MOBILE_MONEY", reference: "", comment: "" },
  });
  const amount = Number(useWatch({ control, name: "amount" }));
  const e = formState.errors;

  /** Envoie la capture (réduite sur l'appareil, puis compressée par le serveur) et renvoie son identifiant. */
  async function uploadProof(file: File): Promise<string | null> {
    const body = new FormData();
    body.set("file", await shrinkImage(file));
    body.set("obligationId", target.id);
    try {
      const res = await fetch("/api/v1/proofs", { method: "POST", body });
      const json = (await res.json().catch(() => ({}))) as { id?: string; error?: string };
      if (!res.ok || !json.id) {
        setProofError(json.error ?? "L'envoi du justificatif a échoué. Réessayez.");
        return null;
      }
      return json.id;
    } catch {
      setProofError("Connexion impossible : le justificatif n'a pas été envoyé.");
      return null;
    }
  }

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    setProofError(null);
    if (proofMode === "REQUIRED" && !proof) {
      setProofError("L'administrateur exige un justificatif : joignez une capture d'écran ou une photo du reçu.");
      return;
    }
    let proofId: string | undefined;
    if (proof && proofMode !== "OFF") {
      const id = await uploadProof(proof);
      if (!id) return;
      proofId = id;
    }
    const res = await declarePaymentAction({ ...values, ...(proofId ? { proofId } : {}) });
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
        <DialogHeader title="Déclarer un paiement" description={`${target.tontineName} · ${target.ticketLabel ? `${target.ticketLabel} · ` : ""}échéance n°${target.periodNumber} du ${formatDate(target.dueDate)}`} />
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
            {proofMode !== "OFF" && (
              <Field label={proofMode === "REQUIRED" ? "Justificatif de paiement" : "Justificatif (facultatif)"} required={proofMode === "REQUIRED"} hint="Capture d'écran du paiement ou photo du reçu. L'image est réduite automatiquement." error={proofError ?? undefined}>
                {(p) =>
                  proof ? (
                    <div className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm">
                      <Paperclip className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                      <span className="min-w-0 flex-1 truncate">{proof.name}</span>
                      <span className="shrink-0 text-xs text-muted-foreground">{Math.max(1, Math.round(proof.size / 1024))} Ko</span>
                      <Button type="button" variant="ghost" size="icon-sm" onClick={() => setProof(null)} aria-label="Retirer le justificatif">
                        <X />
                      </Button>
                    </div>
                  ) : (
                    <Input
                      {...p}
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      onChange={(ev) => {
                        const f = ev.target.files?.[0] ?? null;
                        setProofError(f && f.size > 15 * 1024 * 1024 ? "Image trop lourde (15 Mo maximum)." : null);
                        setProof(f && f.size <= 15 * 1024 * 1024 ? f : null);
                      }}
                    />
                  )
                }
              </Field>
            )}
            {target.sharing && <p className="text-xs text-muted-foreground">Transparence activée : le statut et le montant de ce paiement seront visibles des autres membres. Votre justificatif et votre référence restent privés.</p>}
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
