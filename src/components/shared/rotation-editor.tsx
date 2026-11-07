"use client";

import { ArrowDown, ArrowUp, Lock, RotateCcw, Save } from "lucide-react";
import { useMemo, useState } from "react";
import { reorderRotationAction } from "@/actions/misc";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/feedback";
import { Field } from "@/components/ui/field";
import { Textarea } from "@/components/ui/input";
import { Avatar } from "@/components/ui/misc";
import { cn } from "@/lib/utils/cn";
import { formatDate } from "@/lib/utils/dates";
import type { RotationStatus } from "@/types/domain";
import { RotationStatusBadge } from "./status";
import { useAction } from "./use-action";

export interface EditorRow {
  ticketId: string;
  ticketLabel: string;
  name: string;
  avatarUrl: string | null;
  position: number;
  status: RotationStatus;
  isMe: boolean;
}

/**
 * Réorganisation de l'ordre de passage. Seuls les tours « à venir » sont déplaçables
 * une fois la tontine démarrée ; les dates sont recalculées par le serveur.
 */
export function RotationEditor({ tontineId, rows, started, dates }: { tontineId: string; rows: EditorRow[]; started: boolean; dates: Record<number, string | null> }) {
  const frozen = useMemo(() => rows.filter((r) => r.status === "COMPLETED" || r.status === "CURRENT"), [rows]);
  const initial = useMemo(() => rows.filter((r) => r.status === "UPCOMING"), [rows]);
  const positions = useMemo(() => initial.map((r) => r.position), [initial]);
  const [order, setOrder] = useState(initial);
  const [reason, setReason] = useState("");
  const dirty = order.some((r, i) => r.ticketId !== initial[i]?.ticketId);
  const save = useAction(reorderRotationAction, { success: "Ordre des tours enregistré." });

  const move = (i: number, delta: -1 | 1) => {
    const j = i + delta;
    if (j < 0 || j >= order.length) return;
    const next = [...order];
    [next[i], next[j]] = [next[j]!, next[i]!];
    setOrder(next);
  };

  const submit = async () => {
    const res = await save.run({ tontineId, ticketIds: order.map((r) => r.ticketId), reason: started ? reason : undefined });
    if (res.ok) setReason("");
  };

  return (
    <div className="space-y-4">
      {started && (
        <Alert tone="warning" icon={<Lock />}>
          La tontine a démarré : les tours passés et en cours sont figés. Toute modification de l&apos;ordre est historisée avec son motif et visible dans le journal.
        </Alert>
      )}
      <ol className="divide-y rounded-xl border bg-card">
        {frozen.map((r) => (
          <li key={r.ticketId} className="flex items-center gap-3 bg-muted/40 px-4 py-3">
            <span className="w-7 text-center text-sm font-semibold tabular-nums text-muted-foreground">{r.position}</span>
            <Avatar name={r.name} src={r.avatarUrl} className="size-8" />
            <span className="min-w-0 flex-1 truncate text-sm font-medium text-muted-foreground">
              {r.name} <span className="font-normal">· {r.ticketLabel}</span>
            </span>
            <RotationStatusBadge status={r.status} />
            <Lock className="size-4 text-muted-foreground" aria-label="Figé" />
          </li>
        ))}
        {order.map((r, i) => {
          const pos = positions[i]!;
          const changed = r.ticketId !== initial[i]?.ticketId;
          return (
            <li key={r.ticketId} className={cn("flex items-center gap-3 px-4 py-2.5 transition-colors", changed && "bg-primary-soft/40")}>
              <span className="w-7 text-center text-sm font-semibold tabular-nums">{pos}</span>
              <Avatar name={r.name} src={r.avatarUrl} className="size-8" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">
                  {r.name} {r.isMe && <span className="font-normal text-muted-foreground">(vous)</span>}
                </p>
                <p className="text-xs text-muted-foreground">
                  {r.ticketLabel} · {dates[pos] ? formatDate(dates[pos]) : "—"}
                </p>
              </div>
              <div className="flex gap-1">
                <Button variant="outline" size="icon-sm" onClick={() => move(i, -1)} disabled={i === 0} aria-label={`Monter ${r.name} (${r.ticketLabel})`}>
                  <ArrowUp />
                </Button>
                <Button variant="outline" size="icon-sm" onClick={() => move(i, 1)} disabled={i === order.length - 1} aria-label={`Descendre ${r.name} (${r.ticketLabel})`}>
                  <ArrowDown />
                </Button>
              </div>
            </li>
          );
        })}
      </ol>
      {order.length < 2 && <p className="text-sm text-muted-foreground">Il faut au moins deux tours à venir pour modifier l&apos;ordre.</p>}
      {dirty && started && (
        <Field label="Motif de la modification" required error={save.fieldErrors.reason}>
          {(p) => <Textarea {...p} rows={2} maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ex. échange demandé par Aminata et Seydou" />}
        </Field>
      )}
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button variant="ghost" onClick={() => setOrder(initial)} disabled={!dirty || save.pending}>
          <RotateCcw /> Annuler les changements
        </Button>
        <Button onClick={submit} disabled={!dirty || (started && reason.trim().length < 3)} loading={save.pending}>
          <Save /> Enregistrer l&apos;ordre
        </Button>
      </div>
    </div>
  );
}
