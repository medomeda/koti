import { Bricolage_Grotesque } from "next/font/google";
import type { ReactNode } from "react";
import { DemoBanner } from "@/components/layout/demo-banner";
import { SiteFooter } from "@/components/marketing/site-footer";
import { isDemoMode } from "@/lib/demo";

const display = Bricolage_Grotesque({ subsets: ["latin"], variable: "--font-display", display: "swap" });

/** Site vitrine public : pages sans session. L'en-tête est ajouté par chaque page (le hero a sa propre variante). */
export default function MarketingLayout({ children }: { children: ReactNode }) {
  return (
    <div className={`${display.variable} flex min-h-dvh flex-col`}>
      {isDemoMode() && <DemoBanner />}
      <div className="flex-1">{children}</div>
      <SiteFooter />
    </div>
  );
}
