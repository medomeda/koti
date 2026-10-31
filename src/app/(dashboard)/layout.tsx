import type { ReactNode } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { DemoBanner } from "@/components/layout/demo-banner";
import { isDemoMode } from "@/lib/demo";
import { requireUser } from "@/lib/auth/session";
import { unreadCount } from "@/modules/notifications/notification.service";
import { listMyObligations } from "@/modules/payments/payment.service";
import { syncUserTontines } from "@/modules/tontines/tontine.service";
import { ctxFor } from "@/server/context";
import { runScheduledJobs } from "@/server/jobs";

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  // Garde serveur : la page n'est jamais rendue sans session valide.
  const user = await requireUser();
  const ctx = ctxFor(user.id);
  // Phase frontend : rattrapage des tâches planifiées (verrou horaire, idempotent). En production : cron.
  runScheduledJobs();
  syncUserTontines(ctx);
  const { toPay } = listMyObligations(ctx);
  return (
    <AppShell user={{ fullName: user.fullName, email: user.email, avatarUrl: user.avatarUrl }} unread={unreadCount(ctx)} pendingPayments={toPay.filter((o) => o.canDeclare).length} banner={isDemoMode() ? <DemoBanner /> : undefined}>
      {children}
    </AppShell>
  );
}
