import type { Metadata } from "next";
import { TontineForm } from "@/components/forms/tontine-form";
import { PageHeader } from "@/components/ui/feedback";
import { requireUser } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Nouvelle tontine" };

export default async function NewTontinePage() {
  await requireUser("/tontines/new");
  return (
    <>
      <PageHeader title="Nouvelle tontine" description="La tontine est créée en brouillon : invitez les membres et fixez l'ordre des tours avant de la démarrer." back={{ href: "/tontines", label: "Tontines" }} />
      <TontineForm />
    </>
  );
}
