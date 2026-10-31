import type { Metadata } from "next";
import Link from "next/link";
import { Alert } from "@/components/ui/feedback";

export const metadata: Metadata = { title: "Nouveau mot de passe" };

/** Phase backend : formulaire branché sur Better Auth (resetPassword) avec le jeton reçu par e-mail. */
export default function ResetPasswordPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Nouveau mot de passe</h1>
      <Alert tone="warning" title="Disponible avec le backend">
        La réinitialisation par lien e-mail sera activée avec Better Auth. En démonstration, utilisez un compte de démo ou changez votre mot de passe depuis votre profil.
      </Alert>
      <Link href="/login" className="inline-block text-sm font-medium text-primary hover:underline">
        ← Retour à la connexion
      </Link>
    </div>
  );
}
