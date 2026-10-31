import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { LoginForm } from "@/components/forms/auth-forms";
import { Alert } from "@/components/ui/feedback";
import { getSession } from "@/lib/auth/session";
import { isDemoMode } from "@/lib/demo";
import { DEMO_ACCOUNTS, DEMO_PASSWORD } from "@/server/db/seed";
import { safeNext } from "@/actions/_shared";

export const metadata: Metadata = { title: "Connexion" };


export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; reset?: string }> }) {
  const { next, reset } = await searchParams;
  const target = safeNext(next);
  if (await getSession()) redirect(target);
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Connexion</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Pas encore de compte ?{" "}
          <Link href={`/register${next ? `?next=${encodeURIComponent(target)}` : ""}`} className="font-medium text-primary hover:underline">
            Créer un compte
          </Link>
        </p>
      </div>
      {reset && <Alert tone="success">Le jeu de démonstration a été réinitialisé.</Alert>}
      {next?.startsWith("/invite/") && <Alert tone="brand">Connectez-vous (ou créez un compte) pour répondre à votre invitation.</Alert>}
      <LoginForm next={target} demo={isDemoMode() ? { password: DEMO_PASSWORD, accounts: DEMO_ACCOUNTS.map(({ email, fullName, hint }) => ({ email, fullName, hint })) } : undefined} />
    </div>
  );
}
