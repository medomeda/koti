"use client";

import { CheckCircle2, Info, TriangleAlert, X } from "lucide-react";
import { useState, useSyncExternalStore } from "react";
import { cn } from "@/lib/utils/cn";

type Item = { id: string; title: string; message: string; tone: "info" | "warning" | "success" };
const STORE = "koti-dismissed-announcements";
const TONES = { info: "bg-muted text-foreground", warning: "bg-warning-soft text-warning-soft-foreground", success: "bg-primary-soft text-primary-soft-foreground" } as const;
const ICONS = { info: Info, warning: TriangleAlert, success: CheckCircle2 } as const;

const subscribe = () => () => undefined;
// Instantané stable (chaîne) : sur le serveur, rien n'est fermé ; côté navigateur, on lit le stockage.
const readRaw = () => {
  try {
    return localStorage.getItem(STORE) ?? "[]";
  } catch {
    return "[]";
  }
};
const parse = (raw: string): string[] => {
  try {
    return JSON.parse(raw) as string[];
  } catch {
    return [];
  }
};

/** Annonces de l'équipe KOTI. Fermeture mémorisée dans le navigateur (par annonce) ; sans stockage, elle reste affichée. */
export function AnnouncementBanner({ items }: { items: Item[] }) {
  const stored = useSyncExternalStore(subscribe, readRaw, () => "[]");
  const [closedNow, setClosedNow] = useState<string[]>([]);
  const dismissed = [...parse(stored), ...closedNow];
  const visible = items.filter((a) => !dismissed.includes(a.id));
  if (visible.length === 0) return null;
  return (
    <div className="space-y-px">
      {visible.map((a) => {
        const Icon = ICONS[a.tone];
        return (
          <div key={a.id} role="status" className={cn("flex items-start gap-2 px-4 py-2 text-sm", TONES[a.tone])}>
            <Icon className="mt-0.5 size-4 shrink-0" aria-hidden />
            <p className="flex-1">
              <strong>{a.title}</strong> · {a.message}
            </p>
            <button
              type="button"
              aria-label={`Fermer l'annonce « ${a.title} »`}
              className="-m-1 rounded p-1 hover:bg-black/5"
              onClick={() => {
                const next = [...dismissed, a.id];
                setClosedNow(next);
                try {
                  localStorage.setItem(STORE, JSON.stringify(next.slice(-50)));
                } catch {
                  /* stockage indisponible : la fermeture ne vaut que pour cette page */
                }
              }}
            >
              <X className="size-4" aria-hidden />
            </button>
          </div>
        );
      })}
    </div>
  );
}
