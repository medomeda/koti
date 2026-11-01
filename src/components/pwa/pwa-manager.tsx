"use client";

import { useEffect } from "react";
import { toast } from "sonner";
import { captureInstallPrompt, markInstalled } from "./pwa-store";

const UPDATE_CHECK_MS = 60 * 60 * 1000;
const UPDATE_TOAST_ID = "koti-update";

/**
 * Enregistre le service worker et gère le cycle de mise à jour :
 * 1. vérification à l'ouverture, au retour sur l'application et toutes les heures ;
 * 2. nouvelle version prête → message « Mettre à jour » (jamais de rechargement imposé :
 *    l'utilisateur peut être en train de saisir une déclaration) ;
 * 3. accord de l'utilisateur → activation de la nouvelle version puis rechargement unique.
 * Désactivé en développement (incompatible avec le rechargement à chaud).
 */
export function PwaManager() {
  useEffect(() => {
    window.addEventListener("beforeinstallprompt", captureInstallPrompt);
    window.addEventListener("appinstalled", markInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", captureInstallPrompt);
      window.removeEventListener("appinstalled", markInstalled);
    };
  }, []);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    if (process.env.NODE_ENV !== "production") {
      // Un service worker resté d'un test de production perturberait le développement.
      void navigator.serviceWorker.getRegistrations().then((regs) => regs.forEach((r) => void r.unregister()));
      return;
    }

    let userAccepted = false;
    let registration: ServiceWorkerRegistration | undefined;

    const offerUpdate = (worker: ServiceWorker) => {
      toast("Nouvelle version disponible", {
        id: UPDATE_TOAST_ID,
        description: "Mettez à jour pour profiter des dernières améliorations.",
        duration: Infinity,
        actionButtonStyle: { background: "var(--primary)", color: "var(--primary-foreground)" },
        action: {
          label: "Mettre à jour",
          onClick: () => {
            userAccepted = true;
            worker.postMessage({ type: "SKIP_WAITING" });
          },
        },
      });
    };

    const watch = (reg: ServiceWorkerRegistration) => {
      // Une version déjà téléchargée attend peut-être depuis la dernière visite.
      if (reg.waiting && navigator.serviceWorker.controller) offerUpdate(reg.waiting);
      reg.addEventListener("updatefound", () => {
        const worker = reg.installing;
        worker?.addEventListener("statechange", () => {
          // « installed » + contrôleur existant = mise à jour (et non première installation).
          if (worker.state === "installed" && navigator.serviceWorker.controller) offerUpdate(worker);
        });
      });
    };

    const onControllerChange = () => {
      // Recharge uniquement si l'utilisateur l'a demandé (la toute première installation déclenche aussi cet événement).
      if (!userAccepted) return;
      userAccepted = false;
      window.location.reload();
    };

    const check = () => void registration?.update().catch(() => undefined);
    const onVisible = () => document.visibilityState === "visible" && check();

    navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);
    document.addEventListener("visibilitychange", onVisible);
    const timer = window.setInterval(check, UPDATE_CHECK_MS);

    navigator.serviceWorker
      .register("/sw.js", { scope: "/", updateViaCache: "none" })
      .then((reg) => {
        registration = reg;
        watch(reg);
      })
      .catch((err) => console.warn("[koti] service worker non enregistré", err));

    return () => {
      navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
      document.removeEventListener("visibilitychange", onVisible);
      window.clearInterval(timer);
    };
  }, []);

  return null;
}
