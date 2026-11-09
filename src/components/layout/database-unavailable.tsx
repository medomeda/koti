"use client";

import { DatabaseZap, RotateCw } from "lucide-react";
import { Brand } from "./brand";

/**
 * Page affichée quand la base de données est injoignable (au démarrage ou en cours de route).
 * Le détail technique n'apparaît qu'en développement : un visiteur ne voit jamais d'erreur de serveur.
 */
export function DatabaseUnavailable({ detail }: { detail?: string }) {
  return (
    <main className="flex min-h-dvh flex-col items-center px-4 py-8">
      <Brand />
      <div className="my-auto w-full max-w-md py-10 text-center">
        <div className="mx-auto mb-5 flex size-16 items-center justify-center rounded-full bg-warning-soft text-warning-soft-foreground">
          <DatabaseZap className="size-8" aria-hidden />
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">Service momentanément indisponible</h1>
        <p className="mt-3 leading-relaxed text-muted-foreground">
          KOTI n&apos;arrive pas à joindre sa base de données. Vos données ne sont pas perdues : réessayez dans quelques instants.
        </p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="mt-6 inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-primary px-5 text-sm font-semibold text-primary-foreground shadow-xs transition-colors hover:bg-primary/90"
        >
          <RotateCw className="size-4" aria-hidden /> Réessayer
        </button>
        <p className="mt-4 text-sm text-muted-foreground">Si le problème persiste, contactez l&apos;équipe KOTI.</p>
        {detail && (
          <div role="note" className="mt-8 rounded-lg border border-dashed bg-muted/60 p-4 text-left text-sm">
            <p className="font-medium">Détail pour le développement</p>
            <p className="mt-1 font-mono text-xs">{detail}</p>
            <p className="mt-2 text-xs text-muted-foreground">Vérifiez que PostgreSQL est démarré et que <code className="rounded bg-card px-1">DATABASE_URL</code> (fichier <code className="rounded bg-card px-1">.env.local</code>) est correct, puis rechargez la page.</p>
          </div>
        )}
      </div>
    </main>
  );
}
