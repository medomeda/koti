"use client";

import { Lock } from "lucide-react";
import { useState } from "react";
import { updateTontineAction } from "@/actions/tontines";
import { useAction } from "@/components/shared/use-action";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/feedback";
import { Field } from "@/components/ui/field";
import { Input, NativeSelect, Textarea } from "@/components/ui/input";
import { FREQUENCY_LABEL, WEEKDAY_LABEL } from "@/lib/constants/labels";
import { FREQUENCIES, type Frequency, type Weekday } from "@/types/domain";

interface Values {
  name: string;
  description: string;
  contributionAmount: number;
  frequency: Frequency;
  weekday1: Weekday;
  weekday2: Weekday;
  startDate: string;
  expectedMemberCount: number;
}

export function TontineSettingsForm({ tontineId, initial, financialEditable, readOnly }: { tontineId: string; initial: Values; financialEditable: boolean; readOnly: boolean }) {
  const [v, setV] = useState(initial);
  const save = useAction(updateTontineAction, { success: "Modifications enregistrées." });
  const set = <K extends keyof Values>(k: K, value: Values[K]) => setV((prev) => ({ ...prev, [k]: value }));
  const fe = save.fieldErrors;
  const err = (k: string) => fe[k] ?? fe[`financial.${k}`];

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    void save.run({
      tontineId,
      name: v.name,
      description: v.description,
      financial: financialEditable ? { ...v, rotationMode: "MANUAL" } : undefined,
    });
  };

  const dirty = JSON.stringify(v) !== JSON.stringify(initial);

  return (
    <form onSubmit={submit} noValidate className="space-y-5">
      <fieldset disabled={readOnly} className="space-y-4">
        <Field label="Nom" required error={err("name")}>
          {(p) => <Input {...p} value={v.name} onChange={(e) => set("name", e.target.value)} maxLength={60} />}
        </Field>
        <Field label="Description" error={err("description")}>
          {(p) => <Textarea {...p} rows={3} value={v.description} onChange={(e) => set("description", e.target.value)} maxLength={500} />}
        </Field>
      </fieldset>

      <fieldset disabled={!financialEditable || readOnly} className="space-y-4 rounded-xl border p-4">
        <legend className="flex items-center gap-1.5 px-1 text-sm font-semibold">
          {!financialEditable && <Lock className="size-3.5" aria-hidden />} Paramètres financiers
        </legend>
        {!financialEditable && <Alert tone="neutral">Verrouillés depuis le démarrage : les échéances et paiements déjà générés ne sont jamais modifiés.</Alert>}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Montant (FCFA)" required error={err("contributionAmount")}>
            {(p) => <Input {...p} type="number" inputMode="numeric" value={v.contributionAmount} onChange={(e) => set("contributionAmount", Number(e.target.value))} />}
          </Field>
          <Field label="Fréquence" required error={err("frequency")}>
            {(p) => (
              <NativeSelect {...p} value={v.frequency} onChange={(e) => set("frequency", e.target.value as Frequency)}>
                {FREQUENCIES.map((f) => (
                  <option key={f} value={f}>
                    {FREQUENCY_LABEL[f]}
                  </option>
                ))}
              </NativeSelect>
            )}
          </Field>
          {v.frequency === "TWICE_WEEKLY" &&
            (["weekday1", "weekday2"] as const).map((k, i) => (
              <Field key={k} label={i === 0 ? "Premier jour" : "Second jour"} required error={err(k)}>
                {(p) => (
                  <NativeSelect {...p} value={v[k]} onChange={(e) => set(k, Number(e.target.value) as Weekday)}>
                    {([1, 2, 3, 4, 5, 6, 0] as Weekday[]).map((d) => (
                      <option key={d} value={d}>
                        {WEEKDAY_LABEL[d]}
                      </option>
                    ))}
                  </NativeSelect>
                )}
              </Field>
            ))}
          <Field label="Date de démarrage" required error={err("startDate")}>
            {(p) => <Input {...p} type="date" value={v.startDate} onChange={(e) => set("startDate", e.target.value)} />}
          </Field>
          <Field label="Nombre de membres prévu" required error={err("expectedMemberCount")}>
            {(p) => <Input {...p} type="number" inputMode="numeric" value={v.expectedMemberCount} onChange={(e) => set("expectedMemberCount", Number(e.target.value))} />}
          </Field>
        </div>
      </fieldset>

      {!readOnly && (
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setV(initial)} disabled={!dirty || save.pending}>
            Annuler
          </Button>
          <Button type="submit" loading={save.pending} disabled={!dirty}>
            Enregistrer
          </Button>
        </div>
      )}
    </form>
  );
}
