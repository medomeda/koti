import type { Metadata, Viewport } from "next";
import { IBM_Plex_Sans } from "next/font/google";
import type { ReactNode } from "react";
import { connection } from "next/server";
import { Toaster } from "sonner";
import { DatabaseUnavailable } from "@/components/layout/database-unavailable";
import { PwaManager } from "@/components/pwa/pwa-manager";
import { checkDatabase } from "@/server/db/health";
import "./globals.css";

const plex = IBM_Plex_Sans({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-plex", display: "swap" });

export const metadata: Metadata = {
  title: { default: "KOTI — Gestion de tontines", template: "%s · KOTI" },
  description: "Créez, organisez et suivez vos tontines : membres, cotisations, paiements et tours de main.",
  robots: { index: false, follow: false },
  applicationName: "KOTI",
  // iPhone : lancement plein écran depuis l'écran d'accueil (manifest + icônes : app/manifest.ts, app/apple-icon.png).
  appleWebApp: { capable: true, title: "KOTI", statusBarStyle: "default" },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#15803d" };

export default async function RootLayout({ children }: { children: ReactNode }) {
  // Rendu à chaque requête (jamais figé au build) : si la base est injoignable, un message clair remplace la page
  // (au lieu d'une erreur technique). Le contrôle est mémorisé quelques secondes.
  await connection();
  const db = await checkDatabase();
  return (
    <html lang="fr" className={plex.variable}>
      {/* suppressHydrationWarning : des extensions de navigateur (ex. ColorZilla) ajoutent des attributs à <body> avant l'hydratation. */}
      <body suppressHydrationWarning>
        {db.ok ? (
          <>
            {children}
            <Toaster position="top-center" richColors closeButton toastOptions={{ duration: 4000 }} />
            <PwaManager />
          </>
        ) : (
          <DatabaseUnavailable detail={process.env.NODE_ENV === "production" ? undefined : db.detail} />
        )}
      </body>
    </html>
  );
}
