import { ArrowLeft, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { safeNext } from "@/actions/_shared";
import { LoginForm } from "@/components/forms/auth-forms";
import { Brand } from "@/components/layout/brand";
import { DemoBanner } from "@/components/layout/demo-banner";
import { Alert } from "@/components/ui/feedback";
import { getSession } from "@/lib/auth/session";
import { isDemoMode } from "@/lib/demo";
import { isStaff } from "@/lib/permissions/platform";
import { DEMO_PASSWORD, DEMO_STAFF } from "@/server/db/seed";

/**
 * Porte d'entrée de l'ADMINISTRATION de la plateforme : distincte de la connexion des clients (/login), réservée à l'équipe KOTI.
 * Un compte client qui s'y présente reçoit le même message qu'un mauvais mot de passe.
 */
export default async function AdminLoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  const target = safeNext(next, "/admin");
  const user = await getSession();
  if (user) redirect(isStaff(user.platformRole) ? (target.startsWith("/admin") ? target : "/admin") : "/");
  return (
    <>
      {isDemoMode() && <DemoBanner />}
      <div className="mx-auto flex min-h-dvh max-w-md flex-col px-4 py-8">
        <div className="flex items-center justify-between">
          <Brand dark />
          <Link href="/bienvenue" className="inline-flex items-center gap-1.5 text-sm text-sidebar-foreground hover:text-white">
            <ArrowLeft className="size-4" aria-hidden /> Site public
          </Link>
        </div>
        <div className="my-auto py-10">
          <div className="mb-6 flex items-center gap-3">
            <span className="flex size-11 items-center justify-center rounded-xl bg-white/10 text-[#f4c04e]">
              <ShieldCheck className="size-6" aria-hidden />
            </span>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">Administration KOTI</h1>
              <p className="text-sm text-sidebar-foreground">Accès réservé à l&apos;équipe de la plateforme.</p>
            </div>
          </div>
          <div className="space-y-5 rounded-2xl bg-card p-6 text-foreground shadow-xl">
            <LoginForm
              admin
              next={target}
              demo={isDemoMode() ? { password: DEMO_PASSWORD, accounts: DEMO_STAFF.map(({ email, fullName, hint }) => ({ email, fullName, hint })) } : undefined}
            />
          </div>
          <div className="mt-5">
            <Alert tone="neutral" className="border-white/10 bg-white/5 text-sidebar-foreground">
              Vous êtes client, organisateur ou membre d&apos;une tontine ? <Link href="/login" className="font-semibold text-white underline underline-offset-2">Connexion à votre espace</Link>.
            </Alert>
          </div>
        </div>
      </div>
    </>
  );
}
