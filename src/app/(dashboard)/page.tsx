import { CircleAlert, Clock, Mail, Plus, Users, Wallet } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { InstallCard } from "@/components/pwa/install-prompt";
import { ObligationRow } from "@/components/shared/obligation-row";
import { TontineCard } from "@/components/shared/tontine-card";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, EmptyState, StatCard } from "@/components/ui/feedback";
import { requireUser } from "@/lib/auth/session";
import { todayISO } from "@/lib/utils/dates";
import { formatFCFA, sumAmounts } from "@/lib/utils/money";
import { listMyInvitations } from "@/modules/invitations/invitation.service";
import { listMyObligations } from "@/modules/payments/payment.service";
import { listMyTontines } from "@/modules/tontines/tontine.service";
import { ctxFor } from "@/server/context";

export const metadata: Metadata = { title: "Accueil" };

function greeting() {
  const h = new Date().getUTCHours();
  return h < 12 ? "Bonjour" : h < 18 ? "Bon après-midi" : "Bonsoir";
}

export default async function HomePage() {
  const user = await requireUser();
  const ctx = ctxFor(user.id);
  const today = todayISO();
  const tontines = listMyTontines(ctx);
  const { toPay, pending } = listMyObligations(ctx);
  const invitations = listMyInvitations(ctx);
  const late = toPay.filter((o) => o.status === "LATE");
  const toValidate = tontines.reduce((acc, t) => acc + t.pendingValidations, 0);
  const firstName = user.fullName.split(" ")[0];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">
            {greeting()}, {firstName}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">Voici où en sont vos tontines aujourd&apos;hui.</p>
        </div>
        <Button asChild>
          <Link href="/tontines/new">
            <Plus /> Créer une tontine
          </Link>
        </Button>
      </div>

      <InstallCard />

      {invitations.length > 0 && (
        <Alert
          tone="brand"
          icon={<Mail />}
          title={`${invitations.length} invitation${invitations.length > 1 ? "s" : ""} en attente`}
          action={
            <Button size="sm" variant="outline" asChild>
              <Link href="/alerts#invitations">Répondre</Link>
            </Button>
          }
        >
          {invitations.map((i) => `« ${i.tontineName} » par ${i.invitedByName}`).join(" · ")}
        </Alert>
      )}

      <section aria-label="Indicateurs" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Tontines actives" value={tontines.filter((t) => t.status === "ACTIVE").length} hint={`${tontines.length} au total`} icon={<Users />} href="/tontines" />
        <StatCard label="À payer" value={formatFCFA(sumAmounts(toPay.map((o) => o.expectedAmount)))} hint={`${toPay.length} échéance${toPay.length > 1 ? "s" : ""}`} icon={<Wallet />} href="/payments" />
        <StatCard label="En retard" value={late.length} tone={late.length ? "danger" : "neutral"} hint={late.length ? formatFCFA(sumAmounts(late.map((o) => o.expectedAmount))) : "Tout est à jour"} icon={<CircleAlert />} href="/payments" />
        <StatCard
          label={toValidate ? "À valider (admin)" : "En validation"}
          value={toValidate || pending.length}
          tone={toValidate ? "warning" : "neutral"}
          hint={toValidate ? "Déclarations reçues" : "Vos déclarations"}
          icon={<Clock />}
          href={toValidate ? "/tontines" : "/payments?tab=pending"}
        />
      </section>

      <section aria-labelledby="mes-tontines" className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 id="mes-tontines" className="text-base font-semibold">
            Mes tontines
          </h2>
          <Link href="/tontines" className="text-sm font-medium text-primary hover:underline">
            Tout voir
          </Link>
        </div>
        {tontines.length === 0 ? (
          <Card>
            <EmptyState
              icon={<Users />}
              title="Aucune tontine pour l'instant"
              description="Créez votre première tontine et invitez vos proches, ou attendez une invitation."
              action={
                <Button asChild>
                  <Link href="/tontines/new">
                    <Plus /> Créer une tontine
                  </Link>
                </Button>
              }
            />
          </Card>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {tontines.slice(0, 6).map((t) => (
              <TontineCard key={t.id} t={t} />
            ))}
          </div>
        )}
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Mes prochaines échéances</CardTitle>
          <Link href="/payments" className="text-sm font-medium text-primary hover:underline">
            Mes paiements
          </Link>
        </CardHeader>
        {toPay.length === 0 ? (
          <CardContent>
            <EmptyState icon={<Wallet />} title="Rien à payer" description="Vous êtes à jour dans toutes vos tontines." className="py-6" />
          </CardContent>
        ) : (
          <ul className="divide-y">
            {toPay.slice(0, 5).map((o) => (
              <ObligationRow key={o.id} o={o} today={today} />
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
