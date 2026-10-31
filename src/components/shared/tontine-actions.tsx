"use client";

import { Pause, Play, Rocket, Square } from "lucide-react";
import { useState } from "react";
import { changeTontineStatusAction } from "@/actions/tontines";
import { Button } from "@/components/ui/button";
import type { TontineTransition } from "@/modules/tontines/transitions";
import { ConfirmDialog } from "./confirm-dialog";

type Transition = TontineTransition;

const COPY: Record<Transition, { label: string; title: string; description: string; confirm: string; destructive?: boolean; reason?: boolean }> = {
  activate: {
    label: "Démarrer la tontine",
    title: "Démarrer la tontine ?",
    description: "Les échéances seront générées automatiquement et les paramètres financiers (montant, fréquence, date de démarrage, nombre de membres) seront verrouillés.",
    confirm: "Démarrer",
  },
  pause: { label: "Suspendre", title: "Suspendre la tontine ?", description: "Aucune nouvelle échéance ne sera générée tant que la tontine est suspendue. Les échéances existantes restent dues.", confirm: "Suspendre" },
  resume: { label: "Reprendre", title: "Reprendre la tontine ?", description: "La génération des échéances reprend selon le calendrier.", confirm: "Reprendre" },
  close: {
    label: "Clôturer",
    title: "Clôturer définitivement ?",
    description: "La tontine passera en lecture seule : plus aucune déclaration, validation ou modification ne sera possible. Cette action est irréversible.",
    confirm: "Clôturer",
    destructive: true,
    reason: true,
  },
};

const ICON: Record<Transition, React.ReactNode> = { activate: <Rocket />, pause: <Pause />, resume: <Play />, close: <Square /> };

export function TransitionButton({ tontineId, transition, variant, className }: { tontineId: string; transition: Transition; variant?: "default" | "outline" | "destructive" | "ghost"; className?: string }) {
  const [open, setOpen] = useState(false);
  const c = COPY[transition];
  return (
    <>
      <Button variant={variant ?? (c.destructive ? "outline" : "default")} onClick={() => setOpen(true)} className={className}>
        {ICON[transition]} {c.label}
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title={c.title}
        description={c.description}
        confirmLabel={c.confirm}
        destructive={c.destructive}
        reason={c.reason ? { label: "Motif de la clôture", required: true, placeholder: "Ex. cycle terminé, tous les membres ont reçu leur tour." } : undefined}
        onConfirm={async (reason) => {
          const res = await changeTontineStatusAction({ tontineId, transition, reason: reason || undefined });
          if (!res.ok) return res.error;
          const { toast } = await import("sonner");
          toast.success(transition === "activate" ? "La tontine a démarré." : transition === "close" ? "Tontine clôturée." : transition === "pause" ? "Tontine suspendue." : "Tontine reprise.");
          return null;
        }}
      />
    </>
  );
}
