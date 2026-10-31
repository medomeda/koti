"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Eye, EyeOff, MailCheck } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { useForm, type FieldValues, type Path, type UseFormSetError } from "react-hook-form";
import type { z } from "zod";
import { forgotPasswordAction, loginAction, registerAction } from "@/actions/auth";
import type { ActionResult } from "@/actions/_shared";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/feedback";
import { Field, FormError } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { forgotPasswordSchema, loginSchema, registerSchema } from "@/lib/validations";

function isRedirect(err: unknown) {
  return !!err && typeof err === "object" && "digest" in err && String((err as { digest: unknown }).digest).startsWith("NEXT_REDIRECT");
}

/** Appelle l'action ; reporte les erreurs de champ du serveur dans le formulaire. */
async function submitTo<T extends FieldValues>(action: () => Promise<ActionResult>, setError: UseFormSetError<T>, setFormError: (m: string | null) => void) {
  setFormError(null);
  try {
    const res = await action();
    if (!res.ok) {
      setFormError(res.error);
      for (const [k, v] of Object.entries(res.fieldErrors ?? {})) setError(k as Path<T>, { message: v });
    }
    return res;
  } catch (err) {
    if (isRedirect(err)) throw err;
    setFormError("Connexion au serveur impossible. Réessayez.");
    return null;
  }
}

function PasswordInput(props: React.ComponentProps<typeof Input>) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative">
      <Input {...props} type={visible ? "text" : "password"} className="pr-11" />
      <button type="button" onClick={() => setVisible((v) => !v)} className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-muted-foreground hover:text-foreground" aria-label={visible ? "Masquer le mot de passe" : "Afficher le mot de passe"}>
        {visible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
      </button>
    </div>
  );
}

type DemoAccount = { email: string; fullName: string; hint: string };

export function LoginForm({ next, demo }: { next?: string; demo?: { password: string; accounts: DemoAccount[] } }) {
  const [formError, setFormError] = useState<string | null>(null);
  const form = useForm<z.input<typeof loginSchema>>({ resolver: zodResolver(loginSchema), defaultValues: { email: "", password: "" } });
  const { register, handleSubmit, formState, setError, setValue } = form;
  const onSubmit = handleSubmit((v) => submitTo(() => loginAction(v, next), setError, setFormError));

  return (
    <div className="space-y-6">
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <Field label="Adresse e-mail" error={formState.errors.email?.message}>
          {(p) => <Input {...p} {...register("email")} type="email" autoComplete="email" inputMode="email" placeholder="vous@exemple.ci" />}
        </Field>
        <Field label="Mot de passe" error={formState.errors.password?.message}>
          {(p) => <PasswordInput {...p} {...register("password")} autoComplete="current-password" />}
        </Field>
        <div className="flex justify-end">
          <Link href="/forgot-password" className="text-sm font-medium text-primary hover:underline">
            Mot de passe oublié ?
          </Link>
        </div>
        <FormError message={formError} />
        <Button type="submit" className="w-full" size="lg" loading={formState.isSubmitting}>
          Se connecter
        </Button>
      </form>

      {demo && (
        <div className="rounded-xl border border-dashed bg-card p-4">
          <p className="text-sm font-semibold">Comptes de démonstration</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Mot de passe : <code className="rounded bg-muted px-1 py-0.5 font-mono">{demo.password}</code>
          </p>
          <ul className="mt-3 space-y-1.5">
            {demo.accounts.map((a) => (
              <li key={a.email}>
                <button
                  type="button"
                  onClick={() => {
                    setValue("email", a.email);
                    setValue("password", demo.password);
                  }}
                  className="w-full rounded-lg border px-3 py-2 text-left transition-colors hover:border-primary/40 hover:bg-primary-soft/40"
                >
                  <span className="block text-sm font-medium">{a.fullName}</span>
                  <span className="block text-xs text-muted-foreground">{a.hint}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export function RegisterForm({ next }: { next?: string }) {
  const [formError, setFormError] = useState<string | null>(null);
  const { register, handleSubmit, formState, setError } = useForm<z.input<typeof registerSchema>>({
    resolver: zodResolver(registerSchema),
    defaultValues: { fullName: "", email: "", phone: "", password: "", confirmPassword: "" },
  });
  const onSubmit = handleSubmit((v) => submitTo(() => registerAction(v, next), setError, setFormError));
  const e = formState.errors;
  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <Field label="Nom complet" required error={e.fullName?.message}>
        {(p) => <Input {...p} {...register("fullName")} autoComplete="name" placeholder="Ex. Mariam Koné" />}
      </Field>
      <Field label="Adresse e-mail" required error={e.email?.message}>
        {(p) => <Input {...p} {...register("email")} type="email" autoComplete="email" inputMode="email" />}
      </Field>
      <Field label="Téléphone" required error={e.phone?.message} hint="Utilisé pour recevoir des invitations par numéro.">
        {(p) => <Input {...p} {...register("phone")} type="tel" autoComplete="tel" inputMode="tel" placeholder="+225 07 00 00 00 00" />}
      </Field>
      <Field label="Mot de passe" required error={e.password?.message} hint="8 caractères minimum, avec au moins une lettre et un chiffre.">
        {(p) => <PasswordInput {...p} {...register("password")} autoComplete="new-password" />}
      </Field>
      <Field label="Confirmation du mot de passe" required error={e.confirmPassword?.message}>
        {(p) => <PasswordInput {...p} {...register("confirmPassword")} autoComplete="new-password" />}
      </Field>
      <FormError message={formError} />
      <Button type="submit" className="w-full" size="lg" loading={formState.isSubmitting}>
        Créer mon compte
      </Button>
    </form>
  );
}

export function ForgotPasswordForm() {
  const [formError, setFormError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const { register, handleSubmit, formState, setError } = useForm<z.input<typeof forgotPasswordSchema>>({ resolver: zodResolver(forgotPasswordSchema), defaultValues: { email: "" } });
  const onSubmit = handleSubmit(async (v) => {
    const res = await submitTo(() => forgotPasswordAction(v), setError, setFormError);
    if (res?.ok) setDone(res.message ?? "Demande envoyée.");
  });
  if (done) {
    return (
      <Alert tone="success" icon={<MailCheck />} title="Vérifiez votre boîte mail">
        {done}
      </Alert>
    );
  }
  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <Field label="Adresse e-mail" error={formState.errors.email?.message}>
        {(p) => <Input {...p} {...register("email")} type="email" autoComplete="email" inputMode="email" />}
      </Field>
      <FormError message={formError} />
      <Button type="submit" className="w-full" size="lg" loading={formState.isSubmitting}>
        Envoyer le lien
      </Button>
    </form>
  );
}
