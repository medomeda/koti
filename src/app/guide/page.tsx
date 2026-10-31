import { ArrowRight, MessageSquareText, Smartphone, Users } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Brand } from "@/components/layout/brand";
import { DemoBanner } from "@/components/layout/demo-banner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { isDemoMode } from "@/lib/demo";
import { DEMO_ACCOUNTS, DEMO_PASSWORD } from "@/server/db/seed";

export const metadata: Metadata = { title: "Guide du testeur" };
// KOTI_DEMO_MODE est lu à l'exécution (Coolify), pas au build : pas de pré-rendu statique.
export const dynamic = "force-dynamic";

const SCENARIOS: Array<{ title: string; as: string; steps: string[] }> = [
  {
    title: "Découvrir le tableau de bord",
    as: "Ahmed",
    steps: ["Parcourez l'accueil : tontines, montants à payer, retards.", "Ouvrez « Tontine Famille » et passez d'un onglet à l'autre.", "Dans « Paiements », essayez les affichages par échéance, par membre, et le filtre par membre."],
  },
  {
    title: "Valider ou refuser un paiement",
    as: "Ahmed (administrateur)",
    steps: ["Dans « Tontine Famille » → Paiements, repérez les lignes « En validation ».", "Validez-en une, refusez-en une autre en donnant un motif.", "Ouvrez l'historique (icône horloge) d'une échéance."],
  },
  {
    title: "Déclarer un paiement puis le faire valider",
    as: "Awa, puis Ahmed",
    steps: ["Connecté en Awa : menu Paiements → « Déclarer » sur une échéance de Tontine Famille.", "Déconnectez-vous (menu Profil), reconnectez-vous en Ahmed.", "Vérifiez l'alerte reçue et validez le paiement d'Awa."],
  },
  {
    title: "Créer une tontine et inviter quelqu'un",
    as: "Ahmed, puis Koffi",
    steps: ["Créez une tontine (bouton « Créer une tontine »).", "Dans Membres → Inviter, invitez koffi@koti.demo.", "Reconnectez-vous en Koffi : acceptez l'invitation depuis la cloche (alertes)."],
  },
  {
    title: "Organiser les tours de main",
    as: "Ahmed",
    steps: ["Ouvrez « Projet Tabaski 2027 » (brouillon) → Tours de main.", "Changez l'ordre de passage et enregistrez.", "Démarrez la tontine depuis la Vue d'ensemble."],
  },
  {
    title: "Vérifier la confidentialité",
    as: "Awa (membre simple)",
    steps: ["Dans « Tontine Famille » → Paiements : vous ne devez voir que vos propres cotisations.", "Vous ne devez pas voir l'onglet Paramètres."],
  },
];

export default function GuidePage() {
  if (!isDemoMode()) notFound();
  return (
    <>
      <DemoBanner />
      <div className="mx-auto max-w-3xl space-y-6 px-4 py-8 sm:py-12">
        <Brand />
        <div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Merci de tester KOTI</h1>
          <p className="mt-2 text-muted-foreground">
            KOTI aide à gérer des tontines : membres, cotisations, validation des paiements et ordre des bénéficiaires. Cette version contient des <strong>données fictives</strong> : aucun argent ne circule, vous pouvez tout essayer sans risque.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="size-4" aria-hidden /> Comptes à utiliser
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm">
              Mot de passe pour tous : <code className="rounded bg-muted px-1.5 py-0.5 font-mono font-semibold">{DEMO_PASSWORD}</code> · ou cliquez sur un compte depuis la page de connexion.
            </p>
            <ul className="divide-y rounded-lg border">
              {DEMO_ACCOUNTS.map((a) => (
                <li key={a.email} className="flex flex-col px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
                  <span className="font-medium">{a.fullName}</span>
                  <span className="text-sm text-muted-foreground">
                    {a.email} · {a.hint}
                  </span>
                </li>
              ))}
            </ul>
            <p className="text-xs text-muted-foreground">D&apos;autres personnes testent peut-être en même temps : vous pouvez voir leurs actions. C&apos;est normal.</p>
          </CardContent>
        </Card>

        <section aria-labelledby="scenarios" className="space-y-3">
          <h2 id="scenarios" className="text-lg font-semibold">
            Scénarios à essayer (15 à 20 minutes)
          </h2>
          <ol className="grid gap-3 sm:grid-cols-2">
            {SCENARIOS.map((s, i) => (
              <li key={s.title} className="rounded-xl border bg-card p-4 shadow-xs">
                <p className="text-xs font-medium text-primary">
                  Scénario {i + 1} · en tant que {s.as}
                </p>
                <p className="mt-1 font-semibold">{s.title}</p>
                <ul className="mt-2 list-disc space-y-1 pl-4 text-sm text-muted-foreground">
                  {s.steps.map((step) => (
                    <li key={step}>{step}</li>
                  ))}
                </ul>
              </li>
            ))}
          </ol>
        </section>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MessageSquareText className="size-4" aria-hidden /> Ce qui nous intéresse
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="list-disc space-y-1.5 pl-4 text-sm">
              <li>Ce qui vous a bloqué, surpris ou semblé compliqué.</li>
              <li>Les mots que vous n&apos;avez pas compris.</li>
              <li>Ce qui manque pour gérer une vraie tontine (la vôtre ou celle de vos proches).</li>
              <li>Les erreurs ou affichages cassés — une capture d&apos;écran aide beaucoup.</li>
            </ul>
            <p className="mt-3 flex items-start gap-2 text-sm text-muted-foreground">
              <Smartphone className="mt-0.5 size-4 shrink-0" aria-hidden /> Testez de préférence sur votre téléphone, comme un vrai utilisateur. Envoyez vos remarques à la personne qui vous a partagé ce lien.
            </p>
          </CardContent>
        </Card>

        <Button asChild size="lg" className="w-full sm:w-auto">
          <Link href="/login">
            Commencer le test <ArrowRight />
          </Link>
        </Button>
      </div>
    </>
  );
}
