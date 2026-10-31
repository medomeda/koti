"use client";

import { Check, History, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { obligationHistoryAction, rejectPaymentAction, validatePaymentAction } from "@/actions/payments";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogHeader } from "@/components/ui/dialog";
import { Alert, EmptyState, Skeleton } from "@/components/ui/feedback";
import { PAYMENT_METHOD_LABEL } from "@/lib/constants/labels";
import { formatDate, formatDateTime } from "@/lib/utils/dates";
import { formatFCFA } from "@/lib/utils/money";
import type { PaymentView } from "@/modules/payments/payment.service";
import { ConfirmDialog } from "./confirm-dialog";
import { PaymentStatusBadge } from "./status";
import { useAction } from "./use-action";

export function ReviewActions({ paymentId, memberName, amount, expectedAmount, method, reference, paymentDate }: { paymentId: string; memberName: string; amount: number; expectedAmount: number; method: string; reference: string; paymentDate: string }) {
  const [rejecting, setRejecting] = useState(false);
  const [validating, setValidating] = useState(false);
  const differs = amount !== expectedAmount;
  const summary = (
    <div className="rounded-lg bg-muted/60 p-3 text-sm">
      <p>
        <span className="text-muted-foreground">Membre :</span> <strong>{memberName}</strong>
      </p>
      <p>
        <span className="text-muted-foreground">Montant :</span> <strong className="tabular-nums">{formatFCFA(amount)}</strong>
      </p>
      <p>
        <span className="text-muted-foreground">Payé le :</span> {formatDate(paymentDate)} · {method}
        {reference && <> · réf. {reference}</>}
      </p>
    </div>
  );
  return (
    <div className="flex gap-1.5">
      <Button size="sm" variant="outline" onClick={() => setRejecting(true)} aria-label={`Refuser le paiement de ${memberName}`}>
        <X /> <span className="hidden sm:inline">Refuser</span>
      </Button>
      <Button size="sm" onClick={() => setValidating(true)} aria-label={`Valider le paiement de ${memberName}`}>
        <Check /> <span className="hidden sm:inline">Valider</span>
      </Button>
      <ConfirmDialog
        open={validating}
        onOpenChange={setValidating}
        title="Valider ce paiement ?"
        description="Confirmez uniquement si vous avez bien reçu les fonds. Le membre sera notifié."
        confirmLabel="Valider le paiement"
        onConfirm={async () => {
          const res = await validatePaymentAction({ paymentId });
          if (!res.ok) return res.error;
          toast.success(`Paiement de ${memberName} validé.`);
          return null;
        }}
      >
        {summary}
        {differs && <Alert tone="warning">Montant différent du montant attendu ({formatFCFA(expectedAmount)}).</Alert>}
      </ConfirmDialog>
      <ConfirmDialog
        open={rejecting}
        onOpenChange={setRejecting}
        title="Refuser ce paiement ?"
        description="Le membre sera notifié avec votre motif et pourra effectuer une nouvelle déclaration. La déclaration refusée reste dans l'historique."
        confirmLabel="Refuser"
        destructive
        reason={{ label: "Motif du refus", required: true, placeholder: "Ex. montant non reçu sur le compte Mobile Money" }}
        onConfirm={async (reason) => {
          const res = await rejectPaymentAction({ paymentId, reason });
          if (!res.ok) return res.error;
          toast.success("Paiement refusé.");
          return null;
        }}
      >
        {summary}
      </ConfirmDialog>
    </div>
  );
}

export function HistoryButton({ obligationId, label }: { obligationId: string; label: string }) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<PaymentView[] | null>(null);
  const load = useAction(obligationHistoryAction, { onSuccess: setItems, refresh: false });
  const onOpen = (v: boolean) => {
    setOpen(v);
    if (v) {
      setItems(null);
      void load.run({ obligationId });
    }
  };
  return (
    <>
      <Button variant="ghost" size="icon-sm" onClick={() => onOpen(true)} aria-label={`Historique — ${label}`}>
        <History />
      </Button>
      <Dialog open={open} onOpenChange={onOpen}>
        <DialogContent>
          <DialogHeader title="Historique des déclarations" description={label} />
          <DialogBody>
            {load.error ? (
              <Alert tone="danger">{load.error}</Alert>
            ) : !items ? (
              <div className="space-y-3">
                <Skeleton className="h-16" />
                <Skeleton className="h-16" />
              </div>
            ) : items.length === 0 ? (
              <EmptyState icon={<History />} title="Aucune déclaration" description="Aucun paiement n'a encore été déclaré pour cette échéance." className="py-6" />
            ) : (
              <ol className="relative space-y-4 border-l pl-5">
                {items.map((p) => (
                  <li key={p.id} className="relative">
                    <span aria-hidden className="absolute -left-[26px] top-1.5 size-2.5 rounded-full bg-border ring-4 ring-card" />
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold tabular-nums">{formatFCFA(p.amount)}</span>
                      <PaymentStatusBadge status={p.status} />
                    </div>
                    <p className="mt-0.5 text-sm text-muted-foreground">
                      {PAYMENT_METHOD_LABEL[p.paymentMethod]} le {formatDate(p.paymentDate)}
                      {p.reference && <> · réf. {p.reference}</>}
                    </p>
                    <p className="text-xs text-muted-foreground">Déclaré {formatDateTime(p.declaredAt)}</p>
                    {p.comment && <p className="mt-1 text-sm">« {p.comment} »</p>}
                    {p.status === "PAID" && p.validatedAt && (
                      <p className="mt-1 text-xs text-primary-soft-foreground">
                        Validé par {p.validatedByName} · {formatDateTime(p.validatedAt)}
                      </p>
                    )}
                    {p.status === "REJECTED" && (
                      <p className="mt-1 text-xs text-destructive-soft-foreground">
                        Refusé par {p.validatedByName} : {p.rejectionReason}
                      </p>
                    )}
                  </li>
                ))}
              </ol>
            )}
          </DialogBody>
        </DialogContent>
      </Dialog>
    </>
  );
}
