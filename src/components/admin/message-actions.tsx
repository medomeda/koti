"use client";

import { CheckCheck, Undo2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { handleContactRequestAction, reopenContactRequestAction } from "@/actions/admin";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Textarea } from "@/components/ui/input";
import { FormDialog } from "./client-actions";

/** Traiter un message (avec la réponse apportée) ou le rouvrir. L'envoi réel d'un e-mail viendra avec la phase 2. */
export function MessageActions({ id, name, handled, canHandle }: { id: string; name: string; handled: boolean; canHandle: boolean }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  if (!canHandle) return null;
  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        {handled ? <Undo2 /> : <CheckCheck />} {handled ? "Rouvrir" : "Marquer comme traité"}
      </Button>
      <FormDialog
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (!o) setText("");
        }}
        title={handled ? `Rouvrir le message de ${name}` : `Traiter le message de ${name}`}
        description={handled ? "Le message repasse « à traiter » et la réponse enregistrée est effacée." : "Notez ce qui a été répondu ou fait. Rien n'est envoyé automatiquement en démonstration : répondez d'abord par e-mail ou téléphone."}
        submitLabel={handled ? "Rouvrir" : "Marquer comme traité"}
        onSubmit={() => (handled ? reopenContactRequestAction({ id, reason: text }) : handleContactRequestAction({ id, reply: text })).then((r) => { if (r.ok) toast.success(handled ? "Message rouvert." : "Message traité."); return r; })}
      >
        <Field label={handled ? "Motif (journalisé)" : "Réponse apportée (facultatif)"} required={handled}>
          {(p) => <Textarea {...p} rows={4} maxLength={handled ? 300 : 1000} value={text} onChange={(e) => setText(e.target.value)} placeholder={handled ? "Ex. le client a une nouvelle question" : "Ex. Rappelé le client, démonstration prévue jeudi à 10 h."} />}
        </Field>
      </FormDialog>
    </>
  );
}
