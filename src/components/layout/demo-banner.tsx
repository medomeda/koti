import { FlaskConical } from "lucide-react";
import Link from "next/link";

/** Bandeau permanent de la version de démonstration : aucun testeur ne doit croire manipuler de vrais fonds. */
export function DemoBanner() {
  return (
    <div role="note" className="flex items-center justify-center gap-2 bg-warning-soft px-4 py-1.5 text-center text-xs text-warning-soft-foreground">
      <FlaskConical className="size-3.5 shrink-0" aria-hidden />
      <span>
        <strong>Version de démonstration</strong> · données fictives, aucun paiement réel ·{" "}
        <Link href="/guide" className="font-semibold underline underline-offset-2">
          Guide du testeur
        </Link>
      </span>
    </div>
  );
}
