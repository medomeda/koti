"use client";

import { Bell, BellOff, BellRing } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { sendTestPushAction, setPushCategoriesAction } from "@/actions/push";
import { Alert } from "@/components/ui/feedback";
import { Button } from "@/components/ui/button";
import { currentEndpoint, disablePush, enablePush, pushSupport, type PushSupport } from "./push-client";

interface CategoryInfo {
  key: string;
  label: string;
  description: string;
}

/**
 * Notifications push de l'appareil courant (carte du profil). L'autorisation n'est demandée qu'au clic sur « Activer »,
 * jamais à l'ouverture de la page. Chaque appareil s'active séparément ; les catégories se règlent pour le compte.
 */
export function PushSettings({ publicKey, categories, allCategories, knownEndpoints }: { publicKey: string | null; categories: string[]; allCategories: CategoryInfo[]; knownEndpoints: string[] }) {
  const [support, setSupport] = useState<PushSupport | "checking">("checking");
  const [permission, setPermission] = useState<NotificationPermission>("default");
  const [endpoint, setEndpoint] = useState<string | null>(null);
  const [selected, setSelected] = useState<string[]>(categories);
  const [busy, setBusy] = useState(false);
  const synced = useRef(new Set<string>()); // appareils déjà enregistrés pendant cette visite

  // Relecture de l'état de l'appareil (au chargement, puis après chaque activation ou désactivation).
  const [tick, setTick] = useState(0);
  const refresh = () => setTick((n) => n + 1);
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const s = await pushSupport();
      const ep = s === "ok" ? await currentEndpoint() : null;
      // Appareil déjà abonné mais inconnu du serveur (base réinitialisée, abonnement purgé) : on le réenregistre sans rien demander.
      if (ep && publicKey && Notification.permission === "granted" && !knownEndpoints.includes(ep) && !synced.current.has(ep)) {
        synced.current.add(ep);
        await enablePush(publicKey);
      }
      if (cancelled) return;
      setSupport(s);
      if (s === "ok") {
        setPermission(Notification.permission);
        setEndpoint(ep);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tick, publicKey, knownEndpoints]);

  if (!publicKey) {
    return <Alert tone="neutral">Les notifications push ne sont pas activées sur cette instance. Vous recevez toujours vos alertes dans l&apos;application.</Alert>;
  }
  if (support === "checking") return <p className="text-sm text-muted-foreground">Vérification de cet appareil…</p>;
  if (support === "ios-not-installed") {
    return <Alert tone="brand" icon={<Bell />}>Sur iPhone, les notifications fonctionnent une fois KOTI ajouté à l&apos;écran d&apos;accueil (Partager → « Sur l&apos;écran d&apos;accueil »). Ouvrez ensuite KOTI depuis l&apos;icône et revenez ici.</Alert>;
  }
  if (support !== "ok") {
    return <Alert tone="neutral">{support === "no-service-worker" ? "Les notifications push ne sont pas disponibles dans ce mode (version de développement ou application non installée). Elles fonctionnent dans l'application déployée." : "Ce navigateur ne permet pas les notifications push."}</Alert>;
  }

  const active = endpoint !== null && permission === "granted";

  const activate = async () => {
    setBusy(true);
    const res = await enablePush(publicKey);
    if (res.ok) {
      const ep = await currentEndpoint();
      if (ep) synced.current.add(ep);
    }
    setBusy(false);
    refresh();
    if (res.ok) toast.success("Notifications activées sur cet appareil.");
    else toast.error(res.message);
  };
  const deactivate = async () => {
    setBusy(true);
    await disablePush();
    setBusy(false);
    refresh();
    setEndpoint(null);
    toast.success("Notifications désactivées sur cet appareil.");
  };
  const test = async () => {
    setBusy(true);
    const res = await sendTestPushAction();
    setBusy(false);
    if (res.ok) toast.success("Notification de test envoyée.");
    else toast.error(res.error);
  };
  const toggle = async (key: string, on: boolean) => {
    const next = on ? [...selected, key] : selected.filter((k) => k !== key);
    setSelected(next);
    const res = await setPushCategoriesAction({ categories: next });
    if (!res.ok) {
      setSelected(selected);
      toast.error(res.error);
    }
  };

  if (permission === "denied") {
    return <Alert tone="warning" icon={<BellOff />} title="Notifications bloquées">Le navigateur bloque les notifications pour KOTI. Autorisez-les dans les réglages du site (icône de cadenas, près de l&apos;adresse), puis revenez ici.</Alert>;
  }

  return (
    <div className="space-y-4">
      {active ? (
        <>
          <p className="flex items-center gap-2 text-sm font-medium text-primary">
            <BellRing className="size-4" aria-hidden /> Activées sur cet appareil
          </p>
          <fieldset className="space-y-2.5">
            <legend className="mb-1 text-sm font-medium">Me prévenir pour</legend>
            {allCategories.map((c) => (
              <label key={c.key} className="flex cursor-pointer items-start gap-3 text-sm">
                <input type="checkbox" className="mt-0.5 size-4 accent-[var(--primary)]" checked={selected.includes(c.key)} onChange={(e) => void toggle(c.key, e.target.checked)} />
                <span>
                  <span className="font-medium">{c.label}</span>
                  <span className="block text-xs text-muted-foreground">{c.description}</span>
                </span>
              </label>
            ))}
          </fieldset>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={test} loading={busy}>
              Envoyer un test
            </Button>
            <Button variant="ghost" onClick={deactivate} loading={busy}>
              Désactiver sur cet appareil
            </Button>
          </div>
        </>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">Recevez un rappel avant vos échéances et sachez tout de suite quand un paiement est validé, même sans ouvrir KOTI. Le texte affiché ne contient ni montant ni nom : le détail se lit dans l&apos;application.</p>
          <Button onClick={activate} loading={busy}>
            <Bell /> Activer sur cet appareil
          </Button>
        </>
      )}
    </div>
  );
}
