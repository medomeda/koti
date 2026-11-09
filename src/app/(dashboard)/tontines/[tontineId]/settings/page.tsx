import { ScrollText } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { TontineOptionsForm } from "@/components/forms/tontine-options-form";
import { TontineSettingsForm } from "@/components/forms/tontine-settings-form";
import { TransitionButton } from "@/components/shared/tontine-actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState, StatusScreen } from "@/components/ui/feedback";
import { guard } from "@/lib/auth/guard";
import { requireUser } from "@/lib/auth/session";
import { can } from "@/lib/permissions";
import { formatDateTime } from "@/lib/utils/dates";
import { transitionsFor } from "@/modules/tontines/transitions";
import { ctxFor } from "@/server/context";
import type { Weekday } from "@/types/domain";
import { getTontineAccess, listTontineAudit } from "@/server/pg/services";

export const metadata: Metadata = { title: "Paramètres de la tontine" };

const ACTION_LABEL: Record<string, string> = {
  "tontine.create": "Création de la tontine",
  "tontine.update": "Modification des paramètres",
  "tontine.options": "Options modifiées (justificatif, transparence)",
  "tontine.activate": "Démarrage",
  "tontine.pause": "Suspension",
  "tontine.resume": "Reprise",
  "tontine.close": "Clôture",
  "invitation.create": "Invitation envoyée",
  "invitation.cancel": "Invitation annulée",
  "invitation.accept": "Invitation acceptée",
  "invitation.refuse": "Invitation refusée",
  "member.remove": "Membre retiré",
  "ticket.create": "Ticket attribué",
  "ticket.delete": "Ticket supprimé",
  "payment.declare": "Paiement déclaré",
  "payment.validate": "Paiement validé",
  "payment.reject": "Paiement refusé",
  "rotation.reorder": "Ordre des tours modifié",
};

export default async function SettingsPage({ params }: { params: Promise<{ tontineId: string }> }) {
  const { tontineId } = await params;
  const user = await requireUser();
  const ctx = ctxFor(user.id);
  const { tontine, role } = (await guard(async () => (await getTontineAccess(ctx, tontineId))));
  if (!can(role, "tontine.update")) {
    return (
      <StatusScreen
        kind="forbidden"
        title="Réservé à l'administrateur"
        description="Seul l'administrateur de la tontine peut modifier ses paramètres."
        action={
          <Button asChild variant="outline">
            <Link href={`/tontines/${tontine.id}`}>Retour à la tontine</Link>
          </Button>
        }
      />
    );
  }
  const audit = (await listTontineAudit(ctx, tontineId, 40));
  const transitions = transitionsFor(tontine.status);
  const readOnly = tontine.status === "COMPLETED" || tontine.status === "CANCELLED";

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start">
      <div className="space-y-5">
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Paramètres</CardTitle>
              <CardDescription>Le nom et la description restent modifiables tant que la tontine n&apos;est pas clôturée.</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <TontineSettingsForm
              key={tontine.updatedAt}
              tontineId={tontine.id}
              readOnly={readOnly}
              financialEditable={tontine.status === "DRAFT"}
              initial={{
                name: tontine.name,
                description: tontine.description,
                contributionAmount: tontine.contributionAmount,
                frequency: tontine.frequency,
                weekday1: (tontine.frequencyConfig.weekdays?.[0] ?? 2) as Weekday,
                weekday2: (tontine.frequencyConfig.weekdays?.[1] ?? 5) as Weekday,
                startDate: tontine.startDate,
                expectedMemberCount: tontine.expectedMemberCount,
                multipleTicketsAllowed: tontine.multipleTicketsAllowed,
                maxTicketsPerMember: tontine.maxTicketsPerMember,
              }}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div>
              <CardTitle>Options de la tontine</CardTitle>
              <CardDescription>Modifiables à tout moment, même une fois la tontine démarrée. Vos choix sont journalisés.</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <TontineOptionsForm key={tontine.updatedAt} tontineId={tontine.id} readOnly={readOnly} initial={{ paymentProofMode: tontine.paymentProofMode, membersSeePayments: tontine.membersSeePayments }} />
          </CardContent>
        </Card>

        {transitions.length > 0 && (
          <Card>
            <CardHeader>
              <div>
                <CardTitle>Cycle de vie</CardTitle>
                <CardDescription>Ces actions sont journalisées.</CardDescription>
              </div>
            </CardHeader>
            <CardContent className="flex flex-col gap-2 sm:flex-row">
              {transitions.map((t) => (
                <TransitionButton key={t} tontineId={tontine.id} transition={t} variant={t === "close" ? "outline" : t === "pause" ? "outline" : "default"} />
              ))}
            </CardContent>
          </Card>
        )}
      </div>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Journal des opérations</CardTitle>
            <CardDescription>Historique des actions sensibles (40 dernières).</CardDescription>
          </div>
        </CardHeader>
        {audit.length === 0 ? (
          <EmptyState icon={<ScrollText />} title="Aucune opération" />
        ) : (
          <ol className="max-h-[560px] divide-y overflow-y-auto">
            {audit.map((a) => (
              <li key={a.id} className="px-4 py-3 text-sm sm:px-5">
                <p className="font-medium">{ACTION_LABEL[a.action] ?? a.action}</p>
                <p className="text-xs text-muted-foreground">
                  {a.actorName} · {formatDateTime(a.createdAt)}
                </p>
                {a.reason && <p className="mt-1 text-xs">Motif : {a.reason}</p>}
              </li>
            ))}
          </ol>
        )}
      </Card>
    </div>
  );
}
