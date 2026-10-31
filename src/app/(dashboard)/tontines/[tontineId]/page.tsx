import { ArrowRight, CalendarDays, CircleAlert, Clock, Gift, Hourglass, Repeat, Users, Wallet } from "lucide-react";
import Link from "next/link";
import { TransitionButton } from "@/components/shared/tontine-actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, DescriptionList, StatCard } from "@/components/ui/feedback";
import { Avatar } from "@/components/ui/misc";
import { guard } from "@/lib/auth/guard";
import { requireUser } from "@/lib/auth/session";
import { FREQUENCY_LABEL, WEEKDAY_LABEL } from "@/lib/constants/labels";
import { cn } from "@/lib/utils/cn";
import { formatDate, formatShortDate, relativeDays, todayISO } from "@/lib/utils/dates";
import { formatFCFA } from "@/lib/utils/money";
import { getTontineOverview } from "@/modules/tontines/tontine.service";
import { ctxFor } from "@/server/context";

export default async function TontineOverviewPage({ params }: { params: Promise<{ tontineId: string }> }) {
  const { tontineId } = await params;
  const user = await requireUser();
  const o = guard(() => getTontineOverview(ctxFor(user.id), tontineId));
  const { tontine } = o;
  const today = todayISO();
  const base = `/tontines/${tontine.id}`;
  const frequency =
    tontine.frequency === "TWICE_WEEKLY" && tontine.frequencyConfig.weekdays
      ? `${FREQUENCY_LABEL.TWICE_WEEKLY} (${tontine.frequencyConfig.weekdays.map((d) => WEEKDAY_LABEL[d].toLowerCase()).join(" et ")})`
      : FREQUENCY_LABEL[tontine.frequency];

  const nextBlock = (
    <Card>
      <CardHeader>
        <CardTitle>Prochain tour de main</CardTitle>
        <Link href={`${base}/rotations`} className="text-sm font-medium text-primary hover:underline">
          Calendrier
        </Link>
      </CardHeader>
      <CardContent>
        {o.nextBeneficiary ? (
          <div className="flex items-center gap-3">
            <Avatar name={o.nextBeneficiary.name} src={o.nextBeneficiary.avatarUrl} className="size-11" />
            <div className="min-w-0 flex-1">
              <p className="font-semibold">
                {o.nextBeneficiary.name} {o.nextBeneficiary.isMe && <span className="font-normal text-primary">(vous)</span>}
              </p>
              <p className="text-sm text-muted-foreground">
                Position {o.nextBeneficiary.position} · {o.nextBeneficiary.scheduledDate ? formatDate(o.nextBeneficiary.scheduledDate) : "date à définir"}
              </p>
            </div>
            <div className="text-right">
              <p className="text-xs text-muted-foreground">Cagnotte</p>
              <p className="font-semibold tabular-nums text-primary">{formatFCFA(o.nextBeneficiary.potAmount)}</p>
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Aucun tour à venir.</p>
        )}
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-5">
      {tontine.description && <p className="max-w-3xl text-sm text-muted-foreground">{tontine.description}</p>}

      {tontine.status === "DRAFT" && o.role === "ADMIN" && (
        <Card className="border-primary/30">
          <CardHeader>
            <div>
              <CardTitle>Préparer le démarrage</CardTitle>
              <p className="mt-0.5 text-sm text-muted-foreground">La tontine est en brouillon. Démarrage prévu le {formatDate(tontine.startDate)}.</p>
            </div>
          </CardHeader>
          <CardContent>
            <ol className="space-y-3 text-sm">
              <li className="flex flex-wrap items-center gap-3">
                <span className={cn("flex size-6 items-center justify-center rounded-full text-xs font-semibold", o.memberCount >= tontine.expectedMemberCount ? "bg-primary text-white" : "bg-muted")}>1</span>
                <span className="flex-1">
                  Inviter les membres — <strong>{o.memberCount}</strong> / {tontine.expectedMemberCount} inscrits{o.pendingInvitations > 0 && `, ${o.pendingInvitations} invitation(s) en attente`}
                </span>
                <Button asChild size="sm" variant="outline">
                  <Link href={`${base}/members`}>Inviter</Link>
                </Button>
              </li>
              <li className="flex flex-wrap items-center gap-3">
                <span className="flex size-6 items-center justify-center rounded-full bg-muted text-xs font-semibold">2</span>
                <span className="flex-1">Définir l&apos;ordre des tours de main</span>
                <Button asChild size="sm" variant="outline">
                  <Link href={`${base}/rotations`}>Organiser</Link>
                </Button>
              </li>
              <li className="flex flex-wrap items-center gap-3">
                <span className="flex size-6 items-center justify-center rounded-full bg-muted text-xs font-semibold">3</span>
                <span className="flex-1">Démarrer : les échéances seront générées et les paramètres financiers verrouillés.</span>
                <TransitionButton tontineId={tontine.id} transition="activate" />
              </li>
            </ol>
            {o.memberCount < tontine.expectedMemberCount && (
              <Alert tone="warning" className="mt-4">
                {tontine.expectedMemberCount - o.memberCount} place(s) restent libres. Vous pouvez démarrer quand même : les membres qui rejoindront plus tard cotiseront à partir de leur adhésion.
              </Alert>
            )}
          </CardContent>
        </Card>
      )}

      {o.admin ? (
        <section aria-label="Indicateurs de la tontine" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard label="Total attendu" value={formatFCFA(o.admin.totalExpected)} hint="Échéances arrivées à terme" icon={<Wallet />} />
          <StatCard label="Total confirmé" value={formatFCFA(o.admin.totalConfirmed)} tone="success" hint={o.admin.totalExpected ? `${Math.round((o.admin.totalConfirmed / o.admin.totalExpected) * 100)} % de l'attendu` : "—"} />
          <StatCard label="À valider" value={o.admin.pendingValidations} tone={o.admin.pendingValidations ? "warning" : "neutral"} hint="Déclarations reçues" icon={<Clock />} href={`${base}/payments?status=DECLARED`} />
          <StatCard label="Retards" value={o.admin.lateCount} tone={o.admin.lateCount ? "danger" : "neutral"} hint={`${o.admin.membersUpToDate}/${o.memberCount} membres à jour`} icon={<CircleAlert />} href={`${base}/payments?status=LATE`} />
        </section>
      ) : (
        <section aria-label="Ma situation" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard label="À payer" value={formatFCFA(o.personal.toPayAmount)} hint={`${o.personal.toPay} échéance(s)`} icon={<Wallet />} href={`${base}/payments`} />
          <StatCard label="Confirmé" value={formatFCFA(o.personal.paidAmount)} tone="success" hint={`${o.personal.paidCount} paiement(s) validé(s)`} />
          <StatCard label="En validation" value={o.personal.declared} tone={o.personal.declared ? "warning" : "neutral"} icon={<Hourglass />} />
          <StatCard label="Retards" value={o.personal.late} tone={o.personal.late ? "danger" : "neutral"} icon={<CircleAlert />} href={`${base}/payments`} />
        </section>
      )}

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Paramètres</CardTitle>
          </CardHeader>
          <CardContent>
            <DescriptionList
              items={[
                [
                  <span key="m" className="inline-flex items-center gap-1">
                    <Users className="size-3.5" /> Membres
                  </span>,
                  `${o.memberCount} inscrits / ${tontine.expectedMemberCount} prévus`,
                ],
                ["Cotisation", formatFCFA(tontine.contributionAmount)],
                [
                  <span key="f" className="inline-flex items-center gap-1">
                    <Repeat className="size-3.5" /> Fréquence
                  </span>,
                  frequency,
                ],
                ["Démarrage", formatDate(tontine.startDate)],
                [
                  <span key="d" className="inline-flex items-center gap-1">
                    <CalendarDays className="size-3.5" /> Prochaine échéance
                  </span>,
                  o.nextDueDate ? `${formatDate(o.nextDueDate)} (${relativeDays(o.nextDueDate, today)})` : "—",
                ],
                ...(o.admin ? ([["Montant attendu par échéance", formatFCFA(o.admin.expectedPerPeriod)]] as Array<[string, string]>) : []),
              ]}
            />
          </CardContent>
        </Card>
        <div className="space-y-5">
          {nextBlock}
          {o.mySlot && (
            <Card className="bg-primary-soft/40">
              <CardContent className="flex items-center gap-3">
                <span className="flex size-10 items-center justify-center rounded-full bg-primary text-white [&_svg]:size-5">
                  <Gift aria-hidden />
                </span>
                <div className="flex-1">
                  <p className="text-sm text-muted-foreground">Mon tour de main</p>
                  <p className="font-semibold">
                    Position {o.mySlot.position}
                    {o.mySlot.scheduledDate && <> · {formatDate(o.mySlot.scheduledDate)}</>}
                  </p>
                </div>
                {o.mySlot.status === "COMPLETED" && <span className="text-sm font-medium text-primary">Déjà reçu</span>}
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {o.admin && o.admin.progress.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Collecte par échéance</CardTitle>
            <Link href={`${base}/payments`} className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline">
              Détail <ArrowRight className="size-3.5" />
            </Link>
          </CardHeader>
          <CardContent>
            <ul className="space-y-3">
              {[...o.admin.progress].reverse().map((p) => {
                const pct = p.expected ? Math.round((p.paid / p.expected) * 100) : 0;
                return (
                  <li key={p.periodNumber} className="grid grid-cols-[88px_1fr_64px] items-center gap-3 text-sm">
                    <span className="text-muted-foreground">
                      N°{p.periodNumber} · {formatShortDate(p.dueDate)}
                    </span>
                    <div className="h-2.5 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={`Échéance ${p.periodNumber} : ${p.paid} sur ${p.expected} payés`}>
                      <div className={cn("h-full rounded-full", pct === 100 ? "bg-primary" : p.dueDate < today ? "bg-warning" : "bg-primary/60")} style={{ width: `${pct}%` }} />
                    </div>
                    <span className="text-right tabular-nums">
                      {p.paid}/{p.expected}
                    </span>
                  </li>
                );
              })}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
