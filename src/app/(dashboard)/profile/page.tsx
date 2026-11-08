import type { Metadata } from "next";
import Link from "next/link";
import { AccountActions, PasswordForm, ProfileForm } from "@/components/forms/profile-forms";
import { InstallSection } from "@/components/pwa/install-prompt";
import { PushSettings } from "@/components/pwa/push-settings";
import { ALL_CATEGORIES, PUSH_CATEGORIES, getPushState, vapidPublicKey } from "@/modules/push/push.service";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/feedback";
import { Avatar } from "@/components/ui/misc";
import { requireUser } from "@/lib/auth/session";
import { allowDemoReset } from "@/lib/demo";
import { formatDate } from "@/lib/utils/dates";
import { ctxFor } from "@/server/context";
import { getAccount, platformRoleOf } from "@/server/pg/services";
import { getProfileStats } from "@/server/pg/services";

export const metadata: Metadata = { title: "Profil" };

export default async function ProfilePage() {
  const user = await requireUser("/profile");
  const stats = (await getProfileStats(ctxFor(user.id)));
  const allowReset = allowDemoReset();
  const account = (await getAccount(ctxFor(user.id)));
  const staffRole = (await platformRoleOf(user.id));
  const push = await getPushState(user.id);
  return (
    <>
      <PageHeader title="Profil" description="Vos informations personnelles et la sécurité de votre compte." />
      <div className="grid gap-5 lg:grid-cols-[300px_minmax(0,1fr)] lg:items-start">
        <Card>
          <CardContent className="flex flex-col items-center py-6 text-center">
            <Avatar name={user.fullName} src={user.avatarUrl} className="size-20 text-xl [&_span]:text-xl" />
            <p className="mt-3 text-lg font-semibold">{user.fullName}</p>
            <p className="text-sm text-muted-foreground">{user.email}</p>
            <p className="mt-3 text-xs text-muted-foreground">Membre depuis le {formatDate(user.createdAt.slice(0, 10))}</p>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              <Badge tone="success">
                {stats.tontines} tontine{stats.tontines > 1 ? "s" : ""}
              </Badge>
              <Badge>Admin de {stats.adminOf}</Badge>
            </div>
            <p className="mt-4 text-xs text-muted-foreground">La photo de profil sera modifiable avec le stockage de fichiers (phase backend).</p>
          </CardContent>
        </Card>
        <div className="space-y-5">
          <Card>
            <CardHeader>
              <div>
                <CardTitle>Informations personnelles</CardTitle>
                <CardDescription>Visibles par les administrateurs de vos tontines.</CardDescription>
              </div>
            </CardHeader>
            <CardContent>
              <ProfileForm defaults={{ fullName: user.fullName, phone: user.phone }} email={user.email} />
            </CardContent>
          </Card>
          {staffRole && (
            <Card className="border-primary/30">
              <CardHeader>
                <div>
                  <CardTitle>Équipe KOTI</CardTitle>
                  <CardDescription>Vous avez accès à l&apos;administration de la plateforme ({staffRole === "SUPER_ADMIN" ? "super-admin" : "support"}).</CardDescription>
                </div>
              </CardHeader>
              <CardContent>
                <Button asChild>
                  <Link href="/admin">Ouvrir l&apos;administration</Link>
                </Button>
              </CardContent>
            </Card>
          )}
          <Card>
            <CardHeader>
              <div>
                <CardTitle>Abonnement</CardTitle>
                <CardDescription>Offre, consommation et factures de votre compte organisateur.</CardDescription>
              </div>
            </CardHeader>
            <CardContent className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="font-semibold">Offre « {account.plan.name} »</p>
                <p className="text-sm text-muted-foreground">
                  {account.usage.tontines.length} / {account.plan.limits.tontines} tontine{account.plan.limits.tontines > 1 ? "s" : ""} en cours
                  {account.subscription?.status === "TRIAL" && " · essai gratuit"}
                </p>
              </div>
              <Button asChild variant="outline">
                <Link href="/account">Gérer mon abonnement</Link>
              </Button>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Mot de passe</CardTitle>
            </CardHeader>
            <CardContent>
              <PasswordForm />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <div>
                <CardTitle>Notifications</CardTitle>
                <CardDescription>Rappels d&apos;échéance et validations de paiement sur cet appareil.</CardDescription>
              </div>
            </CardHeader>
            <CardContent>
              <PushSettings publicKey={vapidPublicKey()} categories={push.categories} allCategories={ALL_CATEGORIES.map((k) => ({ key: k, label: PUSH_CATEGORIES[k].label, description: PUSH_CATEGORIES[k].description }))} knownEndpoints={push.endpoints} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <div>
                <CardTitle>Application</CardTitle>
                <CardDescription>Installez KOTI sur l&apos;écran d&apos;accueil de votre téléphone.</CardDescription>
              </div>
            </CardHeader>
            <CardContent>
              <InstallSection />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Session</CardTitle>
            </CardHeader>
            <CardContent>
              <AccountActions allowReset={allowReset} />
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
