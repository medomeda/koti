import type { Metadata, Viewport } from "next";
import { IBM_Plex_Sans } from "next/font/google";
import type { ReactNode } from "react";
import { Toaster } from "sonner";
import { PwaManager } from "@/components/pwa/pwa-manager";
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

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="fr" className={plex.variable}>
      {/* suppressHydrationWarning : des extensions de navigateur (ex. ColorZilla) ajoutent des attributs à <body> avant l'hydratation. */}
      <body suppressHydrationWarning>
        {children}
        <Toaster position="top-center" richColors closeButton toastOptions={{ duration: 4000 }} />
        <PwaManager />
      </body>
    </html>
  );
}
