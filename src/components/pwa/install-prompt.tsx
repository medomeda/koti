"use client";

import { Download, Share, SquarePlus, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { dismissInstallCard, promptInstall, useInstallCardDismissed, useInstallMode } from "./pwa-store";

function IosSteps() {
  return (
    <ol className="mt-2 space-y-1.5 text-sm">
      <li className="flex items-center gap-2">
        <span className="font-semibold">1.</span> Touchez <Share className="size-4 shrink-0" aria-label="Partager" /> en bas de Safari
      </li>
      <li className="flex items-center gap-2">
        <span className="font-semibold">2.</span> Choisissez <SquarePlus className="size-4 shrink-0" aria-hidden /> « Sur l&apos;écran d&apos;accueil »
      </li>
    </ol>
  );
}

async function install() {
  const accepted = await promptInstall();
  if (accepted) toast.success("KOTI est installé sur votre appareil.");
}

/**
 * Carte d'invitation à installer l'application (accueil). Affichée une seule fois :
 * masquée dès que l'utilisateur la ferme ou installe l'application.
 */
export function InstallCard() {
  const mode = useInstallMode();
  const dismissed = useInstallCardDismissed();
  if (dismissed || (mode !== "prompt" && mode !== "ios")) return null;

  return (
    <div className="relative flex gap-3 rounded-xl border border-primary/25 bg-primary-soft/60 p-4 pr-10 text-primary-soft-foreground">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary text-white [&_svg]:size-5">
        <Download aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-semibold">Installez KOTI sur votre téléphone</p>
        <p className="text-sm opacity-90">Accès en un geste depuis l&apos;écran d&apos;accueil, en plein écran, comme une application.</p>
        {mode === "ios" ? (
          <IosSteps />
        ) : (
          <Button size="sm" className="mt-3" onClick={install}>
            <Download /> Installer l&apos;application
          </Button>
        )}
      </div>
      <button type="button" onClick={dismissInstallCard} className="absolute right-2 top-2 rounded-md p-2 opacity-70 hover:bg-primary/10 hover:opacity-100" aria-label="Masquer">
        <X className="size-4" />
      </button>
    </div>
  );
}

/** Section « Application » du profil : toujours disponible, même après avoir masqué la carte d'accueil. */
export function InstallSection() {
  const mode = useInstallMode();
  if (mode === "installed") return <p className="text-sm text-muted-foreground">KOTI est installé sur cet appareil. Les mises à jour vous sont proposées automatiquement.</p>;
  if (mode === "ios")
    return (
      <div className="text-sm">
        <p className="text-muted-foreground">Pour installer KOTI sur votre iPhone :</p>
        <IosSteps />
      </div>
    );
  if (mode === "prompt")
    return (
      <Button variant="outline" onClick={install}>
        <Download /> Installer l&apos;application
      </Button>
    );
  return <p className="text-sm text-muted-foreground">Ouvrez KOTI dans Chrome (Android) ou Safari (iPhone) pour l&apos;installer sur l&apos;écran d&apos;accueil.</p>;
}
