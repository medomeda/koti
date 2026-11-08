import "server-only";
import { audit } from "@/modules/audit/audit.service";
import { isoNow, requirePlatform, type Ctx } from "@/server/context";
import { read, tx, type DbState } from "@/server/db/store";
import { conflict, notFound } from "@/server/errors";
import { newId } from "@/server/ids";
import type { Announcement, AnnouncementTone, ContactRequest } from "@/types/domain";

/**
 * Étape 4 du chantier SaaS : traitement des messages de contact, annonces aux clients et journal d'audit de l'équipe.
 * Toute action est auditée (`admin.*`) avec son auteur ; le journal n'expose que des actions de la plateforme.
 */

const nameOf = (s: Readonly<DbState>, userId: string) => s.userProfiles.find((p) => p.userId === userId)?.fullName ?? "Système";

/* ------------------------------------------------------------------ Messages de contact */

export type ContactRequestView = ContactRequest & { handledByName: string | null };

export function listContactRequestsDetailed(ctx: Ctx, f: { status?: "NEW" | "HANDLED" } = {}): ContactRequestView[] {
  return read((s) => {
    requirePlatform(s, ctx, "admin.view");
    return s.contactRequests
      .filter((c) => !f.status || c.status === f.status)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((c) => ({ ...c, handledByName: c.handledBy ? nameOf(s, c.handledBy) : null }));
  });
}

function findRequest(s: DbState, id: string): ContactRequest {
  const c = s.contactRequests.find((x) => x.id === id);
  if (!c) throw notFound("Message introuvable.");
  return c;
}

/** Marque un message comme traité, avec la réponse apportée (facultative en démonstration : aucun e-mail réel n'est envoyé). */
export function handleContactRequest(ctx: Ctx, input: { id: string; reply: string }) {
  tx((s) => {
    requirePlatform(s, ctx, "message.handle");
    const c = findRequest(s, input.id);
    if (c.status === "HANDLED") throw conflict("Ce message est déjà traité.");
    c.status = "HANDLED";
    c.handledBy = ctx.userId;
    c.handledAt = isoNow(ctx);
    c.reply = input.reply || undefined;
    audit(s, ctx, { tontineId: null, action: "admin.message.handle", entityType: "contactRequest", entityId: c.id, oldValues: { status: "NEW" }, newValues: { status: "HANDLED" }, reason: input.reply || null });
  });
}

export function reopenContactRequest(ctx: Ctx, input: { id: string; reason: string }) {
  tx((s) => {
    requirePlatform(s, ctx, "message.handle");
    const c = findRequest(s, input.id);
    if (c.status === "NEW") throw conflict("Ce message est déjà à traiter.");
    c.status = "NEW";
    delete c.handledBy;
    delete c.handledAt;
    delete c.reply;
    audit(s, ctx, { tontineId: null, action: "admin.message.reopen", entityType: "contactRequest", entityId: c.id, oldValues: { status: "HANDLED" }, newValues: { status: "NEW" }, reason: input.reason });
  });
}

/* ------------------------------------------------------------------ Annonces */

const isLive = (a: Announcement, nowIso: string) => a.active && (a.endsAt === null || a.endsAt > nowIso);

/** Annonces à afficher aux clients connectés (la plus récente en premier, 3 au plus). Ne requiert aucun rôle : c'est public pour tout compte connecté. */
export function activeAnnouncements(now = new Date()): Pick<Announcement, "id" | "title" | "message" | "tone">[] {
  const nowIso = now.toISOString();
  return read((s) =>
    s.announcements
      .filter((a) => isLive(a, nowIso))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, 3)
      .map(({ id, title, message, tone }) => ({ id, title, message, tone })),
  );
}

export function listAnnouncements(ctx: Ctx) {
  return read((s) => {
    requirePlatform(s, ctx, "admin.view");
    const nowIso = ctx.now.toISOString();
    return [...s.announcements]
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((a) => ({ ...a, live: isLive(a, nowIso), expired: a.endsAt !== null && a.endsAt <= nowIso, authorName: nameOf(s, a.createdBy) }));
  });
}

export function createAnnouncement(ctx: Ctx, input: { title: string; message: string; tone: AnnouncementTone; endsAt: string | null }) {
  tx((s) => {
    requirePlatform(s, ctx, "announcement.manage");
    if (input.endsAt && input.endsAt <= ctx.now.toISOString()) throw conflict("La date de fin doit être dans le futur.");
    if (s.announcements.filter((a) => isLive(a, ctx.now.toISOString())).length >= 3) throw conflict("Trois annonces sont déjà affichées. Retirez-en une avant d'en publier une nouvelle.");
    const a: Announcement = { id: newId(), title: input.title, message: input.message, tone: input.tone, active: true, endsAt: input.endsAt, createdBy: ctx.userId, createdAt: isoNow(ctx) };
    s.announcements.push(a);
    audit(s, ctx, { tontineId: null, action: "admin.announcement.create", entityType: "announcement", entityId: a.id, newValues: { title: a.title, tone: a.tone, endsAt: a.endsAt } });
  });
}

export function setAnnouncementActive(ctx: Ctx, input: { id: string; active: boolean }) {
  tx((s) => {
    requirePlatform(s, ctx, "announcement.manage");
    const a = s.announcements.find((x) => x.id === input.id);
    if (!a) throw notFound("Annonce introuvable.");
    if (a.active === input.active) throw conflict(input.active ? "Cette annonce est déjà publiée." : "Cette annonce est déjà retirée.");
    if (input.active) {
      if (a.endsAt && a.endsAt <= ctx.now.toISOString()) throw conflict("Cette annonce est expirée : créez-en une nouvelle.");
      if (s.announcements.filter((x) => isLive(x, ctx.now.toISOString())).length >= 3) throw conflict("Trois annonces sont déjà affichées. Retirez-en une avant d'en republier.");
    }
    a.active = input.active;
    audit(s, ctx, { tontineId: null, action: input.active ? "admin.announcement.publish" : "admin.announcement.unpublish", entityType: "announcement", entityId: a.id, oldValues: { active: !input.active }, newValues: { active: input.active, title: a.title } });
  });
}

/* ------------------------------------------------------------------ Journal d'audit de la plateforme */

export const AUDIT_CATEGORIES = {
  clients: { label: "Comptes clients", prefixes: ["admin.user.", "admin.subscription.", "admin.trial.", "admin.note."] },
  offres: { label: "Offres", prefixes: ["admin.plan."] },
  messages: { label: "Messages", prefixes: ["admin.message."] },
  annonces: { label: "Annonces", prefixes: ["admin.announcement."] },
} as const;
export type AuditCategory = keyof typeof AUDIT_CATEGORIES;

const PAGE_SIZE = 25;

export function listPlatformAudit(ctx: Ctx, f: { category?: AuditCategory; actorId?: string; page?: number } = {}) {
  return read((s) => {
    requirePlatform(s, ctx, "admin.view");
    const prefixes: readonly string[] | null = f.category ? AUDIT_CATEGORIES[f.category].prefixes : null;
    const all = s.auditLogs.filter((a) => a.action.startsWith("admin.") && (!prefixes || prefixes.some((p) => a.action.startsWith(p))) && (!f.actorId || a.actorId === f.actorId));
    const sorted = all.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const pages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
    const page = Math.min(Math.max(1, f.page ?? 1), pages);
    const targetName = (a: (typeof sorted)[number]): string | null => {
      if (a.entityType === "user" && a.entityId) return nameOf(s, a.entityId);
      if (a.entityType === "subscription") {
        const uid = (a.newValues as { userId?: string } | null)?.userId ?? s.subscriptions.find((x) => x.id === a.entityId)?.userId;
        return uid ? nameOf(s, uid) : null;
      }
      if (a.entityType === "contactRequest") return s.contactRequests.find((c) => c.id === a.entityId)?.name ?? null;
      if (a.entityType === "announcement") return s.announcements.find((x) => x.id === a.entityId)?.title ?? null;
      if (a.entityType === "plan") return a.entityId;
      return null;
    };
    const staff = s.users.filter((u) => u.platformRole !== "USER").map((u) => ({ id: u.id, name: nameOf(s, u.id) }));
    return {
      total: sorted.length,
      page,
      pages,
      staff,
      rows: sorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE).map((a) => ({ id: a.id, at: a.createdAt, action: a.action, actorName: nameOf(s, a.actorId), target: targetName(a), reason: a.reason, before: a.oldValues, after: a.newValues })),
    };
  });
}
