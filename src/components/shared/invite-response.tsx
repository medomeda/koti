"use client";

import { useRouter } from "next/navigation";
import { acceptInvitationAction, refuseInvitationAction } from "@/actions/members";
import { Button } from "@/components/ui/button";
import { FormError } from "@/components/ui/field";
import { useAction } from "./use-action";

export function InviteResponse({ token, tontineName }: { token: string; tontineName: string }) {
  const router = useRouter();
  const accept = useAction(acceptInvitationAction, { success: `Bienvenue dans « ${tontineName} » !`, onSuccess: (d) => router.push(`/tontines/${d.tontineId}`), refresh: false });
  const refuse = useAction(refuseInvitationAction, { success: "Invitation refusée.", onSuccess: () => router.push("/"), refresh: false });
  return (
    <div className="space-y-3">
      <FormError message={accept.error ?? refuse.error} />
      <div className="grid grid-cols-2 gap-2">
        <Button variant="outline" size="lg" onClick={() => refuse.run({ token })} loading={refuse.pending} disabled={accept.pending}>
          Refuser
        </Button>
        <Button size="lg" onClick={() => accept.run({ token })} loading={accept.pending} disabled={refuse.pending}>
          Rejoindre
        </Button>
      </div>
    </div>
  );
}
