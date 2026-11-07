import type { Metadata } from "next";
import Link from "next/link";
import { SiteHeader } from "@/components/marketing/site-header";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Fonctionnalités" };

const GROUPS: Array<{ title: string; intro: string; items: Array<{ name: string; text: string; soon?: boolean }> }> = [
  {
    title: "Organiser",
    intro: "Tout ce qu'il faut pour monter une tontine sans carnet ni tableur.",
    items: [
      { name: "Fréquences adaptées", text: "Hebdomadaire, deux fois par semaine, mensuelle ou annuelle. Les fins de mois et les années bissextiles sont gérées." },
      { name: "Invitations sécurisées", text: "Un lien personnel et temporaire, utilisable par une seule personne, partageable par WhatsApp, SMS ou e-mail." },
      { name: "Tickets multiples", text: "Un membre peut avoir plusieurs parts. L'organisateur les attribue avant le démarrage, avec un maximum par membre." },
      { name: "Ordre des tours", text: "L'organisateur fixe l'ordre de passage. Après le démarrage, toute modification exige un motif et reste dans le journal." },
    ],
  },
  {
    title: "Suivre",
    intro: "Savoir en un coup d'œil qui a payé, qui est en retard et qui reçoit.",
    items: [
      { name: "Échéances automatiques", text: "Une obligation par ticket et par échéance, générée sans doublon. Une pause suspend les échéances." },
      { name: "Déclaration et validation", text: "Le membre déclare son paiement, l'organisateur le valide ou le refuse avec un motif. Rien n'est effacé." },
      { name: "Retards et filtres", text: "Les retards se calculent à partir des échéances. Les paiements se regroupent par échéance ou par membre." },
      { name: "Tableau de bord", text: "Montant attendu, montant confirmé, paiements à valider, prochain bénéficiaire et progression de chaque échéance." },
    ],
  },
  {
    title: "Protéger",
    intro: "Des données financières entre proches méritent de la discrétion.",
    items: [
      { name: "Aucun fonds détenu", text: "KOTI ne reçoit et ne transfère aucun argent : il suit les engagements et les déclarations." },
      { name: "Espaces séparés", text: "Chaque tontine est indépendante. Un membre ne voit que ses propres paiements." },
      { name: "Journal des opérations", text: "Création, modification des paramètres, démarrage, retrait d'un membre, changement d'ordre : tout est daté et attribué." },
    ],
  },
  {
    title: "Sur téléphone",
    intro: "Pensé pour s'utiliser depuis un smartphone.",
    items: [
      { name: "Application installable", text: "Ajoutez KOTI à l'écran d'accueil sur Android ou iPhone. Une mise à jour vous est proposée quand elle est prête." },
      { name: "Rappels par e-mail et SMS", text: "Rappels d'échéance et alertes de retard envoyés directement aux membres.", soon: true },
      { name: "Notifications sur le téléphone", text: "Être prévenu d'un paiement validé ou d'une échéance proche, sans ouvrir l'application.", soon: true },
      { name: "Justificatifs de paiement", text: "Joindre une capture ou un reçu à une déclaration.", soon: true },
    ],
  },
];

export default function FeaturesPage() {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-6xl px-4 py-12 sm:px-6 md:py-16">
        <h1 className="font-display text-4xl font-bold tracking-tight sm:text-5xl">Ce que KOTI fait pour votre tontine</h1>
        <div className="mt-12 space-y-14">
          {GROUPS.map((g) => (
            <section key={g.title} aria-labelledby={`g-${g.title}`} className="grid gap-6 lg:grid-cols-[0.8fr_1.6fr] lg:gap-12">
              <div>
                <h2 id={`g-${g.title}`} className="font-display text-2xl font-bold tracking-tight">
                  {g.title}
                </h2>
                <p className="mt-2 text-muted-foreground">{g.intro}</p>
              </div>
              <dl className="grid gap-x-8 gap-y-6 sm:grid-cols-2">
                {g.items.map((it) => (
                  <div key={it.name}>
                    <dt className="font-semibold">
                      {it.name}
                      {it.soon && <span className="ml-2 rounded-full bg-muted px-2 py-0.5 text-xs font-normal text-muted-foreground">bientôt</span>}
                    </dt>
                    <dd className="mt-1 leading-relaxed text-muted-foreground">{it.text}</dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </div>
        <div className="mt-16 flex flex-wrap gap-3">
          <Button asChild size="lg">
            <Link href="/register">Créer ma tontine</Link>
          </Button>
          <Button asChild size="lg" variant="outline">
            <Link href="/tarifs">Voir les tarifs</Link>
          </Button>
        </div>
      </main>
    </>
  );
}
