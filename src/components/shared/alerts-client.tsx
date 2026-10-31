"use client";

import { Bell, BellRing, CalendarClock, CheckCheck, CircleAlert, CircleCheck, CircleX, Clock, Mail, UserCheck, UserX } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { acceptInvitationAction, refuseInvitationAction } from "@/actions/members";
import { markAllNotificationsReadAction, markNotificationReadAction } from "@/actions/misc";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/feedback";
import { FREQUENCY_UNIT } from "@/lib/constants/labels";
import { cn } from "@/lib/utils/cn";
import { formatDate, timeAgo } from "@/lib/utils/dates";
import { formatFCFA } from "@/lib/utils/money";
import type { NotificationType } from "@/types/domain";
import { useAction } from "./use-action";

const ICONS: Record<NotificationType, { icon: React.ReactNode; cls: string }> = {
  INVITATION_RECEIVED: { icon: <Mail />, cls: "bg-primary-soft text-primary" },
  INVITATION_ACCEPTED: { icon: <UserCheck />, cls: "bg-primary-soft text-primary" },
  INVITATION_REFUSED: { icon: <UserX />, cls: "bg-muted text-muted-foreground" },
  DUE_SOON: { icon: <CalendarClock />, cls: "bg-warning-soft text-warning" },
  DUE_OVERDUE: { icon: <CircleAlert />, cls: "bg-destructive-soft text-destructive" },
  PAYMENT_DECLARED: { icon: <Clock />, cls: "bg-warning-soft text-warning" },
  PAYMENT_VALIDATED: { icon: <CircleCheck />, cls: "bg-primary-soft text-primary" },
  PAYMENT_REJECTED: { icon: <CircleX />, cls: "bg-destructive-soft text-destructive" },
  ROTATION_SOON: { icon: <BellRing />, cls: "bg-primary-soft text-primary" },
};

export interface InvitationItem {
  id: string;
  tontineName: string;
  contributionAmount: number;
  frequency: keyof typeof FREQUENCY_UNIT;
  memberCount: number;
  invitedByName: string;
  expiresAt: string;
}

export function InvitationCard({ inv }: { inv: InvitationItem }) {
  const router = useRouter();
  const accept = useAction(acceptInvitationAction, { success: `Bienvenue dans « ${inv.tontineName} » !`, onSuccess: (d) => router.push(`/tontines/${d.tontineId}`) });
  const refuse = useAction(refuseInvitationAction, { success: "Invitation refusée." });
  return (
    <li className="flex flex-col gap-3 rounded-xl border bg-card p-4 shadow-xs sm:flex-row sm:items-center">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary-soft text-primary [&_svg]:size-5">
        <Mail aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-semibold">{inv.tontineName}</p>
        <p className="text-sm text-muted-foreground">
          {inv.invitedByName} vous invite · {formatFCFA(inv.contributionAmount)} / {FREQUENCY_UNIT[inv.frequency]} · {inv.memberCount} membre{inv.memberCount > 1 ? "s" : ""}
        </p>
        <p className="text-xs text-muted-foreground">Expire le {formatDate(inv.expiresAt.slice(0, 10))}</p>
      </div>
      <div className="flex gap-2">
        <Button variant="outline" onClick={() => refuse.run({ invitationId: inv.id })} loading={refuse.pending} disabled={accept.pending} className="flex-1 sm:flex-none">
          Refuser
        </Button>
        <Button onClick={() => accept.run({ invitationId: inv.id })} loading={accept.pending} disabled={refuse.pending} className="flex-1 sm:flex-none">
          Accepter
        </Button>
      </div>
    </li>
  );
}

export interface NotificationItem {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  tontineName: string | null;
  href: string | null;
  readAt: string | null;
  createdAt: string;
}

export function NotificationList({ items }: { items: NotificationItem[] }) {
  const router = useRouter();
  const markOne = useAction(markNotificationReadAction);
  const markAll = useAction(markAllNotificationsReadAction, { success: "Toutes les notifications sont marquées comme lues." });
  const unread = items.filter((n) => !n.readAt).length;

  const open = async (n: NotificationItem) => {
    if (!n.readAt) await markOne.run({ id: n.id });
    if (n.href) router.push(n.href);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          Notifications {unread > 0 && <span className="ml-1 text-sm font-normal text-muted-foreground">· {unread} non lue{unread > 1 ? "s" : ""}</span>}
        </CardTitle>
        <Button variant="ghost" size="sm" onClick={() => markAll.run(undefined as never)} disabled={unread === 0} loading={markAll.pending}>
          <CheckCheck /> Tout marquer comme lu
        </Button>
      </CardHeader>
      {items.length === 0 ? (
        <EmptyState icon={<Bell />} title="Aucune notification" description="Les rappels d'échéance, validations et invitations apparaîtront ici." />
      ) : (
        <ul className="divide-y">
          {items.map((n) => {
            const meta = ICONS[n.type];
            return (
              <li key={n.id}>
                <button onClick={() => open(n)} className={cn("flex w-full items-start gap-3 px-4 py-3.5 text-left transition-colors hover:bg-muted/50 sm:px-5", !n.readAt && "bg-primary-soft/30")}>
                  <span className={cn("mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full [&_svg]:size-4", meta.cls)} aria-hidden>
                    {meta.icon}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className={cn("text-sm", n.readAt ? "font-medium" : "font-semibold")}>{n.title}</span>
                      {!n.readAt && <span className="size-2 rounded-full bg-primary" aria-label="Non lue" />}
                    </span>
                    <span className="mt-0.5 block text-sm text-muted-foreground">{n.message}</span>
                    <span className="mt-1 block text-xs text-muted-foreground">
                      {n.tontineName && <>{n.tontineName} · </>}
                      {timeAgo(n.createdAt)}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

export function InvitationsEmpty() {
  return (
    <p className="text-sm text-muted-foreground">
      Aucune invitation en attente. Pour créer votre propre tontine,{" "}
      <Link href="/tontines/new" className="font-medium text-primary hover:underline">
        c&apos;est ici
      </Link>
      .
    </p>
  );
}
