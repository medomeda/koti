import { Mail, Phone, Users } from "lucide-react";
import type { Metadata } from "next";
import { CancelInvitationButton, InviteButton, MemberMenu, TicketManager } from "@/components/shared/members-client";
import { InvitationStatusBadge, MemberStatusBadge, RoleBadge } from "@/components/shared/status";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/feedback";
import { Avatar } from "@/components/ui/misc";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { guard } from "@/lib/auth/guard";
import { requireUser } from "@/lib/auth/session";
import { formatDate, formatDateTime } from "@/lib/utils/dates";
import { formatFCFA } from "@/lib/utils/money";
import { listTontineInvitations } from "@/modules/invitations/invitation.service";
import { listMembers } from "@/modules/members/member.service";
import { ctxFor } from "@/server/context";

export const metadata: Metadata = { title: "Membres" };

export default async function MembersPage({ params, searchParams }: { params: Promise<{ tontineId: string }>; searchParams: Promise<{ former?: string }> }) {
  const { tontineId } = await params;
  const { former } = await searchParams;
  const user = await requireUser();
  const ctx = ctxFor(user.id);
  const { tontine, role, members } = guard(() => listMembers(ctx, tontineId, { includeFormer: former === "1" }));
  const isAdmin = role === "ADMIN";
  const invitations = isAdmin ? listTontineInvitations(ctx, tontineId) : [];
  const pendingInvites = invitations.filter((i) => i.status === "PENDING");
  const closed = tontine.status === "COMPLETED" || tontine.status === "CANCELLED";
  const activeCount = members.filter((m) => m.status === "ACTIVE").length;
  const ticketTotal = members.filter((m) => m.status === "ACTIVE").reduce((n, m) => n + m.ticketCount, 0);
  const ticketUi = (m: (typeof members)[number]) =>
    m.tickets && (
      <TicketManager
        tontineId={tontine.id}
        memberId={m.id}
        name={m.name}
        tickets={m.tickets}
        contributionAmount={tontine.contributionAmount}
        maxTickets={tontine.maxTicketsPerMember}
        canAdd={isAdmin && tontine.status === "DRAFT" && tontine.multipleTicketsAllowed && m.status === "ACTIVE"}
        canDelete={isAdmin && tontine.status === "DRAFT" && m.status === "ACTIVE"}
      />
    );

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader>
          <div>
            <CardTitle>
              Membres <span className="font-normal text-muted-foreground">· {activeCount} / {tontine.expectedMemberCount} prévus · {ticketTotal} ticket{ticketTotal > 1 ? "s" : ""}</span>
            </CardTitle>
            {isAdmin && (
              <a href={former === "1" ? "?" : "?former=1"} className="mt-1 inline-block text-xs font-medium text-primary hover:underline">
                {former === "1" ? "Masquer les anciens membres" : "Afficher les anciens membres"}
              </a>
            )}
          </div>
          {isAdmin && <InviteButton tontineId={tontine.id} disabled={closed} />}
        </CardHeader>

        {members.length === 0 ? (
          <EmptyState icon={<Users />} title="Aucun membre" />
        ) : (
          <>
            {/* Mobile : liste */}
            <ul className="divide-y md:hidden">
              {members.map((m) => (
                <li key={m.id} className="flex items-center gap-3 px-4 py-3">
                  <Avatar name={m.name} src={m.avatarUrl} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">
                      {m.name} {m.isMe && <span className="text-sm font-normal text-muted-foreground">(vous)</span>}
                    </p>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                      <RoleBadge role={m.role} />
                      {m.status !== "ACTIVE" && <MemberStatusBadge status={m.status} />}
                      {isAdmin && !!m.lateCount && <Badge tone="danger">{m.lateCount} retard(s)</Badge>}
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {m.ticketCount} ticket{m.ticketCount > 1 ? "s" : ""} · {formatFCFA(m.perPeriodAmount)} / période · depuis le {formatDate(m.joinedAt.slice(0, 10))}
                    </p>
                    {m.status === "ACTIVE" && <div className="mt-1.5">{ticketUi(m)}</div>}
                  </div>
                  {isAdmin && !closed && m.status === "ACTIVE" && m.role !== "ADMIN" && <MemberMenu tontineId={tontine.id} memberId={m.id} name={m.name} />}
                </li>
              ))}
            </ul>
            {/* Desktop : tableau */}
            <div className="hidden md:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Membre</TableHead>
                    <TableHead>Rôle</TableHead>
                    {isAdmin && <TableHead>Contact</TableHead>}
                    <TableHead>Adhésion</TableHead>
                    <TableHead>Tickets</TableHead>
                    <TableHead className="text-right">Cotisation / période</TableHead>
                    <TableHead>Tours</TableHead>
                    <TableHead>Statut</TableHead>
                    {isAdmin && <TableHead className="w-12">
                      <span className="sr-only">Actions</span>
                    </TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {members.map((m) => (
                    <TableRow key={m.id}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <Avatar name={m.name} src={m.avatarUrl} className="size-8" />
                          <span className="font-medium">
                            {m.name} {m.isMe && <span className="font-normal text-muted-foreground">(vous)</span>}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <RoleBadge role={m.role} />
                      </TableCell>
                      {isAdmin && (
                        <TableCell className="text-muted-foreground">
                          <div className="text-xs leading-relaxed">
                            <div>{m.email}</div>
                            <div>{m.phone}</div>
                          </div>
                        </TableCell>
                      )}
                      <TableCell className="text-muted-foreground">{formatDate(m.joinedAt.slice(0, 10))}</TableCell>
                      <TableCell>
                        <span className="tabular-nums">{m.ticketCount}</span>
                        {m.status === "ACTIVE" && <div className="mt-1">{ticketUi(m)}</div>}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{formatFCFA(m.perPeriodAmount)}</TableCell>
                      <TableCell className="tabular-nums">{m.rotationPositions.length ? m.rotationPositions.join(", ") : "—"}</TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1.5">
                          <MemberStatusBadge status={m.status} />
                          {isAdmin && !!m.lateCount && <Badge tone="danger">{m.lateCount} retard(s)</Badge>}
                        </div>
                      </TableCell>
                      {isAdmin && (
                        <TableCell>{!closed && m.status === "ACTIVE" && m.role !== "ADMIN" && <MemberMenu tontineId={tontine.id} memberId={m.id} name={m.name} />}</TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </>
        )}
      </Card>

      {isAdmin && (
        <Card>
          <CardHeader>
            <CardTitle>
              Invitations <span className="font-normal text-muted-foreground">· {pendingInvites.length} en attente</span>
            </CardTitle>
          </CardHeader>
          {invitations.length === 0 ? (
            <EmptyState icon={<Mail />} title="Aucune invitation envoyée" description="Invitez vos proches par e-mail ou par numéro de téléphone." />
          ) : (
            <ul className="divide-y">
              {invitations.slice(0, 20).map((i) => (
                <li key={i.id} className="flex flex-wrap items-center gap-3 px-4 py-3 sm:px-5">
                  <span className="flex size-9 items-center justify-center rounded-full bg-muted text-muted-foreground [&_svg]:size-4">{i.channel === "EMAIL" ? <Mail /> : <Phone />}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{i.contact}</p>
                    <p className="text-xs text-muted-foreground">
                      Envoyée {formatDateTime(i.createdAt)}
                      {i.status === "PENDING" && <> · expire {formatDateTime(i.expiresAt)}</>}
                    </p>
                  </div>
                  <InvitationStatusBadge status={i.status} />
                  {i.status === "PENDING" && !closed && <CancelInvitationButton tontineId={tontine.id} invitationId={i.id} />}
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}
    </div>
  );
}
