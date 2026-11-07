import type { Metadata } from "next";
import { TontineForm } from "@/components/forms/tontine-form";
import { PageHeader } from "@/components/ui/feedback";
import { requireUser } from "@/lib/auth/session";
import { getAccount } from "@/modules/billing/billing.service";
import { ctxFor } from "@/server/context";

export const metadata: Metadata = { title: "Nouvelle tontine" };

export default async function NewTontinePage() {
  const user = await requireUser("/tontines/new");
  const a = getAccount(ctxFor(user.id));
  const quota = { planName: a.plan.name, tontinesUsed: a.usage.tontines.length, tontinesLimit: a.plan.limits.tontines, maxMembers: a.plan.limits.membersPerTontine, multipleTickets: a.plan.limits.multipleTickets };
  return (
    <>
      <PageHeader title="Nouvelle tontine" description="La tontine est créée en brouillon : invitez les membres et fixez l'ordre des tours avant de la démarrer." back={{ href: "/tontines", label: "Tontines" }} />
      <TontineForm quota={quota} />
    </>
  );
}
