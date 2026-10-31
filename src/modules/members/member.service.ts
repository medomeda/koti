import "server-only";
import { audit } from "@/modules/audit/audit.service";
import { effectiveObligationStatus } from "@/modules/contributions/contribution.service";
import { isoNow, requireAccess, today, type Ctx } from "@/server/context";
import { read, tx } from "@/server/db/store";
import { forbidden, invalidState, notFound } from "@/server/errors";
import type { MemberRole, MemberStatus } from "@/types/domain";

export interface MemberView {
  id: string;
  userId: string;
  name: string;
  avatarUrl: string | null;
  role: MemberRole;
  status: MemberStatus;
  joinedAt: string;
  isMe: boolean;
  /** Coordonnées et situation : visibles par l'administrateur uniquement. */
  email: string | null;
  phone: string | null;
  lateCount: number | null;
  rotationPosition: number | null;
}

export function listMembers(ctx: Ctx, tontineId: string, opts: { includeFormer?: boolean } = {}) {
  return read((s) => {
    const { tontine, member: me } = requireAccess(s, ctx, tontineId, "member.view");
    const isAdmin = me.role === "ADMIN";
    const t = today(ctx);
    const members: MemberView[] = s.tontineMembers
      .filter((m) => m.tontineId === tontineId && (opts.includeFormer || m.status === "ACTIVE"))
      .map((m) => {
        const profile = s.userProfiles.find((p) => p.userId === m.userId);
        const user = s.users.find((u) => u.id === m.userId);
        const slot = s.rotationSlots.find((r) => r.memberId === m.id && r.status !== "CANCELLED");
        return {
          id: m.id,
          userId: m.userId,
          name: profile?.fullName ?? "Membre",
          avatarUrl: profile?.avatarUrl ?? null,
          role: m.role,
          status: m.status,
          joinedAt: m.joinedAt,
          isMe: m.id === me.id,
          email: isAdmin ? (user?.email ?? null) : null,
          phone: isAdmin ? (profile?.phone ?? null) : null,
          lateCount: isAdmin ? s.contributionObligations.filter((o) => o.memberId === m.id && effectiveObligationStatus(o, t) === "LATE").length : null,
          rotationPosition: slot?.position ?? null,
        };
      })
      .sort((a, b) => (a.status === "ACTIVE" ? 0 : 1) - (b.status === "ACTIVE" ? 0 : 1) || (a.role === "ADMIN" ? -1 : 0) - (b.role === "ADMIN" ? -1 : 0) || a.name.localeCompare(b.name, "fr"));
    return { tontine, role: me.role, members };
  });
}

/**
 * Retrait d'un membre (PRD §6.15) : l'adhésion passe à REMOVED (jamais supprimée), l'historique
 * financier est conservé. Seules ses échéances futures non payées et sans déclaration sont
 * retirées, et son tour de main à venir est annulé.
 */
export function removeMember(ctx: Ctx, input: { tontineId: string; memberId: string; reason: string }) {
  tx((s) => {
    const { tontine, member: me } = requireAccess(s, ctx, input.tontineId, "member.remove");
    if (tontine.status === "COMPLETED" || tontine.status === "CANCELLED") throw invalidState("Une tontine clôturée est en lecture seule.");
    const target = s.tontineMembers.find((m) => m.id === input.memberId && m.tontineId === tontine.id);
    if (!target || target.status !== "ACTIVE") throw notFound("Membre introuvable.");
    if (target.id === me.id || target.role === "ADMIN") throw forbidden("L'administrateur ne peut pas être retiré.");

    const t = today(ctx);
    target.status = "REMOVED";
    const removable = new Set(
      s.contributionObligations
        .filter((o) => o.memberId === target.id && o.status === "PENDING" && o.dueDate > t && !s.payments.some((p) => p.obligationId === o.id))
        .map((o) => o.id),
    );
    s.contributionObligations = s.contributionObligations.filter((o) => !removable.has(o.id));
    for (const slot of s.rotationSlots) {
      if (slot.memberId === target.id && slot.status !== "CANCELLED" && (!slot.scheduledDate || slot.scheduledDate >= t)) {
        slot.status = "CANCELLED";
        slot.updatedAt = isoNow(ctx);
      }
    }
    audit(s, ctx, { tontineId: tontine.id, action: "member.remove", entityType: "member", entityId: target.id, oldValues: { status: "ACTIVE" }, newValues: { status: "REMOVED", removedFutureObligations: removable.size }, reason: input.reason });
  });
}
