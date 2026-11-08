import type { ReactNode } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { DemoBanner } from "@/components/layout/demo-banner";
import { isDemoMode } from "@/lib/demo";
import { requireUser } from "@/lib/auth/session";
import { AnnouncementBanner } from "@/components/layout/announcement-banner";
import { ctxFor } from "@/server/context";
import { activeAnnouncements, listMyObligations, runScheduledJobs, syncUserTontines, unreadCount } from "@/server/pg/services";

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  // Garde serveur : la page n'est jamais rendue sans session valide.
  const user = await requireUser();
  const ctx = ctxFor(user.id);
  // Phase frontend : rattrapage des tâches planifiées (verrou horaire, idempotent). En production : cron.
  (await runScheduledJobs());
  (await syncUserTontines(ctx));
  const { toPay } = (await listMyObligations(ctx));
  return (
    <AppShell user={{ fullName: user.fullName, email: user.email, avatarUrl: user.avatarUrl }} unread={(await unreadCount(ctx))} pendingPayments={toPay.filter((o) => o.canDeclare).length} banner={
        <>
          {isDemoMode() && <DemoBanner />}
          <AnnouncementBanner items={(await activeAnnouncements())} />
        </>
      }
    >
      {children}
    </AppShell>
  );
}
