import Link from "next/link";
import { formatDate, relativeDays } from "@/lib/utils/dates";
import { formatFCFA } from "@/lib/utils/money";
import { cn } from "@/lib/utils/cn";
import type { ObligationView } from "@/modules/payments/payment.service";
import { DeclarePaymentButton } from "./declare-payment-dialog";
import { ObligationStatusBadge } from "./status";

/** Ligne « liste » responsive d'une échéance personnelle (mobile-first, remplace un tableau). */
export function ObligationRow({ o, today, showTontine = true }: { o: ObligationView; today: string; showTontine?: boolean }) {
  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3.5 sm:px-5">
      <div className="min-w-0 basis-full sm:basis-auto sm:flex-1">
        {showTontine ? (
          <Link href={`/tontines/${o.tontineId}/payments`} className="font-medium hover:text-primary hover:underline">
            {o.tontineName}
          </Link>
        ) : (
          <p className="font-medium">Échéance n°{o.periodNumber}</p>
        )}
        <p className={cn("text-sm text-muted-foreground", o.status === "LATE" && "text-destructive-soft-foreground")}>
          {showTontine && <>N°{o.periodNumber} · </>}
          <span className="font-medium text-foreground">{o.ticketLabel}</span> ·{" "}
          {formatDate(o.dueDate)} <span className="text-xs">({relativeDays(o.dueDate, today)})</span>
        </p>
        {o.rejected && o.lastPayment?.rejectionReason && <p className="mt-1 text-xs text-destructive-soft-foreground">Motif du refus : {o.lastPayment.rejectionReason}</p>}
      </div>
      <div className="flex w-full items-center gap-3 sm:w-auto">
        <span className="mr-auto font-semibold tabular-nums sm:mr-0">{formatFCFA(o.expectedAmount)}</span>
        <ObligationStatusBadge status={o.status} />
        {o.canDeclare && (
          <DeclarePaymentButton
            target={{ id: o.id, tontineName: o.tontineName, expectedAmount: o.expectedAmount, dueDate: o.dueDate, periodNumber: o.periodNumber, ticketLabel: o.ticketLabel, rejectionReason: o.rejected ? o.lastPayment?.rejectionReason : null }}
            label={o.rejected ? "Redéclarer" : "Déclarer"}
          />
        )}
      </div>
    </li>
  );
}
