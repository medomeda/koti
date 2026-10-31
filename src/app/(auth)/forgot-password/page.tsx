import type { Metadata } from "next";
import Link from "next/link";
import { ForgotPasswordForm } from "@/components/forms/auth-forms";

export const metadata: Metadata = { title: "Mot de passe oublié" };

export default function ForgotPasswordPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Mot de passe oublié</h1>
        <p className="mt-1 text-sm text-muted-foreground">Indiquez votre e-mail : nous vous enverrons un lien pour choisir un nouveau mot de passe.</p>
      </div>
      <ForgotPasswordForm />
      <Link href="/login" className="inline-block text-sm font-medium text-primary hover:underline">
        ← Retour à la connexion
      </Link>
    </div>
  );
}
