import type { Metadata } from "next";
import { PasswordForm, ProfileForm } from "@/components/forms/profile-forms";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/feedback";
import { requireStaff } from "@/lib/auth/session";
import { ROLE_LABEL } from "@/lib/constants/admin-labels";

export const metadata: Metadata = { title: "Mon compte" };

/** Compte du collaborateur : identité, rôle, mot de passe. L'équipe n'a pas d'espace client (tontines, abonnement personnel). */
export default async function AdminAccountPage() {
  const user = await requireStaff("/admin/compte");
  return (
    <>
      <PageHeader title="Mon compte" description="Vos informations de collaborateur et la sécurité de votre accès à l'administration." />
      <div className="grid gap-5 lg:grid-cols-2 lg:items-start">
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Informations</CardTitle>
              <CardDescription>
                Rôle : <Badge tone={user.platformRole === "SUPER_ADMIN" ? "brand" : "neutral"}>{ROLE_LABEL[user.platformRole as "SUPPORT" | "SUPER_ADMIN"]}</Badge>
              </CardDescription>
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
      </div>
    </>
  );
}
