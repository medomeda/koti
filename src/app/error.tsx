"use client";

import { RotateCw, TriangleAlert } from "lucide-react";
import { DatabaseUnavailable } from "@/components/layout/database-unavailable";
import { DB_UNAVAILABLE_DIGEST } from "@/server/db/availability";

/**
 * Erreur survenue pendant l'affichage d'une page. Base de données injoignable (panne en cours de route) : message dédié ;
 * toute autre erreur : message neutre, sans détail technique (le détail est dans les journaux du serveur).
 */
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  // Aucun détail technique pour l'utilisateur : seul le code de référence (digest) est affiché ; le détail est dans les journaux du serveur.
  if (error.digest === DB_UNAVAILABLE_DIGEST) return <DatabaseUnavailable />;
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-4 text-center">
      <div className="mb-5 flex size-16 items-center justify-center rounded-full bg-destructive-soft text-destructive">
        <TriangleAlert className="size-8" aria-hidden />
      </div>
      <h1 className="text-2xl font-semibold tracking-tight">Une erreur est survenue</h1>
      <p className="mt-3 max-w-md text-muted-foreground">Nous n&apos;avons pas pu afficher cette page. Réessayez ; si cela se reproduit, contactez l&apos;équipe KOTI{error.digest ? ` en communiquant le code ${error.digest}` : ""}.</p>
      <button type="button" onClick={reset} className="mt-6 inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-primary px-5 text-sm font-semibold text-primary-foreground hover:bg-primary/90">
        <RotateCw className="size-4" aria-hidden /> Réessayer
      </button>
    </main>
  );
}
