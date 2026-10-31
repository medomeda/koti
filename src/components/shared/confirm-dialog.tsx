"use client";

import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader } from "@/components/ui/dialog";
import { Field, FormError } from "@/components/ui/field";
import { Textarea } from "@/components/ui/input";

/**
 * Confirmation d'une action sensible, avec motif facultatif ou obligatoire.
 * `onConfirm` renvoie un message d'erreur (affiché dans la boîte) ou null en cas de succès.
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = "Confirmer",
  destructive,
  reason,
  onConfirm,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: ReactNode;
  confirmLabel?: string;
  destructive?: boolean;
  reason?: { label: string; required: boolean; placeholder?: string };
  onConfirm: (reason: string) => Promise<string | null>;
  children?: ReactNode;
}) {
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const close = (v: boolean) => {
    if (!v) {
      setText("");
      setError(null);
    }
    onOpenChange(v);
  };

  const submit = async () => {
    if (reason?.required && text.trim().length < 3) {
      setError("Un motif d'au moins 3 caractères est requis.");
      return;
    }
    setBusy(true);
    const err = await onConfirm(text.trim());
    setBusy(false);
    if (err) setError(err);
    else close(false);
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent size="sm">
        <DialogHeader title={title} description={description} />
        <DialogBody>
          {children}
          {reason && (
            <Field label={reason.label} required={reason.required}>
              {(p) => <Textarea {...p} rows={3} maxLength={300} value={text} onChange={(e) => setText(e.target.value)} placeholder={reason.placeholder} />}
            </Field>
          )}
          <FormError message={error} />
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => close(false)} disabled={busy}>
            Annuler
          </Button>
          <Button variant={destructive ? "destructive" : "default"} onClick={submit} loading={busy}>
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
