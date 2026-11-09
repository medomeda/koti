import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import * as webpush from "web-push";
import { hrefFor } from "@/modules/notifications/notification.service";
import { getDb, type Db } from "@/server/db/client";
import { pushPreferences, pushSubscriptions } from "@/server/db/schema";
import type { Ctx } from "@/server/context";
import { AppError } from "@/server/errors";
import type { Notification, NotificationType } from "@/types/domain";
import { logError } from "@/server/log";

/**
 * Notifications push (Web Push, clés VAPID). Elles doublent les notifications internes (l'application reste la
 * référence) : un échec d'envoi ne bloque jamais l'opération métier.
 *
 * Confidentialité : le texte affiché sur l'écran verrouillé est GÉNÉRIQUE (jamais de montant, de nom de tontine ni de
 * personne) ; le détail se lit dans l'application, après connexion. Le contenu est de toute façon chiffré de bout en bout
 * entre le serveur et l'appareil.
 */
export const PUSH_CATEGORIES = {
  echeances: { label: "Échéances et retards", description: "Rappel avant l'échéance d'une cotisation, et alerte en cas de retard.", types: ["DUE_SOON", "DUE_OVERDUE"] },
  paiements: { label: "Paiements", description: "Déclaration à valider (administrateurs), paiement validé ou refusé.", types: ["PAYMENT_DECLARED", "PAYMENT_VALIDATED", "PAYMENT_REJECTED"] },
  tontines: { label: "Tontines", description: "Invitations reçues et réponses, tour de main qui approche.", types: ["INVITATION_RECEIVED", "INVITATION_ACCEPTED", "INVITATION_REFUSED", "ROTATION_SOON"] },
} as const satisfies Record<string, { label: string; description: string; types: readonly NotificationType[] }>;

export type PushCategory = keyof typeof PUSH_CATEGORIES;
export const ALL_CATEGORIES = Object.keys(PUSH_CATEGORIES) as PushCategory[];

export function categoryOf(type: NotificationType): PushCategory {
  return ALL_CATEGORIES.find((c) => (PUSH_CATEGORIES[c].types as readonly NotificationType[]).includes(type))!;
}

const TEXT: Record<NotificationType, { title: string; body: string }> = {
  INVITATION_RECEIVED: { title: "Nouvelle invitation", body: "Vous avez été invité(e) à rejoindre une tontine." },
  INVITATION_ACCEPTED: { title: "Invitation acceptée", body: "Une personne a rejoint votre tontine." },
  INVITATION_REFUSED: { title: "Invitation refusée", body: "Une invitation a été refusée." },
  DUE_SOON: { title: "Échéance à venir", body: "Une cotisation est bientôt due. Ouvrez KOTI pour les détails." },
  DUE_OVERDUE: { title: "Cotisation en retard", body: "Une cotisation est en retard. Ouvrez KOTI pour les détails." },
  PAYMENT_DECLARED: { title: "Paiement à valider", body: "Un membre a déclaré un paiement." },
  PAYMENT_VALIDATED: { title: "Paiement validé", body: "Votre paiement a été validé." },
  PAYMENT_REJECTED: { title: "Paiement refusé", body: "Votre déclaration a été refusée. Ouvrez KOTI pour en voir le motif." },
  ROTATION_SOON: { title: "Votre tour de main approche", body: "Ouvrez KOTI pour voir la date." },
};

export interface PushPayload {
  title: string;
  body: string;
  /** Chemin interne ouvert au clic. */
  url: string;
  /** Regroupe les notifications d'un même sujet sur l'appareil. */
  tag: string;
}

export const payloadFor = (n: Pick<Notification, "id" | "type" | "tontineId">): PushPayload => ({ ...TEXT[n.type], url: hrefFor(n) ?? "/alerts", tag: `koti-${n.id}` });

/* ------------------------------------------------------------------ Configuration et envoi */

export const vapidPublicKey = () => process.env.VAPID_PUBLIC_KEY || null;
export const pushConfigured = () => Boolean(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);

type Target = { endpoint: string; keys: { p256dh: string; auth: string } };
type Sender = (target: Target, payload: string) => Promise<unknown>;

let vapidReady = false;
const realSender: Sender = (target, payload) => {
  if (!vapidReady) {
    webpush.setVapidDetails(process.env.VAPID_SUBJECT || "mailto:contact@koti.app", process.env.VAPID_PUBLIC_KEY!, process.env.VAPID_PRIVATE_KEY!);
    vapidReady = true;
  }
  return webpush.sendNotification(target, payload, { TTL: 24 * 3600, urgency: "normal" });
};
let sender: Sender = realSender;
/** Tests : remplace l'envoi réel (null = envoi réel). */
export function setPushSender(fn: Sender | null) {
  sender = fn ?? realSender;
}

/* ------------------------------------------------------------------ Abonnements et préférences */

export interface SubscriptionInput {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

export async function savePushSubscription(ctx: Ctx, input: SubscriptionInput, userAgent: string | null, db: Db = getDb()): Promise<void> {
  if (!pushConfigured()) throw new AppError("INVALID_STATE", "Les notifications push ne sont pas activées sur cette instance.");
  // Un appareil = un abonnement : si une autre personne s'y connecte, la ligne lui est réattribuée.
  await db
    .insert(pushSubscriptions)
    .values({ userId: ctx.userId, endpoint: input.endpoint, p256dh: input.keys.p256dh, auth: input.keys.auth, userAgent: userAgent?.slice(0, 300) ?? null })
    .onConflictDoUpdate({ target: pushSubscriptions.endpoint, set: { userId: ctx.userId, p256dh: input.keys.p256dh, auth: input.keys.auth, userAgent: userAgent?.slice(0, 300) ?? null } });
}

export async function removePushSubscription(ctx: Ctx, endpoint: string, db: Db = getDb()): Promise<void> {
  await db.delete(pushSubscriptions).where(and(eq(pushSubscriptions.userId, ctx.userId), eq(pushSubscriptions.endpoint, endpoint)));
}

export async function getPushState(userId: string, db: Db = getDb()) {
  const subs = await db.select({ endpoint: pushSubscriptions.endpoint }).from(pushSubscriptions).where(eq(pushSubscriptions.userId, userId));
  const [prefs] = await db.select().from(pushPreferences).where(eq(pushPreferences.userId, userId));
  return { available: pushConfigured(), devices: subs.length, endpoints: subs.map((s) => s.endpoint), categories: (prefs?.categories ?? ALL_CATEGORIES) as PushCategory[] };
}

export async function setPushCategories(ctx: Ctx, categories: PushCategory[], db: Db = getDb()): Promise<void> {
  const valid = ALL_CATEGORIES.filter((c) => categories.includes(c));
  await db.insert(pushPreferences).values({ userId: ctx.userId, categories: valid }).onConflictDoUpdate({ target: pushPreferences.userId, set: { categories: valid } });
}

/* ------------------------------------------------------------------ Envoi */

async function sendToSubscriptions(subs: Array<typeof pushSubscriptions.$inferSelect>, payload: PushPayload, db: Db): Promise<{ sent: number; removed: number }> {
  const body = JSON.stringify(payload);
  let sent = 0;
  const dead: string[] = [];
  const ok: string[] = [];
  for (let i = 0; i < subs.length; i += 10) {
    await Promise.allSettled(
      subs.slice(i, i + 10).map(async (s) => {
        try {
          await sender({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, body);
          sent++;
          ok.push(s.id);
        } catch (err) {
          const status = (err as { statusCode?: number }).statusCode;
          if (status === 404 || status === 410) dead.push(s.id); // abonnement expiré ou révoqué : on l'oublie
          else logError("push", err, { status }, { message: "envoi d'une notification push en échec" });
        }
      }),
    );
  }
  if (dead.length) await db.delete(pushSubscriptions).where(inArray(pushSubscriptions.id, dead));
  if (ok.length) await db.update(pushSubscriptions).set({ lastSuccessAt: new Date() }).where(inArray(pushSubscriptions.id, ok));
  return { sent, removed: dead.length };
}

/** Envoie les push correspondant à des notifications internes qui viennent d'être créées (après validation de la transaction). */
export async function deliverPush(notifications: Array<Pick<Notification, "id" | "userId" | "type" | "tontineId">>, db: Db = getDb()): Promise<number> {
  if (notifications.length === 0 || !pushConfigured()) return 0;
  const userIds = [...new Set(notifications.map((n) => n.userId))];
  const subs = await db.select().from(pushSubscriptions).where(inArray(pushSubscriptions.userId, userIds));
  if (subs.length === 0) return 0;
  const prefs = new Map((await db.select().from(pushPreferences).where(inArray(pushPreferences.userId, userIds))).map((p) => [p.userId, p.categories]));
  let total = 0;
  for (const n of notifications) {
    const wanted = (prefs.get(n.userId) ?? ALL_CATEGORIES) as string[];
    if (!wanted.includes(categoryOf(n.type))) continue;
    const mine = subs.filter((s) => s.userId === n.userId);
    if (mine.length) total += (await sendToSubscriptions(mine, payloadFor(n), db)).sent;
  }
  return total;
}

/** Notification de test envoyée à tous les appareils de l'utilisateur (bouton du profil). */
export async function sendTestPush(ctx: Ctx, db: Db = getDb()): Promise<number> {
  if (!pushConfigured()) throw new AppError("INVALID_STATE", "Les notifications push ne sont pas activées sur cette instance.");
  const subs = await db.select().from(pushSubscriptions).where(eq(pushSubscriptions.userId, ctx.userId));
  if (subs.length === 0) throw new AppError("INVALID_STATE", "Aucun appareil n'est enregistré pour ce compte.");
  const { sent } = await sendToSubscriptions(subs, { title: "Notifications activées", body: "KOTI peut maintenant vous prévenir sur cet appareil.", url: "/profile", tag: "koti-test" }, db);
  if (sent === 0) throw new AppError("INVALID_STATE", "L'envoi a échoué. Désactivez puis réactivez les notifications sur cet appareil.");
  return sent;
}
