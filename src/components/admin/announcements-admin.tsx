"use client";

import { Eye, EyeOff, Megaphone } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { createAnnouncementAction, setAnnouncementActiveAction } from "@/actions/admin";
import { ANNOUNCEMENT_TONES } from "@/lib/constants/admin-labels";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input, NativeSelect, Textarea } from "@/components/ui/input";
import type { AnnouncementTone } from "@/types/domain";
import { FormDialog } from "./client-actions";


export function NewAnnouncementButton() {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [tone, setTone] = useState<AnnouncementTone>("info");
  const [endDate, setEndDate] = useState("");
  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Megaphone /> Nouvelle annonce
      </Button>
      <FormDialog
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (!o) {
            setTitle("");
            setMessage("");
            setTone("info");
            setEndDate("");
          }
        }}
        title="Nouvelle annonce"
        description="L'annonce s'affiche en bandeau à tous les clients connectés, dès la publication. Trois annonces au plus peuvent être visibles en même temps."
        submitLabel="Publier"
        onSubmit={() => createAnnouncementAction({ title, message, tone, endDate }).then((r) => { if (r.ok) toast.success("Annonce publiée."); return r; })}
      >
        <Field label="Titre" required>
          {(p) => <Input {...p} maxLength={80} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ex. Maintenance programmée" />}
        </Field>
        <Field label="Message" hint={`${message.length}/300`} required>
          {(p) => <Textarea {...p} rows={3} maxLength={300} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Ex. KOTI sera indisponible dimanche de 2 h à 4 h." />}
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Type">
            {(p) => (
              <NativeSelect {...p} value={tone} onChange={(e) => setTone(e.target.value as AnnouncementTone)}>
                {(Object.keys(ANNOUNCEMENT_TONES) as AnnouncementTone[]).map((t) => (
                  <option key={t} value={t}>{ANNOUNCEMENT_TONES[t]}</option>
                ))}
              </NativeSelect>
            )}
          </Field>
          <Field label="Afficher jusqu'au" hint="Vide : jusqu'au retrait manuel.">
            {(p) => <Input {...p} type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />}
          </Field>
        </div>
      </FormDialog>
    </>
  );
}

export function AnnouncementToggle({ id, active }: { id: string; active: boolean }) {
  const [busy, setBusy] = useState(false);
  return (
    <Button
      variant="outline"
      size="sm"
      loading={busy}
      onClick={async () => {
        setBusy(true);
        const r = await setAnnouncementActiveAction({ id, active: !active });
        setBusy(false);
        if (r.ok) toast.success(active ? "Annonce retirée." : "Annonce republiée.");
        else toast.error(r.error);
      }}
    >
      {active ? <EyeOff /> : <Eye />} {active ? "Retirer" : "Republier"}
    </Button>
  );
}
