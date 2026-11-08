import { Users } from "lucide-react";
import type { Metadata } from "next";
import { InviteStaffButton, MemberActions, RevokeInvitationButton } from "@/components/admin/team-actions";
import { Badge } from "@/components/ui/badge";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState, PageHeader } from "@/components/ui/feedback";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ROLE_LABEL } from "@/lib/constants/admin-labels";
import { guard } from "@/lib/auth/guard";
import { requireUser } from "@/lib/auth/session";
import { platformCan } from "@/lib/permissions/platform";
import { formatDate } from "@/lib/utils/dates";
import { ctxFor } from "@/server/context";
import { listTeam, platformRoleOf } from "@/server/pg/services";

export const metadata: Metadata = { title: "Équipe" };

export default async function AdminTeamPage() {
  const user = await requireUser("/admin/equipe");
  const team = (await guard(async () => (await listTeam(ctxFor(user.id)))));
  const canManage = platformCan((await platformRoleOf(user.id)), "team.manage");
  return (
    <>
      <PageHeader title="Équipe KOTI" description="Les collaborateurs ayant accès à l'administration, avec leur rôle. Les invitations sont à usage unique." actions={canManage ? <InviteStaffButton /> : undefined} />

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Collaborateurs</CardTitle>
            <CardDescription>
              {team.members.length} personne{team.members.length > 1 ? "s" : ""}, dont {team.superAdminCount} super-admin actif{team.superAdminCount > 1 ? "s" : ""}.
            </CardDescription>
          </div>
        </CardHeader>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nom</TableHead>
                <TableHead>Rôle</TableHead>
                <TableHead>Accès</TableHead>
                <TableHead>Depuis le</TableHead>
                {canManage && <TableHead className="text-right">Actions</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {team.members.map((m) => (
                <TableRow key={m.userId}>
                  <TableCell>
                    <span className="font-medium">{m.name}</span>
                    {m.isMe && <span className="ml-2 text-xs text-muted-foreground">(vous)</span>}
                    <span className="block text-xs text-muted-foreground">{m.email}</span>
                  </TableCell>
                  <TableCell><Badge tone={m.role === "SUPER_ADMIN" ? "brand" : "neutral"}>{ROLE_LABEL[m.role]}</Badge></TableCell>
                  <TableCell>{m.status === "ACTIVE" ? <Badge tone="success" dot>Actif</Badge> : <Badge tone="danger" dot>Désactivé</Badge>}</TableCell>
                  <TableCell className="text-muted-foreground">{formatDate(m.since.slice(0, 10))}</TableCell>
                  {canManage && <TableCell>{m.isMe ? <span className="block text-right text-xs text-muted-foreground">Votre propre accès se gère par un autre super-admin</span> : <MemberActions userId={m.userId} name={m.name} role={m.role} active={m.status === "ACTIVE"} />}</TableCell>}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Card>

      <Card className="mt-5">
        <CardHeader>
          <div>
            <CardTitle>Invitations en attente</CardTitle>
            <CardDescription>Valables 7 jours. Le lien n&apos;est affiché qu&apos;à la création : annulez et recréez l&apos;invitation pour en obtenir un nouveau.</CardDescription>
          </div>
        </CardHeader>
        {team.invitations.length === 0 ? (
          <EmptyState icon={<Users />} title="Aucune invitation en attente" description={canManage ? "Invitez un collaborateur avec « Inviter un collaborateur »." : "Seul un super-admin peut inviter."} />
        ) : (
          <ul className="divide-y border-t">
            {team.invitations.map((i) => (
              <li key={i.id} className="flex flex-wrap items-center gap-3 px-4 py-3 sm:px-5">
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{i.email}</p>
                  <p className="text-xs text-muted-foreground">
                    {ROLE_LABEL[i.role]} · invité par {i.invitedByName} · {i.status === "EXPIRED" ? "expirée" : `expire le ${formatDate(i.expiresAt.slice(0, 10))}`}
                  </p>
                </div>
                {i.status === "EXPIRED" ? <Badge tone="warning" dot>Expirée</Badge> : <Badge tone="neutral" dot>En attente</Badge>}
                {canManage && i.status === "PENDING" && <RevokeInvitationButton id={i.id} />}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
