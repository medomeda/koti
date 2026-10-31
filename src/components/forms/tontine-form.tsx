"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { CalendarDays } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import { createTontineAction } from "@/actions/tontines";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FormError } from "@/components/ui/field";
import { Input, NativeSelect, Textarea } from "@/components/ui/input";
import { FREQUENCY_LABEL, FREQUENCY_UNIT, WEEKDAY_LABEL } from "@/lib/constants/labels";
import { addDays, formatDate, isISODate, todayISO } from "@/lib/utils/dates";
import { formatFCFA } from "@/lib/utils/money";
import { tontineFormSchema, type TontineFormInput, type TontineFormValues } from "@/lib/validations";
import { scheduleDates } from "@/modules/contributions/frequency";
import { FREQUENCIES, type Weekday } from "@/types/domain";

const WEEKDAYS = [1, 2, 3, 4, 5, 6, 0] as Weekday[];

export function TontineForm() {
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);
  const { register, handleSubmit, control, formState, setError } = useForm<TontineFormInput, unknown, TontineFormValues>({
    resolver: zodResolver(tontineFormSchema),
    defaultValues: {
      name: "",
      description: "",
      contributionAmount: 10000,
      frequency: "WEEKLY",
      weekday1: 2,
      weekday2: 5,
      startDate: addDays(todayISO(), 7),
      expectedMemberCount: 10,
      rotationMode: "MANUAL",
    },
  });
  const e = formState.errors;
  const watched = useWatch({ control });
  const v = { ...watched, frequency: watched.frequency ?? "WEEKLY" };
  const amount = Number(v.contributionAmount);
  const count = Number(v.expectedMemberCount);

  const preview = useMemo(() => {
    if (!isISODate(String(v.startDate)) || !Number.isInteger(count) || count < 2) return null;
    try {
      const config = v.frequency === "TWICE_WEEKLY" ? { weekdays: [Number(v.weekday1), Number(v.weekday2)] as [Weekday, Weekday] } : {};
      const dates = scheduleDates(v.frequency, String(v.startDate), Math.min(count, 100), config);
      return { first: dates.slice(0, 3), last: dates[dates.length - 1]! };
    } catch {
      return null;
    }
  }, [v.startDate, v.frequency, v.weekday1, v.weekday2, count]);

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    const res = await createTontineAction(values);
    if (!res.ok) {
      setFormError(res.error);
      for (const [k, msg] of Object.entries(res.fieldErrors ?? {})) setError(k as keyof TontineFormInput, { message: msg });
      return;
    }
    toast.success("Tontine créée. Invitez maintenant vos membres.");
    router.push(`/tontines/${res.data.id}/members`);
  });

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start">
      <div className="space-y-5">
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Informations</CardTitle>
              <CardDescription>Modifiables à tout moment.</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <Field label="Nom de la tontine" required error={e.name?.message}>
              {(p) => <Input {...p} {...register("name")} placeholder="Ex. Tontine Famille" maxLength={60} />}
            </Field>
            <Field label="Description" error={e.description?.message} hint="Règles de la tontine, lieu de remise, etc.">
              {(p) => <Textarea {...p} {...register("description")} rows={3} maxLength={500} />}
            </Field>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div>
              <CardTitle>Cotisation et calendrier</CardTitle>
              <CardDescription>Ces paramètres seront verrouillés au démarrage de la tontine.</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Montant de cotisation (FCFA)" required error={e.contributionAmount?.message} hint="Par membre et par échéance.">
                {(p) => <Input {...p} {...register("contributionAmount")} type="number" inputMode="numeric" min={500} step={500} />}
              </Field>
              <Field label="Fréquence" required error={e.frequency?.message}>
                {(p) => (
                  <NativeSelect {...p} {...register("frequency")}>
                    {FREQUENCIES.map((f) => (
                      <option key={f} value={f}>
                        {FREQUENCY_LABEL[f]}
                      </option>
                    ))}
                  </NativeSelect>
                )}
              </Field>
            </div>
            {v.frequency === "TWICE_WEEKLY" && (
              <fieldset className="grid gap-4 rounded-lg border border-dashed p-3 sm:grid-cols-2">
                <legend className="px-1 text-xs font-medium text-muted-foreground">Deux jours distincts</legend>
                <Field label="Premier jour" required error={e.weekday1?.message}>
                  {(p) => (
                    <NativeSelect {...p} {...register("weekday1")}>
                      {WEEKDAYS.map((d) => (
                        <option key={d} value={d}>
                          {WEEKDAY_LABEL[d]}
                        </option>
                      ))}
                    </NativeSelect>
                  )}
                </Field>
                <Field label="Second jour" required error={e.weekday2?.message}>
                  {(p) => (
                    <NativeSelect {...p} {...register("weekday2")}>
                      {WEEKDAYS.map((d) => (
                        <option key={d} value={d}>
                          {WEEKDAY_LABEL[d]}
                        </option>
                      ))}
                    </NativeSelect>
                  )}
                </Field>
              </fieldset>
            )}
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Date de démarrage" required error={e.startDate?.message} hint="Date de la première échéance.">
                {(p) => <Input {...p} {...register("startDate")} type="date" />}
              </Field>
              <Field label="Nombre de membres prévu" required error={e.expectedMemberCount?.message} hint="Détermine la durée du cycle (1 tour par membre).">
                {(p) => <Input {...p} {...register("expectedMemberCount")} type="number" inputMode="numeric" min={2} max={100} />}
              </Field>
            </div>
            <Field label="Mode de définition des tours" required hint="Le tirage au sort automatique arrivera dans une prochaine version.">
              {(p) => (
                <NativeSelect {...p} {...register("rotationMode")}>
                  <option value="MANUAL">Ordre défini par l&apos;administrateur</option>
                </NativeSelect>
              )}
            </Field>
          </CardContent>
        </Card>
      </div>

      <aside className="space-y-4 lg:sticky lg:top-20">
        <Card>
          <CardHeader>
            <CardTitle>Récapitulatif</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex justify-between gap-2">
              <span className="text-muted-foreground">Cotisation</span>
              <span className="font-medium tabular-nums">{Number.isFinite(amount) && amount > 0 ? `${formatFCFA(amount)} / ${FREQUENCY_UNIT[v.frequency]}` : "—"}</span>
            </div>
            <div className="flex justify-between gap-2">
              <span className="text-muted-foreground">Cagnotte par tour</span>
              <span className="font-semibold tabular-nums text-primary">{Number.isFinite(amount * count) && amount * count > 0 ? formatFCFA(amount * count) : "—"}</span>
            </div>
            <div className="flex justify-between gap-2">
              <span className="text-muted-foreground">Durée du cycle</span>
              <span className="font-medium">{Number.isInteger(count) && count >= 2 ? `${count} échéances` : "—"}</span>
            </div>
            {preview && (
              <div className="rounded-lg bg-muted/60 p-3">
                <p className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                  <CalendarDays className="size-3.5" aria-hidden /> Premières échéances
                </p>
                <ul className="space-y-0.5">
                  {preview.first.map((d, i) => (
                    <li key={d}>
                      n°{i + 1} · {formatDate(d)}
                    </li>
                  ))}
                </ul>
                <p className="mt-1.5 text-xs text-muted-foreground">Dernière échéance : {formatDate(preview.last)}</p>
              </div>
            )}
          </CardContent>
        </Card>
        <p className="px-1 text-xs text-muted-foreground">Vous serez automatiquement administrateur et membre de cette tontine : vous cotisez comme les autres participants.</p>
        <FormError message={formError} />
        <div className="flex flex-col gap-2">
          <Button type="submit" size="lg" loading={formState.isSubmitting}>
            Créer la tontine
          </Button>
          <Button variant="ghost" onClick={() => router.back()}>
            Annuler
          </Button>
        </div>
      </aside>
    </form>
  );
}
