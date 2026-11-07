import type { Metadata } from "next";
import { SiteHeader } from "@/components/marketing/site-header";
import { Alert } from "@/components/ui/feedback";

export const metadata: Metadata = { title: "Confidentialité" };

export default function PrivacyPage() {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-3xl space-y-6 px-4 py-12 sm:px-6 md:py-16">
        <h1 className="font-display text-4xl font-bold tracking-tight">Confidentialité</h1>
        <Alert tone="warning">Texte provisoire de la version de démonstration. Il doit être rédigé ou validé par un juriste avant toute ouverture au public.</Alert>
        <section className="space-y-2">
          <h2 className="text-xl font-semibold">Données collectées</h2>
          <p className="leading-relaxed text-muted-foreground">Nom, adresse e-mail, numéro de téléphone, ainsi que les informations des tontines auxquelles vous participez : cotisations, paiements déclarés et tours de main.</p>
        </section>
        <section className="space-y-2">
          <h2 className="text-xl font-semibold">Qui voit quoi</h2>
          <p className="leading-relaxed text-muted-foreground">L&apos;organisateur d&apos;une tontine voit les paiements de tous ses membres. Un membre ne voit que ses propres paiements. Une tontine n&apos;est jamais visible par les membres d&apos;une autre.</p>
        </section>
        <section className="space-y-2">
          <h2 className="text-xl font-semibold">Vos droits</h2>
          <p className="leading-relaxed text-muted-foreground">Vous pouvez demander l&apos;accès à vos données, leur correction ou la suppression de votre compte en écrivant à l&apos;équipe depuis la page de contact.</p>
        </section>
      </main>
    </>
  );
}
