import type { Metadata } from "next";
import { InvitationCard, InvitationsEmpty, NotificationList } from "@/components/shared/alerts-client";
import { PageHeader } from "@/components/ui/feedback";
import { requireUser } from "@/lib/auth/session";
import { listMyInvitations } from "@/modules/invitations/invitation.service";
import { listNotifications } from "@/modules/notifications/notification.service";
import { ctxFor } from "@/server/context";

export const metadata: Metadata = { title: "Alertes" };

export default async function AlertsPage() {
  const user = await requireUser("/alerts");
  const ctx = ctxFor(user.id);
  const invitations = listMyInvitations(ctx);
  const notifications = listNotifications(ctx).map(({ id, type, title, message, tontineName, href, readAt, createdAt }) => ({ id, type, title, message, tontineName, href, readAt, createdAt }));

  return (
    <>
      <PageHeader title="Alertes" description="Invitations, rappels d'échéance et suivi de vos paiements." />
      <section id="invitations" aria-labelledby="invitations-title" className="mb-6 scroll-mt-20 space-y-3">
        <h2 id="invitations-title" className="text-base font-semibold">
          Invitations {invitations.length > 0 && <span className="text-muted-foreground">({invitations.length})</span>}
        </h2>
        {invitations.length === 0 ? (
          <InvitationsEmpty />
        ) : (
          <ul className="space-y-3">
            {invitations.map((inv) => (
              <InvitationCard key={inv.id} inv={inv} />
            ))}
          </ul>
        )}
      </section>
      <NotificationList items={notifications} />
    </>
  );
}
