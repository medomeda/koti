import type { Metadata } from "next";
import Link from "next/link";
import { ResetPasswordForm } from "@/components/forms/auth-forms";
import { Alert } from "@/components/ui/feedback";

export const metadata: Metadata = { title: "Nouveau mot de passe", robots: { index: false, follow: false }, referrer: "no-referrer" };

/** Page d'arrivée du lien reçu par e-mail : Better Auth redirige ici avec ?token=… (ou ?error=INVALID_TOKEN). */
export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<{ token?: string; error?: string }> }) {
  const { token, error } = await searchParams;
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Nouveau mot de passe</h1>
      {token && !error ? (
        <ResetPasswordForm token={token} />
      ) : (
        <Alert tone="warning" title="Lien invalide ou expiré">
          Ce lien de réinitialisation n&apos;est plus valable (il l&apos;est une heure, une seule fois). Faites une nouvelle demande.
        </Alert>
      )}
      <p className="text-sm">
        <Link href="/forgot-password" className="font-medium text-primary hover:underline">
          Demander un nouveau lien
        </Link>
        <span className="mx-2 text-muted-foreground">·</span>
        <Link href="/login" className="font-medium text-primary hover:underline">
          Retour à la connexion
        </Link>
      </p>
    </div>
  );
}
