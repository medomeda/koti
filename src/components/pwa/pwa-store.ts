"use client";

import { disablePush } from "./push-client";

import { useSyncExternalStore } from "react";

/**
 * État d'installation de la PWA, partagé entre le gestionnaire (qui capte l'événement du navigateur)
 * et les boutons « Installer » affichés dans l'interface.
 */
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export type InstallMode = "prompt" | "ios" | "installed" | "unsupported";

let deferred: BeforeInstallPromptEvent | null = null;
let installed = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function captureInstallPrompt(e: Event) {
  e.preventDefault(); // on garde la main : l'invite s'affiche quand l'utilisateur clique sur « Installer »
  deferred = e as BeforeInstallPromptEvent;
  emit();
}

export function markInstalled() {
  installed = true;
  deferred = null;
  emit();
}

function isStandalone() {
  return window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

function isIos() {
  const ua = navigator.userAgent;
  return /iPhone|iPad|iPod/.test(ua) || (ua.includes("Macintosh") && navigator.maxTouchPoints > 1);
}

function getMode(): InstallMode {
  if (installed || isStandalone()) return "installed";
  if (deferred) return "prompt";
  if (isIos()) return "ios";
  return "unsupported";
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

export function useInstallMode(): InstallMode {
  return useSyncExternalStore(subscribe, getMode, () => "unsupported");
}

/** Affiche l'invite d'installation native (Android / Chrome / Edge). */
export async function promptInstall(): Promise<boolean> {
  if (!deferred) return false;
  const e = deferred;
  deferred = null;
  emit();
  await e.prompt();
  const { outcome } = await e.userChoice;
  if (outcome === "accepted") markInstalled();
  return outcome === "accepted";
}

const DISMISS_KEY = "koti:install-card-dismissed";

function readDismissed() {
  try {
    return localStorage.getItem(DISMISS_KEY) === "1";
  } catch {
    return false;
  }
}

/** La carte d'installation de l'accueil a-t-elle été masquée par l'utilisateur ? (true côté serveur : rien à afficher) */
export function useInstallCardDismissed(): boolean {
  return useSyncExternalStore(subscribe, readDismissed, () => true);
}

export function dismissInstallCard() {
  try {
    localStorage.setItem(DISMISS_KEY, "1");
  } catch {
    /* stockage indisponible : la carte reviendra à la prochaine visite */
  }
  emit();
}

/**
 * À la déconnexion : rien ne doit rester sur un appareil partagé. On retire donc l'abonnement push de l'appareil
 * (il ne recevrait sinon plus que les notifications de l'ancien compte) puis on vide les caches de l'application.
 */
export async function clearAppCaches() {
  await disablePush();
  try {
    if (!("caches" in window)) return;
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k.startsWith("koti-")).map((k) => caches.delete(k)));
  } catch {
    // Sans conséquence : le cache ne contient de toute façon aucune donnée personnelle.
  }
}
