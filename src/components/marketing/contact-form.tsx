"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { MailCheck } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { submitContactAction } from "@/actions/contact";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/feedback";
import { Field, FormError } from "@/components/ui/field";
import { Input, NativeSelect, Textarea } from "@/components/ui/input";
import { contactSchema, type ContactInput } from "@/lib/validations";

const TOPICS: Array<[string, string]> = [
  ["QUESTION", "Une question sur KOTI"],
  ["DEMO", "Une démonstration pour mon groupe"],
  ["PARTNERSHIP", "Un partenariat"],
  ["SUPPORT", "Un problème avec mon compte"],
  ["OTHER", "Autre sujet"],
];

export function ContactForm() {
  const [sent, setSent] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const { register, handleSubmit, formState, setError } = useForm<ContactInput>({
    resolver: zodResolver(contactSchema),
    defaultValues: { name: "", email: "", phone: "", topic: "QUESTION", message: "", website: "" },
  });
  const e = formState.errors;

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    const res = await submitContactAction(values);
    if (!res.ok) {
      setFormError(res.error);
      for (const [k, v] of Object.entries(res.fieldErrors ?? {})) setError(k as keyof ContactInput, { message: v });
      return;
    }
    setSent(true);
  });

  if (sent) {
    return (
      <Alert tone="success" icon={<MailCheck />} title="Message envoyé">
        Merci, nous avons bien reçu votre message. Nous vous répondons par e-mail.
      </Alert>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Votre nom" required error={e.name?.message}>
          {(p) => <Input {...p} {...register("name")} autoComplete="name" />}
        </Field>
        <Field label="Adresse e-mail" required error={e.email?.message}>
          {(p) => <Input {...p} {...register("email")} type="email" inputMode="email" autoComplete="email" />}
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Téléphone" error={e.phone?.message} hint="Facultatif, pour être rappelé.">
          {(p) => <Input {...p} {...register("phone")} type="tel" inputMode="tel" autoComplete="tel" placeholder="+225 07 00 00 00 00" />}
        </Field>
        <Field label="Sujet" required error={e.topic?.message}>
          {(p) => (
            <NativeSelect {...p} {...register("topic")}>
              {TOPICS.map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </NativeSelect>
          )}
        </Field>
      </div>
      <Field label="Votre message" required error={e.message?.message}>
        {(p) => <Textarea {...p} {...register("message")} rows={6} maxLength={2000} />}
      </Field>
      {/* Piège à robots : invisible et hors de la navigation clavier. */}
      <div aria-hidden className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
        <label>
          Ne pas remplir
          <input type="text" tabIndex={-1} autoComplete="off" {...register("website")} />
        </label>
      </div>
      <FormError message={formError} />
      <Button type="submit" size="lg" loading={formState.isSubmitting}>
        Envoyer le message
      </Button>
    </form>
  );
}
