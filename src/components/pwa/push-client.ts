"use client";

import { removePushSubscriptionAction, savePushSubscriptionAction } from "@/actions/push";

/** Côté navigateur des notifications push : abonnement, désabonnement, état de l'appareil. */
export type PushSupport = "ok" | "ios-not-installed" | "no-service-worker" | "unsupported";

const isIos = () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.userAgent.includes("Macintosh") && navigator.maxTouchPoints > 1);
const isStandalone = () => window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;

export async function pushSupport(): Promise<PushSupport> {
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) return isIos() && !isStandalone() ? "ios-not-installed" : "unsupported";
  // Le service worker n'est enregistré qu'en production : sans lui, aucun push possible.
  return (await navigator.serviceWorker.getRegistration()) ? "ok" : "no-service-worker";
}

function toKey(base64: string): Uint8Array<ArrayBuffer> {
  const padded = base64.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob(padded);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

export async function currentEndpoint(): Promise<string | null> {
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    return (await reg?.pushManager.getSubscription())?.endpoint ?? null;
  } catch {
    return null;
  }
}

/** Demande l'autorisation (sur clic uniquement), s'abonne, puis enregistre l'appareil côté serveur. */
export async function enablePush(publicKey: string): Promise<{ ok: true } | { ok: false; reason: "denied" | "failed"; message: string }> {
  const permission = await Notification.requestPermission();
  if (permission !== "granted") return { ok: false, reason: "denied", message: "Autorisation refusée. Vous pouvez la modifier dans les réglages du navigateur." };
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: toKey(publicKey) }));
    const json = sub.toJSON();
    const res = await savePushSubscriptionAction({ endpoint: sub.endpoint, keys: { p256dh: json.keys?.p256dh, auth: json.keys?.auth } });
    if (!res.ok) return { ok: false, reason: "failed", message: res.error };
    return { ok: true };
  } catch (err) {
    return { ok: false, reason: "failed", message: err instanceof Error ? err.message : "L'abonnement a échoué." };
  }
}

/** Retire l'appareil du serveur puis se désabonne du navigateur. Sans erreur si rien n'est enregistré. */
export async function disablePush(): Promise<void> {
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = await reg?.pushManager.getSubscription();
    if (!sub) return;
    await removePushSubscriptionAction({ endpoint: sub.endpoint });
    await sub.unsubscribe();
  } catch {
    /* sans conséquence : l'abonnement serveur sera purgé au prochain échec d'envoi */
  }
}
