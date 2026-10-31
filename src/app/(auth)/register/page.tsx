import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { safeNext } from "@/actions/_shared";
import { RegisterForm } from "@/components/forms/auth-forms";
import { getSession } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Créer un compte" };

export default async function RegisterPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  const target = safeNext(next);
  if (await getSession()) redirect(target);
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Créer votre compte</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Déjà inscrit ?{" "}
          <Link href={`/login${next ? `?next=${encodeURIComponent(target)}` : ""}`} className="font-medium text-primary hover:underline">
            Se connecter
          </Link>
        </p>
      </div>
      <RegisterForm next={target} />
      <p className="text-xs text-muted-foreground">En créant un compte, vous acceptez que KOTI enregistre vos déclarations de paiement. KOTI ne détient ni ne transfère aucun fonds.</p>
    </div>
  );
}
