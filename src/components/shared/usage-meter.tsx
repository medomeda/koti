import { cn } from "@/lib/utils/cn";

/** Jauge « utilisé / limite » : orange à la limite, rouge au-delà (tontines déjà au-dessus d'un quota). */
export function UsageMeter({ label, used, limit }: { label: string; used: number; limit: number }) {
  const pct = Math.min(100, Math.round((used / limit) * 100));
  const over = used > limit;
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span>{label}</span>
        <span className={cn("tabular-nums", over ? "font-semibold text-destructive" : used >= limit ? "font-semibold text-warning" : "text-muted-foreground")}>
          {used} / {limit}
        </span>
      </div>
      <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={`${label} : ${used} sur ${limit}`}>
        <div className={cn("h-full rounded-full", over ? "bg-destructive" : used >= limit ? "bg-warning" : "bg-primary")} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
