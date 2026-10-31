import "server-only";
import { isoNow, requireAccess, type Ctx } from "@/server/context";
import { read, type DbState } from "@/server/db/store";
import { newId } from "@/server/ids";
import type { AuditLog } from "@/types/domain";

/** Journal append-only des opérations sensibles (PRD §7.4). Appelé DANS la transaction métier. */
export function audit(
  s: DbState,
  ctx: Ctx,
  entry: { tontineId: string | null; action: string; entityType: string; entityId: string | null; oldValues?: Record<string, unknown> | null; newValues?: Record<string, unknown> | null; reason?: string | null },
) {
  s.auditLogs.push({
    id: newId(),
    actorId: ctx.userId,
    tontineId: entry.tontineId,
    action: entry.action,
    entityType: entry.entityType,
    entityId: entry.entityId,
    oldValues: entry.oldValues ?? null,
    newValues: entry.newValues ?? null,
    reason: entry.reason ?? null,
    createdAt: isoNow(ctx),
  });
}

export type AuditEntryView = AuditLog & { actorName: string };

export function listTontineAudit(ctx: Ctx, tontineId: string, limit = 50): AuditEntryView[] {
  return read((s) => {
    requireAccess(s, ctx, tontineId, "audit.view");
    return s.auditLogs
      .filter((a) => a.tontineId === tontineId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, limit)
      .map((a) => ({ ...a, actorName: s.userProfiles.find((p) => p.userId === a.actorId)?.fullName ?? "Système" }));
  });
}
