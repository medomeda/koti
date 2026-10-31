"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { LogOut, RotateCcw } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import type { z } from "zod";
import { logoutAction } from "@/actions/auth";
import { changePasswordAction, resetDemoAction, updateProfileAction } from "@/actions/misc";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { useAction } from "@/components/shared/use-action";
import { Button } from "@/components/ui/button";
import { Field, FormError } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { changePasswordSchema, profileSchema } from "@/lib/validations";

export function ProfileForm({ defaults, email }: { defaults: { fullName: string; phone: string }; email: string }) {
  const { register, handleSubmit, formState, setError, reset } = useForm<z.input<typeof profileSchema>>({ resolver: zodResolver(profileSchema), defaultValues: defaults });
  const action = useAction(updateProfileAction, { success: "Profil mis à jour." });
  const onSubmit = handleSubmit(async (v) => {
    const res = await action.run(v);
    if (res.ok) reset(v);
    else for (const [k, m] of Object.entries(res.fieldErrors ?? {})) setError(k as "fullName" | "phone", { message: m });
  });
  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4">
      <Field label="Nom complet" required error={formState.errors.fullName?.message}>
        {(p) => <Input {...p} {...register("fullName")} autoComplete="name" />}
      </Field>
      <Field label="Adresse e-mail" hint="L'e-mail sert d'identifiant de connexion ; sa modification arrivera avec la vérification par e-mail.">
        {(p) => <Input {...p} value={email} disabled readOnly />}
      </Field>
      <Field label="Téléphone" required error={formState.errors.phone?.message}>
        {(p) => <Input {...p} {...register("phone")} type="tel" autoComplete="tel" inputMode="tel" />}
      </Field>
      <div className="flex justify-end">
        <Button type="submit" loading={action.pending || formState.isSubmitting} disabled={!formState.isDirty}>
          Enregistrer
        </Button>
      </div>
    </form>
  );
}

export function PasswordForm() {
  const [formError, setFormError] = useState<string | null>(null);
  const { register, handleSubmit, formState, setError, reset } = useForm<z.input<typeof changePasswordSchema>>({
    resolver: zodResolver(changePasswordSchema),
    defaultValues: { currentPassword: "", newPassword: "", confirmPassword: "" },
  });
  const action = useAction(changePasswordAction, { success: "Mot de passe modifié. Vos autres appareils ont été déconnectés." });
  const onSubmit = handleSubmit(async (v) => {
    setFormError(null);
    const res = await action.run(v);
    if (res.ok) reset();
    else {
      setFormError(res.error);
      for (const [k, m] of Object.entries(res.fieldErrors ?? {})) setError(k as "currentPassword", { message: m });
    }
  });
  const e = formState.errors;
  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4">
      <Field label="Mot de passe actuel" required error={e.currentPassword?.message}>
        {(p) => <Input {...p} {...register("currentPassword")} type="password" autoComplete="current-password" />}
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nouveau mot de passe" required error={e.newPassword?.message} hint="8 caractères min., lettres et chiffres.">
          {(p) => <Input {...p} {...register("newPassword")} type="password" autoComplete="new-password" />}
        </Field>
        <Field label="Confirmation" required error={e.confirmPassword?.message}>
          {(p) => <Input {...p} {...register("confirmPassword")} type="password" autoComplete="new-password" />}
        </Field>
      </div>
      <FormError message={formError} />
      <div className="flex justify-end">
        <Button type="submit" variant="outline" loading={action.pending || formState.isSubmitting}>
          Changer le mot de passe
        </Button>
      </div>
    </form>
  );
}

export function AccountActions({ allowReset }: { allowReset: boolean }) {
  const [confirm, setConfirm] = useState(false);
  return (
    <div className="flex flex-col gap-2 sm:flex-row">
      <form action={logoutAction}>
        <Button type="submit" variant="outline" className="w-full sm:w-auto">
          <LogOut /> Se déconnecter
        </Button>
      </form>
      {allowReset && (
        <>
          <Button variant="ghost" onClick={() => setConfirm(true)}>
            <RotateCcw /> Réinitialiser la démo
          </Button>
          <ConfirmDialog
            open={confirm}
            onOpenChange={setConfirm}
            title="Réinitialiser les données de démonstration ?"
            description="Toutes les modifications (tontines créées, paiements, invitations…) seront perdues et le jeu de démonstration initial sera restauré. Vous serez déconnecté."
            confirmLabel="Réinitialiser"
            destructive
            onConfirm={async () => {
              try {
                const res = await resetDemoAction();
                return res && !res.ok ? res.error : null;
              } catch (err) {
                if (err && typeof err === "object" && "digest" in err) throw err;
                return "Réinitialisation impossible.";
              }
            }}
          />
        </>
      )}
    </div>
  );
}
