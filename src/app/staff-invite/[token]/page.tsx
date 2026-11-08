import type { Metadata } from "next";
import Link from "next/link";
import { AcceptStaffInvitation } from "@/components/admin/team-actions";
import { Brand } from "@/components/layout/brand";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Alert, StatusScreen } from "@/components/ui/feedback";
import { ROLE_LABEL } from "@/lib/constants/admin-labels";
import { getSession } from "@/lib/auth/session";
import { formatDate } from "@/lib/utils/dates";
import { tokenSchema } from "@/lib/validations";
import { previewStaffInvitation } from "@/server/pg/services";

export const metadata: Metadata = { title: "Invitation à l'équipe KOTI", referrer: "no-referrer", robots: { index: false, follow: false } };

export default async function StaffInvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const user = await getSession();
  const preview = tokenSchema.safeParse(token).success ? (await previewStaffInvitation(token)) : null;
  const path = `/staff-invite/${token}`;
  return (
    <div className="flex min-h-dvh flex-col items-center px-4 py-8">
      <Brand />
      <div className="my-auto w-full max-w-md py-8">
        {!preview ? (
          <StatusScreen kind="not-found" title="Lien d'invitation invalide" description="Ce lien est incorrect ou a été annulé. Demandez un nouveau lien à un super-admin." action={<Button asChild variant="outline"><Link href="/">Accueil</Link></Button>} />
        ) : (
          <Card>
            <CardContent className="space-y-5 py-6">
              <div className="text-center">
                <p className="text-sm text-muted-foreground">{preview.invitedByName} vous invite à rejoindre l&apos;équipe KOTI</p>
                <h1 className="mt-1 text-2xl font-semibold tracking-tight">Rôle : {ROLE_LABEL[preview.role]}</h1>
                <p className="mt-1 text-sm text-muted-foreground">Invitation pour <strong className="text-foreground">{preview.email}</strong>, valable jusqu&apos;au {formatDate(preview.expiresAt.slice(0, 10))}.</p>
              </div>
              {preview.status !== "PENDING" ? (
                <Alert tone="warning" title="Invitation indisponible">
                  {preview.status === "EXPIRED" ? "Cette invitation a expiré." : preview.status === "ACCEPTED" ? "Cette invitation a déjà été utilisée." : "Cette invitation a été annulée."} Demandez-en une nouvelle à un super-admin.
                </Alert>
              ) : user ? (
                user.email === preview.email ? (
                  <AcceptStaffInvitation token={token} />
                ) : (
                  <Alert tone="warning" title="Mauvais compte">
                    Vous êtes connecté avec {user.email}. Connectez-vous avec {preview.email} pour accepter cette invitation.
                  </Alert>
                )
              ) : (
                <div className="space-y-2">
                  <p className="text-center text-sm text-muted-foreground">Créez votre compte ou connectez-vous avec l&apos;adresse {preview.email}.</p>
                  <Button asChild className="w-full" size="lg"><Link href={`/register?next=${encodeURIComponent(path)}`}>Créer mon compte</Link></Button>
                  <Button asChild variant="outline" className="w-full" size="lg"><Link href={`/login?next=${encodeURIComponent(path)}`}>J&apos;ai déjà un compte</Link></Button>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
