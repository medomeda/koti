import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = { title: "Connexion à l'administration", robots: { index: false, follow: false } };
// Le bandeau de démonstration dépend de variables lues à l'exécution : pas de pré-rendu statique.
export const dynamic = "force-dynamic";

export default function AdminLoginLayout({ children }: { children: ReactNode }) {
  return <div className="min-h-dvh bg-sidebar text-white">{children}</div>;
}
