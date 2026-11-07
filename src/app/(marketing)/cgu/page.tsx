import type { Metadata } from "next";
import { SiteHeader } from "@/components/marketing/site-header";
import { Alert } from "@/components/ui/feedback";

export const metadata: Metadata = { title: "Conditions d'utilisation" };

export default function TermsPage() {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-3xl space-y-6 px-4 py-12 sm:px-6 md:py-16">
        <h1 className="font-display text-4xl font-bold tracking-tight">Conditions d&apos;utilisation</h1>
        <Alert tone="warning">Texte provisoire de la version de démonstration. Il doit être rédigé ou validé par un juriste avant toute ouverture au public.</Alert>
        <section className="space-y-2">
          <h2 className="text-xl font-semibold">Ce que fait KOTI</h2>
          <p className="leading-relaxed text-muted-foreground">KOTI est un outil de suivi : il enregistre les membres, les cotisations attendues, les paiements déclarés et validés et l&apos;ordre des tours de main. KOTI ne reçoit, ne conserve et ne transfère aucun fonds.</p>
        </section>
        <section className="space-y-2">
          <h2 className="text-xl font-semibold">Rôle de l&apos;organisateur</h2>
          <p className="leading-relaxed text-muted-foreground">L&apos;organisateur d&apos;une tontine est responsable des règles qu&apos;il fixe, de la validation des paiements et de la relation avec ses membres. KOTI n&apos;est pas partie aux accords entre les participants.</p>
        </section>
        <section className="space-y-2">
          <h2 className="text-xl font-semibold">Comptes et offres</h2>
          <p className="leading-relaxed text-muted-foreground">Chaque utilisateur est responsable de la confidentialité de son mot de passe. Les offres payantes, leurs limites et leurs prix seront précisés avant l&apos;ouverture commerciale.</p>
        </section>
      </main>
    </>
  );
}
