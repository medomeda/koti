import Link from "next/link";
import { Brand } from "@/components/layout/brand";

export function SiteFooter() {
  return (
    <footer className="border-t bg-card">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 sm:px-6 md:grid-cols-[1.4fr_1fr_1fr]">
        <div className="space-y-3">
          <Brand />
          <p className="max-w-sm text-sm text-muted-foreground">KOTI aide à organiser les tontines : membres, cotisations, validation des paiements et tours de main. KOTI ne détient et ne transfère aucun fonds.</p>
        </div>
        <nav aria-label="Produit" className="space-y-2 text-sm">
          <p className="font-semibold">Produit</p>
          <Link href="/fonctionnalites" className="block text-muted-foreground hover:text-foreground">Fonctionnalités</Link>
          <Link href="/tarifs" className="block text-muted-foreground hover:text-foreground">Tarifs</Link>
          <Link href="/faq" className="block text-muted-foreground hover:text-foreground">Questions fréquentes</Link>
        </nav>
        <nav aria-label="Informations" className="space-y-2 text-sm">
          <p className="font-semibold">Informations</p>
          <Link href="/contact" className="block text-muted-foreground hover:text-foreground">Nous contacter</Link>
          <Link href="/cgu" className="block text-muted-foreground hover:text-foreground">Conditions d&apos;utilisation</Link>
          <Link href="/confidentialite" className="block text-muted-foreground hover:text-foreground">Confidentialité</Link>
        </nav>
      </div>
      <p className="border-t px-4 py-4 text-center text-xs text-muted-foreground">© {new Date().getFullYear()} KOTI. KOTI ne détient ni ne transfère aucun fonds.</p>
    </footer>
  );
}
