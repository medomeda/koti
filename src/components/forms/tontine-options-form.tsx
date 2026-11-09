"use client";

import { useState } from "react";
import { updateTontineOptionsAction } from "@/actions/tontines";
import { useAction } from "@/components/shared/use-action";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/input";
import { PAYMENT_PROOF_MODE_LABEL } from "@/lib/constants/labels";
import { PAYMENT_PROOF_MODES, type PaymentProofMode } from "@/types/domain";

/**
 * Options que l'administrateur règle à tout moment (même tontine démarrée) :
 * - justificatif de paiement : aucun, facultatif ou obligatoire ;
 * - transparence : tous les membres voient l'état des paiements de tous.
 */
export function TontineOptionsForm({ tontineId, initial, readOnly }: { tontineId: string; initial: { paymentProofMode: PaymentProofMode; membersSeePayments: boolean }; readOnly: boolean }) {
  const [mode, setMode] = useState<PaymentProofMode>(initial.paymentProofMode);
  const [sharing, setSharing] = useState(initial.membersSeePayments);
  const save = useAction(updateTontineOptionsAction, { success: "Options enregistrées." });
  const dirty = mode !== initial.paymentProofMode || sharing !== initial.membersSeePayments;
  return (
    <form
      className="space-y-5"
      onSubmit={(e) => {
        e.preventDefault();
        void save.run({ tontineId, paymentProofMode: mode, membersSeePayments: sharing });
      }}
    >
      <div className="space-y-1.5">
        <label htmlFor="proof-mode" className="text-sm font-medium">
          Justificatif de paiement
        </label>
        <NativeSelect id="proof-mode" value={mode} onChange={(e) => setMode(e.target.value as PaymentProofMode)} disabled={readOnly}>
          {PAYMENT_PROOF_MODES.map((m) => (
            <option key={m} value={m}>
              {PAYMENT_PROOF_MODE_LABEL[m].label}
            </option>
          ))}
        </NativeSelect>
        <p className="text-sm text-muted-foreground">{PAYMENT_PROOF_MODE_LABEL[mode].help}</p>
      </div>

      <label className="flex items-start gap-3 text-sm">
        <input type="checkbox" className="mt-0.5 size-4 accent-[var(--primary)]" checked={sharing} onChange={(e) => setSharing(e.target.checked)} disabled={readOnly} />
        <span>
          <span className="font-medium">Transparence des paiements</span>
          <span className="block text-muted-foreground">
            Tous les membres voient qui a payé, qui est en retard, les montants et les dates. Les justificatifs, références et commentaires restent visibles du seul membre concerné et des administrateurs.
            {sharing !== initial.membersSeePayments && sharing && " Prévenez vos membres : leurs paiements deviendront visibles de tous dès l'enregistrement."}
          </span>
        </span>
      </label>

      {!readOnly && (
        <Button type="submit" loading={save.pending} disabled={!dirty}>
          Enregistrer les options
        </Button>
      )}
    </form>
  );
}
