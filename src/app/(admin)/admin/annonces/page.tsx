import { Megaphone } from "lucide-react";
import type { Metadata } from "next";
import { AnnouncementToggle, NewAnnouncementButton, ANNOUNCEMENT_TONES } from "@/components/admin/announcements-admin";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState, PageHeader } from "@/components/ui/feedback";
import { guard } from "@/lib/auth/guard";
import { requireUser } from "@/lib/auth/session";
import { platformCan } from "@/lib/permissions/platform";
import { formatDate, formatDateTime } from "@/lib/utils/dates";
import { platformRoleOf } from "@/modules/admin/admin.service";
import { listAnnouncements } from "@/modules/admin/support.service";
import { ctxFor } from "@/server/context";

export const metadata: Metadata = { title: "Annonces" };

export default async function AdminAnnouncementsPage() {
  const user = await requireUser("/admin/annonces");
  const items = guard(() => listAnnouncements(ctxFor(user.id)));
  const canManage = platformCan(platformRoleOf(user.id), "announcement.manage");
  const live = items.filter((a) => a.live).length;
  return (
    <>
      <PageHeader title="Annonces" description={`Bandeaux affichés à tous les clients connectés : ${live} visible${live > 1 ? "s" : ""} sur 3 au maximum.`} actions={canManage ? <NewAnnouncementButton /> : undefined} />
      <Card>
        {items.length === 0 ? (
          <EmptyState icon={<Megaphone />} title="Aucune annonce" description="Prévenez vos clients d'une maintenance ou d'une nouveauté : l'annonce s'affiche en haut de leur espace." />
        ) : (
          <ul className="divide-y">
            {items.map((a) => (
              <li key={a.id} className="flex flex-wrap items-start gap-3 px-4 py-4 sm:px-5">
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold">{a.title}</p>
                    <Badge tone="neutral">{ANNOUNCEMENT_TONES[a.tone]}</Badge>
                    {a.live ? <Badge tone="success" dot>Visible</Badge> : a.expired ? <Badge tone="warning" dot>Expirée</Badge> : <Badge tone="neutral" dot>Retirée</Badge>}
                  </div>
                  <p className="max-w-3xl leading-relaxed">{a.message}</p>
                  <p className="text-xs text-muted-foreground">
                    Publiée par {a.authorName} le {formatDateTime(a.createdAt)} · {a.endsAt ? `jusqu'au ${formatDate(a.endsAt.slice(0, 10))}` : "jusqu'au retrait manuel"}
                  </p>
                </div>
                {canManage && !a.expired && <AnnouncementToggle id={a.id} active={a.active} />}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
