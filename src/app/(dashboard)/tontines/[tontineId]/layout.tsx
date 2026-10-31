import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { TontineNav } from "@/components/layout/tontine-nav";
import { RoleBadge, TontineStatusBadge } from "@/components/shared/status";
import { Button } from "@/components/ui/button";
import { Alert, StatusScreen } from "@/components/ui/feedback";
import { requireUser } from "@/lib/auth/session";
import { FREQUENCY_UNIT } from "@/lib/constants/labels";
import { formatFCFA } from "@/lib/utils/money";
import { idSchema } from "@/lib/validations";
import { getTontineAccess } from "@/modules/tontines/tontine.service";
import { ctxFor } from "@/server/context";
import { AppError } from "@/server/errors";

export default async function TontineLayout({ children, params }: { children: ReactNode; params: Promise<{ tontineId: string }> }) {
  const { tontineId } = await params;
  const user = await requireUser(`/tontines/${tontineId}`);
  if (!idSchema.safeParse(tontineId).success) notFound();

  let access: ReturnType<typeof getTontineAccess>;
  try {
    access = getTontineAccess(ctxFor(user.id), tontineId);
  } catch (err) {
    if (err instanceof AppError && (err.code === "NOT_FOUND" || err.code === "FORBIDDEN")) {
      // Même écran que la tontine existe ou non : on ne révèle rien.
      return (
        <StatusScreen
          kind="forbidden"
          title="Tontine inaccessible"
          description="Cette tontine n'existe pas ou vous n'en êtes pas membre. Si vous avez reçu une invitation, ouvrez le lien reçu ou consultez vos alertes."
          action={
            <>
              <Button asChild variant="outline">
                <Link href="/alerts">Mes invitations</Link>
              </Button>
              <Button asChild>
                <Link href="/tontines">Mes tontines</Link>
              </Button>
            </>
          }
        />
      );
    }
    throw err;
  }
  const { tontine, role } = access;

  return (
    <div className="space-y-5">
      <div className="space-y-3">
        <Link href="/tontines" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-primary">
          ← Tontines
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">{tontine.name}</h1>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              <TontineStatusBadge status={tontine.status} />
              <RoleBadge role={role} />
              <span className="tabular-nums">
                {formatFCFA(tontine.contributionAmount)} / {FREQUENCY_UNIT[tontine.frequency]}
              </span>
            </div>
          </div>
        </div>
        <TontineNav tontineId={tontine.id} isAdmin={role === "ADMIN"} />
      </div>
      {tontine.status === "PAUSED" && <Alert tone="warning" title="Tontine suspendue">Aucune nouvelle échéance n&apos;est générée. Les échéances existantes peuvent toujours être réglées.</Alert>}
      {(tontine.status === "COMPLETED" || tontine.status === "CANCELLED") && <Alert tone="neutral" title="Tontine clôturée">Elle reste consultable en lecture seule.</Alert>}
      {children}
    </div>
  );
}
