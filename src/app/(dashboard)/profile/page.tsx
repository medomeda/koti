import type { Metadata } from "next";
import { AccountActions, PasswordForm, ProfileForm } from "@/components/forms/profile-forms";
import { InstallSection } from "@/components/pwa/install-prompt";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/feedback";
import { Avatar } from "@/components/ui/misc";
import { requireUser } from "@/lib/auth/session";
import { allowDemoReset } from "@/lib/demo";
import { formatDate } from "@/lib/utils/dates";
import { getProfileStats } from "@/modules/users/user.service";
import { ctxFor } from "@/server/context";

export const metadata: Metadata = { title: "Profil" };

export default async function ProfilePage() {
  const user = await requireUser("/profile");
  const stats = getProfileStats(ctxFor(user.id));
  const allowReset = allowDemoReset();
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
