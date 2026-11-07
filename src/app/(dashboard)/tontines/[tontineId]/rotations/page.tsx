import { Gift, Repeat } from "lucide-react";
import type { Metadata } from "next";
import { RotationEditor } from "@/components/shared/rotation-editor";
import { RotationStatusBadge } from "@/components/shared/status";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/feedback";
import { Avatar } from "@/components/ui/misc";
import { guard } from "@/lib/auth/guard";
import { requireUser } from "@/lib/auth/session";
import { cn } from "@/lib/utils/cn";
import { formatDate, relativeDays, todayISO } from "@/lib/utils/dates";
import { formatFCFA } from "@/lib/utils/money";
import { dueDateForPeriod } from "@/modules/contributions/frequency";
import { listRotation } from "@/modules/rotations/rotation.service";
import { ctxFor } from "@/server/context";

export const metadata: Metadata = { title: "Tours de main" };

export default async function RotationsPage({ params }: { params: Promise<{ tontineId: string }> }) {
  const { tontineId } = await params;
  const user = await requireUser();
  const { tontine, role, rows, mySlots } = guard(() => listRotation(ctxFor(user.id), tontineId));
  const today = todayISO();
  const active = rows.filter((r) => r.status !== "CANCELLED");
  const cancelled = rows.filter((r) => r.status === "CANCELLED");
  const canEdit = role === "ADMIN" && tontine.status !== "COMPLETED" && tontine.status !== "CANCELLED";
  const dates = Object.fromEntries(active.map((r) => [r.position, dueDateForPeriod(tontine.frequency, tontine.startDate, r.position, tontine.frequencyConfig)]));

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start">
      <Card>
        <CardHeader>
          <div>
            <CardTitle>Calendrier des distributions</CardTitle>
            <p className="mt-0.5 text-sm text-muted-foreground">Le bénéficiaire de la position n reçoit la cagnotte à l&apos;échéance n. KOTI ne transfère aucun fonds.</p>
          </div>
        </CardHeader>
        {active.length === 0 ? (
          <EmptyState icon={<Repeat />} title="Aucun tour défini" />
        ) : (
          <ol className="divide-y">
            {active.map((r) => (
              <li key={r.slotId} className={cn("flex items-center gap-3 px-4 py-3 sm:px-5", r.status === "CURRENT" && "bg-primary-soft/50", r.isMe && "ring-1 ring-inset ring-primary/30")}>
                <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold tabular-nums", r.status === "COMPLETED" ? "bg-primary text-white" : r.status === "CURRENT" ? "bg-primary-soft text-primary-soft-foreground ring-2 ring-primary" : "bg-muted text-muted-foreground")}>
                  {r.position}
                </span>
                <Avatar name={r.name} src={r.avatarUrl} className="size-9" />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">
                    {r.name} {r.isMe && <span className="font-normal text-primary">(vous)</span>}
                    <span className="ml-1.5 rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">{r.ticketLabel}</span>
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {r.scheduledDate ? (
                      <>
                        {formatDate(r.scheduledDate)}
                        {r.status !== "COMPLETED" && <span className="text-xs"> · {relativeDays(r.scheduledDate, today)}</span>}
                      </>
                    ) : (
                      "Date à définir"
                    )}
                  </p>
                </div>
                <div className="hidden text-right text-sm tabular-nums text-muted-foreground sm:block">{formatFCFA(r.potAmount)}</div>
                <RotationStatusBadge status={r.status} />
              </li>
            ))}
          </ol>
        )}
        {cancelled.length > 0 && (
          <CardContent className="border-t">
            <p className="text-xs font-medium text-muted-foreground">Tours annulés (membres retirés)</p>
            <ul className="mt-2 flex flex-wrap gap-2">
              {cancelled.map((r) => (
                <li key={r.slotId} className="rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground line-through">
                  {r.name} · {r.ticketLabel}
                </li>
              ))}
            </ul>
          </CardContent>
        )}
      </Card>

      <div className="space-y-5">
        <Card className={cn(mySlots.length > 0 && "border-primary/30")}>
          <CardContent className="flex items-center gap-3">
            <span className="flex size-11 items-center justify-center rounded-full bg-primary-soft text-primary [&_svg]:size-5">
              <Gift aria-hidden />
            </span>
            <div>
              <p className="text-sm text-muted-foreground">{mySlots.length > 1 ? "Mes positions" : "Ma position"}</p>
              {mySlots.length > 0 ? (
                <ul className="space-y-1">
                  {mySlots.map((m) => (
                    <li key={m.slotId} className="font-semibold">
                      {m.position}
                      <sup>{m.position === 1 ? "re" : "e"}</sup> sur {active.length} <span className="text-sm font-normal text-muted-foreground">· {m.ticketLabel}</span>
                      {m.scheduledDate && <span className="block text-sm font-normal text-muted-foreground">{formatDate(m.scheduledDate)}</span>}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="font-medium">Aucun tour attribué</p>
              )}
            </div>
          </CardContent>
        </Card>

        {canEdit && (
          <Card>
            <CardHeader>
              <div>
                <CardTitle>Organiser l&apos;ordre</CardTitle>
                <p className="mt-0.5 text-sm text-muted-foreground">Réservé à l&apos;administrateur.</p>
              </div>
            </CardHeader>
            <CardContent>
              <RotationEditor
                key={active.map((r) => `${r.ticketId}:${r.position}`).join(",")}
                tontineId={tontine.id}
                started={tontine.status !== "DRAFT"}
                dates={dates}
                rows={active.map((r) => ({ ticketId: r.ticketId, ticketLabel: r.ticketLabel, name: r.name, avatarUrl: r.avatarUrl, position: r.position, status: r.status, isMe: r.isMe }))}
              />
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
