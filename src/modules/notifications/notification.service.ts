import "server-only";
import { isoNow, type Ctx } from "@/server/context";
import { read, tx, type DbState } from "@/server/db/store";
import { notFound } from "@/server/errors";
import { newId } from "@/server/ids";
import type { Notification, NotificationType } from "@/types/domain";

export interface NotifyInput {
  userId: string;
  tontineId: string | null;
  type: NotificationType;
  title: string;
  message: string;
  resourceType?: string | null;
  resourceId?: string | null;
  /** Si fourni, une notification de même clé pour le même utilisateur n'est jamais recréée. */
  dedupeKey?: string | null;
}

/** Crée une notification interne (dans la transaction appelante). Renvoie false si doublon. */
export function notify(s: DbState, ctx: Ctx, input: NotifyInput): boolean {
  if (input.dedupeKey && s.notifications.some((n) => n.userId === input.userId && n.dedupeKey === input.dedupeKey)) return false;
  s.notifications.push({
    id: newId(),
    userId: input.userId,
    tontineId: input.tontineId,
    type: input.type,
    title: input.title,
    message: input.message,
    resourceType: input.resourceType ?? null,
    resourceId: input.resourceId ?? null,
    dedupeKey: input.dedupeKey ?? null,
    readAt: null,
    createdAt: isoNow(ctx),
  });
  // Phase backend : enfiler ici l'e-mail transactionnel correspondant (outbox).
  return true;
}

export type NotificationView = Notification & { tontineName: string | null; href: string | null };

export function hrefFor(n: Pick<Notification, "type" | "tontineId">): string | null {
  if (n.type === "INVITATION_RECEIVED") return "/alerts#invitations";
  if (!n.tontineId) return null;
  if (n.type.startsWith("PAYMENT") || n.type.startsWith("DUE")) return `/tontines/${n.tontineId}/payments`;
  if (n.type === "ROTATION_SOON") return `/tontines/${n.tontineId}/rotations`;
  if (n.type.startsWith("INVITATION")) return `/tontines/${n.tontineId}/members`;
  return `/tontines/${n.tontineId}`;
}

export function listNotifications(ctx: Ctx, limit = 100): NotificationView[] {
  return read((s) =>
    s.notifications
      .filter((n) => n.userId === ctx.userId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, limit)
      .map((n) => ({ ...n, tontineName: s.tontines.find((t) => t.id === n.tontineId)?.name ?? null, href: hrefFor(n) })),
  );
}

export function unreadCount(ctx: Ctx): number {
  return read((s) => s.notifications.filter((n) => n.userId === ctx.userId && !n.readAt).length);
}

export function markRead(ctx: Ctx, notificationId: string) {
  tx((s) => {
    // Filtre sur userId : impossible de marquer la notification d'un autre utilisateur.
    const n = s.notifications.find((x) => x.id === notificationId && x.userId === ctx.userId);
    if (!n) throw notFound("Notification introuvable.");
    n.readAt ??= isoNow(ctx);
  });
}

export function markAllRead(ctx: Ctx) {
  tx((s) => {
    for (const n of s.notifications) if (n.userId === ctx.userId && !n.readAt) n.readAt = isoNow(ctx);
  });
}
