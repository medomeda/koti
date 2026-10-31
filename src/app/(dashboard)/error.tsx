"use client";

import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatusScreen } from "@/components/ui/feedback";

export default function DashboardError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <StatusScreen
      kind="error"
      title="Une erreur est survenue"
      description={<>Le chargement de la page a échoué. Réessayez dans un instant.{error.digest && <span className="mt-1 block text-xs">Référence : {error.digest}</span>}</>}
      action={<Button onClick={reset}><RefreshCw /> Réessayer</Button>}
    />
  );
}
