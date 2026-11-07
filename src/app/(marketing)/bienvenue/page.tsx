import { Check } from "lucide-react";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { RotationCircle } from "@/components/marketing/rotation-circle";
import { SiteHeader } from "@/components/marketing/site-header";
import { Button } from "@/components/ui/button";
import { isDemoMode } from "@/lib/demo";

export const metadata: Metadata = {
  title: { absolute: "KOTI — Gestion de tontines : cotisations, paiements et tours de main" },
  description: "Suivez qui a cotisé, validez les paiements et annoncez qui reçoit la cagnotte. KOTI ne détient jamais votre argent.",
  alternates: { canonical: "/" },
};
// KOTI_DEMO_MODE est lu à l'exécution : pas de pré-rendu statique.
export const dynamic = "force-dynamic";

const STEPS = [
  { title: "Créez la tontine", text: "Montant de la cotisation, fréquence, date du premier tour. Les échéances se calculent seules, y compris deux fois par semaine." },
  { title: "Invitez les membres", text: "Un lien personnel par WhatsApp, SMS ou e-mail. Chacun crée son compte et rejoint la tontine en quelques secondes." },
  { title: "Suivez les cotisations", text: "Chaque membre déclare son paiement, vous le validez. Le tableau de bord montre les retards et le prochain bénéficiaire." },
];

const FEATURES = [
  {
    title: "Le membre déclare, vous validez",
    text: "Après avoir payé en espèces ou par Mobile Money, le membre déclare le montant et la référence. Vous validez, ou vous refusez avec un motif. Chaque déclaration reste dans l'historique.",
    image: { src: "/vitrine/paiements.png", alt: "Liste des paiements d'une tontine avec les déclarations à valider", width: 1800, height: 1120 },
  },
  {
    title: "Plusieurs parts, plusieurs tours",
    text: "Un membre peut détenir plusieurs tickets. Chaque ticket cotise à chaque échéance et reçoit son propre tour de main. Vous fixez le maximum par membre avant le démarrage, puis le nombre de tickets est figé.",
    image: { src: "/vitrine/membres.png", alt: "Liste des membres avec leurs tickets et leur cotisation par période", width: 1800, height: 1120 },
  },
  {
    title: "Qui reçoit, et quand",
    text: "L'ordre de passage est défini avant le départ et les dates suivent la fréquence de la tontine. Chaque membre voit sa position, la date de son tour et le montant de la cagnotte.",
    image: { src: "/vitrine/rotation.png", alt: "Calendrier des tours de main avec les bénéficiaires et les dates", width: 1800, height: 1120 },
  },
];

const AUDIENCES = [
  { title: "Les familles", text: "Une cotisation chaque samedi, un bénéficiaire par semaine, et plus personne ne demande qui a payé." },
  { title: "Les collègues", text: "Une cotisation mensuelle, avec plusieurs parts pour ceux qui veulent recevoir plus souvent." },
  { title: "Les associations de quartier", text: "Des dizaines de membres, un suivi clair des retards et un journal des décisions de l'organisateur." },
];

export default async function HomePage() {
  const demo = isDemoMode();
  return (
    <>
      <div className="bg-sidebar text-white">
        <SiteHeader dark />
        <section className="mx-auto grid max-w-6xl items-center gap-10 px-4 pb-16 pt-10 sm:px-6 md:pb-24 md:pt-16 lg:grid-cols-[1.05fr_0.95fr]">
          <div>
            <h1 className="font-display text-4xl font-bold leading-[1.05] tracking-tight sm:text-5xl lg:text-6xl">Chaque cotisation notée, chaque tour de main connu.</h1>
            <p className="mt-5 max-w-xl text-lg leading-relaxed text-sidebar-foreground">
              KOTI aide les organisateurs de tontines à suivre qui a cotisé, à valider les paiements et à annoncer qui reçoit la cagnotte. L&apos;argent ne passe jamais par KOTI.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Button asChild size="lg" className="bg-[#f4c04e] text-[#0f2a1c] hover:bg-[#f7cf75]">
                <Link href="/register">Créer ma tontine</Link>
              </Button>
              {demo && (
                <Button asChild size="lg" variant="ghost" className="text-white hover:bg-white/10 hover:text-white">
                  <Link href="/guide">Essayer avec des données fictives</Link>
                </Button>
              )}
            </div>
            <p className="mt-4 text-sm text-sidebar-muted">Gratuit pour une première tontine, sans carte bancaire.</p>
          </div>
          <RotationCircle className="mx-auto w-full max-w-md" />
        </section>
      </div>

      <section aria-labelledby="etapes" className="mx-auto max-w-6xl px-4 py-16 sm:px-6 md:py-20">
        <h2 id="etapes" className="font-display text-3xl font-bold tracking-tight sm:text-4xl">
          Une tontine prête en trois étapes
        </h2>
        <ol className="mt-10 grid gap-8 md:grid-cols-3">
          {STEPS.map((s, i) => (
            <li key={s.title} className="relative border-t-2 border-primary pt-5">
              <span className="font-display text-sm font-bold text-primary">Étape {i + 1}</span>
              <h3 className="mt-1 text-lg font-semibold">{s.title}</h3>
              <p className="mt-2 leading-relaxed text-muted-foreground">{s.text}</p>
            </li>
          ))}
        </ol>
      </section>

      <section aria-label="Ce que KOTI apporte" className="mx-auto max-w-6xl space-y-16 px-4 pb-16 sm:px-6 md:space-y-24 md:pb-24">
        {FEATURES.map((f, i) => (
          <article key={f.title} className="grid items-center gap-8 lg:grid-cols-2 lg:gap-14">
            <div className={i % 2 === 1 ? "lg:order-2" : undefined}>
              <h2 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">{f.title}</h2>
              <p className="mt-3 max-w-md leading-relaxed text-muted-foreground">{f.text}</p>
            </div>
            <Image src={f.image.src} alt={f.image.alt} width={f.image.width} height={f.image.height} className="w-full rounded-xl border shadow-md" sizes="(min-width: 1024px) 560px, 100vw" />
          </article>
        ))}
      </section>

      <section aria-labelledby="confiance" className="bg-sidebar text-white">
        <div className="mx-auto grid max-w-6xl gap-10 px-4 py-16 sm:px-6 md:grid-cols-[1fr_1.2fr] md:py-20">
          <h2 id="confiance" className="font-display text-3xl font-bold leading-tight tracking-tight sm:text-4xl">
            L&apos;argent reste entre vos mains.
          </h2>
          <ul className="space-y-4">
            {["KOTI ne reçoit et ne transfère aucun fonds : il garde la trace, pas l'argent.", "Chaque tontine est un espace séparé. Un membre ne voit que ses propres paiements.", "Les décisions sensibles de l'organisateur sont enregistrées dans un journal qu'il peut consulter."].map((t) => (
              <li key={t} className="flex gap-3 leading-relaxed text-sidebar-foreground">
                <Check className="mt-1 size-5 shrink-0 text-[#f4c04e]" aria-hidden />
                {t}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section aria-labelledby="pour-qui" className="mx-auto max-w-6xl px-4 py-16 sm:px-6 md:py-20">
        <h2 id="pour-qui" className="font-display text-3xl font-bold tracking-tight sm:text-4xl">
          Pensé pour les tontines telles qu&apos;elles se pratiquent
        </h2>
        <div className="mt-8 grid gap-8 md:grid-cols-3">
          {AUDIENCES.map((a) => (
            <div key={a.title}>
              <h3 className="text-lg font-semibold">{a.title}</h3>
              <p className="mt-2 leading-relaxed text-muted-foreground">{a.text}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 pb-20 sm:px-6">
        <div className="flex flex-col items-start justify-between gap-6 rounded-2xl bg-primary-soft p-8 sm:flex-row sm:items-center md:p-10">
          <div>
            <h2 className="font-display text-2xl font-bold tracking-tight text-primary-soft-foreground sm:text-3xl">Lancez votre première tontine aujourd&apos;hui.</h2>
            <p className="mt-2 text-primary-soft-foreground/80">Le démarrage est gratuit. Vous choisissez une offre quand vous en avez besoin.</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button asChild size="lg">
              <Link href="/register">Créer ma tontine</Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link href="/tarifs">Voir les tarifs</Link>
            </Button>
          </div>
        </div>
      </section>
    </>
  );
}
