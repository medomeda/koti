import { ArrowRight, CalendarDays, TriangleAlert, Users } from "lucide-react";
import Link from "next/link";
import { FREQUENCY_UNIT } from "@/lib/constants/labels";
import { formatDate } from "@/lib/utils/dates";
import { formatFCFA } from "@/lib/utils/money";
import type { TontineCard as TontineCardData } from "@/modules/tontines/tontine.service";
import { RoleBadge, TontineStatusBadge } from "./status";

export function TontineCard({ t }: { t: TontineCardData }) {
  return (
    <Link
      href={`/tontines/${t.id}`}
      className="group flex flex-col rounded-xl border bg-card p-5 shadow-xs transition-all duration-150 hover:border-primary/40 hover:shadow-md focus-visible:border-primary"
    >
      <div className="flex items-start justify-between gap-3">
        <h3 className="line-clamp-2 font-semibold leading-snug">{t.name}</h3>
        <RoleBadge role={t.role} />
      </div>
      <div className="mt-2">
        <TontineStatusBadge status={t.status} />
      </div>

      <div className="mt-4 space-y-1.5 text-sm">
        <p className="flex items-center gap-2 text-muted-foreground">
          <Users className="size-4" aria-hidden />
          {t.memberCount} membre{t.memberCount > 1 ? "s" : ""}
          <span className="text-xs">/ {t.expectedMemberCount} prévus</span>
          {t.ticketCount !== t.memberCount && <span className="text-xs">· {t.ticketCount} tickets</span>}
        </p>
        {t.myTicketCount > 1 && (
          <p className="text-xs text-muted-foreground">
            Vous : {t.myTicketCount} tickets · {formatFCFA(t.myPerPeriod)} / {FREQUENCY_UNIT[t.frequency]}
          </p>
        )}
        <p className="text-base font-semibold tabular-nums">
          {formatFCFA(t.contributionAmount)} <span className="text-sm font-normal text-muted-foreground">/ {FREQUENCY_UNIT[t.frequency]}</span>
        </p>
      </div>

      <div className="mt-4 rounded-lg bg-muted/60 px-3 py-2.5">
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <CalendarDays className="size-3.5" aria-hidden />
          {t.status === "DRAFT" ? "Démarrage prévu" : "Prochaine échéance"}
        </p>
        <p className="mt-0.5 text-sm font-medium">{t.nextDueDate ? formatDate(t.nextDueDate) : "—"}</p>
      </div>

      {(t.myLate > 0 || t.pendingValidations > 0) && (
        <div className="mt-3 flex flex-wrap gap-2 text-xs font-medium">
          {t.myLate > 0 && (
            <span className="inline-flex items-center gap-1 text-destructive-soft-foreground">
              <TriangleAlert className="size-3.5" aria-hidden /> {t.myLate} retard{t.myLate > 1 ? "s" : ""}
            </span>
          )}
          {t.pendingValidations > 0 && <span className="text-warning-soft-foreground">{t.pendingValidations} paiement{t.pendingValidations > 1 ? "s" : ""} à valider</span>}
        </div>
      )}

      <span className="mt-auto flex items-center justify-center gap-1.5 pt-4 text-sm font-medium text-primary">
        Ouvrir <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
      </span>
    </Link>
  );
}
