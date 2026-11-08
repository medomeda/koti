import { notFound } from "next/navigation";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { AdminShell } from "@/components/admin/admin-shell";
import { DemoBanner } from "@/components/layout/demo-banner";
import { requireStaff } from "@/lib/auth/session";
import { isDemoMode } from "@/lib/demo";
import { ctxFor } from "@/server/context";
import { countNewMessages, platformRoleOf, runScheduledJobs } from "@/server/pg/services";

export const metadata: Metadata = { title: { default: "Administration", template: "%s · Administration KOTI" }, robots: { index: false, follow: false } };

export default async function AdminLayout({ children }: { children: ReactNode }) {
  // Garde serveur : sans session → connexion ; connecté mais hors équipe KOTI → page introuvable (on ne révèle pas /admin).
  const user = await requireStaff("/admin");
  const role = (await platformRoleOf(user.id));
  if (!role) notFound();
  (await runScheduledJobs()); // rattrapage horaire (facturation simulée, rappels) comme dans l'espace client
  return (
    <AdminShell user={{ fullName: user.fullName, email: user.email }} role={role} newMessages={(await countNewMessages(ctxFor(user.id)))} banner={isDemoMode() ? <DemoBanner /> : undefined}>
      {children}
    </AdminShell>
  );
}
