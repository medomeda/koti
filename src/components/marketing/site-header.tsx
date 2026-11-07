import { Menu } from "lucide-react";
import Link from "next/link";
import { Brand } from "@/components/layout/brand";
import { Button } from "@/components/ui/button";
import { getSession } from "@/lib/auth/session";

export const NAV = [
  { href: "/fonctionnalites", label: "Fonctionnalités" },
  { href: "/tarifs", label: "Tarifs" },
  { href: "/faq", label: "Questions fréquentes" },
  { href: "/contact", label: "Contact" },
];

/** En-tête du site vitrine. Menu mobile sans JavaScript (élément <details>). */
export async function SiteHeader({ dark }: { dark?: boolean }) {
  const user = await getSession();
  return (
    <header className={dark ? "bg-sidebar text-white" : "border-b bg-background"}>
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-6 px-4 sm:px-6">
        <Brand dark={dark} href={user ? "/" : "/"} />
        <nav aria-label="Navigation principale" className="ml-4 hidden items-center gap-1 md:flex">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} className={dark ? "rounded-md px-3 py-2 text-sm text-sidebar-foreground hover:bg-white/10 hover:text-white" : "rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"}>
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="ml-auto hidden items-center gap-2 md:flex">
          {user ? (
            <Button asChild>
              <Link href="/">Mon espace</Link>
            </Button>
          ) : (
            <>
              <Button asChild variant={dark ? "ghost" : "ghost"} className={dark ? "text-white hover:bg-white/10 hover:text-white" : undefined}>
                <Link href="/login">Se connecter</Link>
              </Button>
              <Button asChild>
                <Link href="/register">Créer un compte</Link>
              </Button>
            </>
          )}
        </div>
        <details className="group relative ml-auto md:hidden">
          <summary className={`flex size-10 cursor-pointer list-none items-center justify-center rounded-md [&::-webkit-details-marker]:hidden ${dark ? "hover:bg-white/10" : "hover:bg-muted"}`} aria-label="Ouvrir le menu">
            <Menu className="size-5" aria-hidden />
          </summary>
          <div className="absolute right-0 top-12 z-30 w-64 rounded-xl border bg-card p-2 text-foreground shadow-lg">
            {NAV.map((n) => (
              <Link key={n.href} href={n.href} className="block rounded-md px-3 py-2.5 text-sm hover:bg-muted">
                {n.label}
              </Link>
            ))}
            <div className="mt-2 grid gap-2 border-t pt-2">
              {user ? (
                <Button asChild>
                  <Link href="/">Mon espace</Link>
                </Button>
              ) : (
                <>
                  <Button asChild variant="outline">
                    <Link href="/login">Se connecter</Link>
                  </Button>
                  <Button asChild>
                    <Link href="/register">Créer un compte</Link>
                  </Button>
                </>
              )}
            </div>
          </div>
        </details>
      </div>
    </header>
  );
}
