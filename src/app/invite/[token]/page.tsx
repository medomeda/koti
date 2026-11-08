import { CalendarDays, Users, Wallet } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Brand } from "@/components/layout/brand";
import { InviteResponse } from "@/components/shared/invite-response";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Alert, StatusScreen } from "@/components/ui/feedback";
import { getSession } from "@/lib/auth/session";
import { FREQUENCY_LABEL, FREQUENCY_UNIT } from "@/lib/constants/labels";
import { formatDate } from "@/lib/utils/dates";
import { formatFCFA } from "@/lib/utils/money";
import { tokenSchema } from "@/lib/validations";
import { previewInvitation } from "@/server/pg/services";

export const metadata: Metadata = { title: "Invitation", referrer: "no-referrer" };

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const user = await getSession();
  const preview = tokenSchema.safeParse(token).success ? (await previewInvitation(token)) : null;
  const path = `/invite/${token}`;

  return (
    <div className="flex min-h-dvh flex-col items-center px-4 py-8">
      <Brand />
      <div className="my-auto w-full max-w-md py-8">
        {!preview ? (
          <StatusScreen kind="not-found" title="Lien d'invitation invalide" description="Ce lien est incorrect ou a été remplacé. Demandez un nouveau lien à l'administrateur de la tontine." action={<Button asChild variant="outline"><Link href="/">Accueil</Link></Button>} />
        ) : (
          <Card>
            <CardContent className="space-y-5 py-6">
              <div className="text-center">
                <p className="text-sm text-muted-foreground">{preview.invitedByName} vous invite à rejoindre</p>
                <h1 className="mt-1 text-2xl font-semibold tracking-tight">{preview.tontineName}</h1>
              </div>
              <ul className="space-y-2 rounded-lg bg-muted/60 p-4 text-sm">
                <li className="flex items-center gap-2"><Wallet className="size-4 text-muted-foreground" aria-hidden /> {formatFCFA(preview.contributionAmount)} / {FREQUENCY_UNIT[preview.frequency]}</li>
                <li className="flex items-center gap-2"><CalendarDays className="size-4 text-muted-foreground" aria-hidden /> Fréquence : {FREQUENCY_LABEL[preview.frequency].toLowerCase()}</li>
                <li className="flex items-center gap-2"><Users className="size-4 text-muted-foreground" aria-hidden /> Invitation valable jusqu&apos;au {formatDate(preview.expiresAt.slice(0, 10))}</li>
              </ul>

              {preview.status !== "PENDING" ? (
                <Alert tone="warning" title="Invitation indisponible">
                  {preview.status === "EXPIRED" ? "Cette invitation a expiré." : preview.status === "ACCEPTED" ? "Cette invitation a déjà été acceptée." : "Cette invitation n'est plus valable."} Contactez l&apos;administrateur si besoin.
                </Alert>
              ) : user ? (
                <>
                  <p className="text-center text-sm text-muted-foreground">Connecté en tant que <strong className="text-foreground">{user.email}</strong></p>
                  <InviteResponse token={token} tontineName={preview.tontineName} />
                </>
              ) : (
                <div className="space-y-2">
                  <p className="text-center text-sm text-muted-foreground">
                    Connectez-vous avec le compte correspondant {preview.channel === "EMAIL" ? "à l'e-mail" : "au numéro"} invité, ou créez-en un.
                  </p>
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
