"use client";

import { ArrowLeft, CreditCard, LayoutDashboard, LogOut, Mail, Megaphone, ScrollText, SlidersHorizontal, Users, Landmark } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { logoutAction } from "@/actions/auth";
import { Brand } from "@/components/layout/brand";
import { clearAppCaches } from "@/components/pwa/pwa-store";
import { Avatar, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/misc";
import { cn } from "@/lib/utils/cn";

const NAV = [
  { href: "/admin", label: "Tableau de bord", icon: LayoutDashboard, exact: true },
  { href: "/admin/clients", label: "Clients", icon: Users },
  { href: "/admin/tontines", label: "Tontines", icon: Landmark },
  { href: "/admin/abonnements", label: "Abonnements", icon: CreditCard },
  { href: "/admin/offres", label: "Offres", icon: SlidersHorizontal },
  { href: "/admin/messages", label: "Messages", icon: Mail },
  { href: "/admin/annonces", label: "Annonces", icon: Megaphone },
  { href: "/admin/audit", label: "Journal", icon: ScrollText },
] as const;

const isActive = (pathname: string, href: string, exact?: boolean) => (exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`));

export function AdminShell({ user, role, newMessages, banner, children }: { user: { fullName: string; email: string }; role: "SUPPORT" | "SUPER_ADMIN"; newMessages: number; banner?: ReactNode; children: ReactNode }) {
  const pathname = usePathname();
  const roleLabel = role === "SUPER_ADMIN" ? "Super-admin" : "Support";
  return (
    <div className="min-h-dvh lg:pl-60">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col bg-sidebar px-3 py-5 lg:flex">
        <div className="px-2">
          <Brand dark href="/admin" />
          <p className="mt-2 text-xs font-medium text-sidebar-muted">Administration de la plateforme</p>
        </div>
        <nav aria-label="Administration" className="mt-7 flex-1 space-y-0.5">
          {NAV.map((item) => {
            const active = isActive(pathname, item.href, "exact" in item && item.exact);
            const Icon = item.icon;
            return (
              <Link key={item.href} href={item.href} aria-current={active ? "page" : undefined} className={cn("flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors", active ? "bg-white/10 text-white" : "text-sidebar-foreground hover:bg-white/5 hover:text-white")}>
                <Icon className={cn("size-[18px]", active ? "text-[#f4c04e]" : "text-sidebar-muted")} aria-hidden />
                <span className="flex-1">{item.label}</span>
                {item.href === "/admin/messages" && newMessages > 0 && <span className="min-w-5 rounded-full bg-destructive px-1.5 text-center text-[11px] font-semibold leading-5 text-white tabular-nums">{newMessages}</span>}
              </Link>
            );
          })}
        </nav>
        <Link href="/" className="flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm text-sidebar-foreground hover:bg-white/5 hover:text-white">
          <ArrowLeft className="size-4" aria-hidden /> Retour à l&apos;application
        </Link>
        <p className="mt-2 px-3 text-[11px] leading-snug text-sidebar-muted">Vous voyez des agrégats : le détail des paiements des membres n&apos;est jamais exposé.</p>
      </aside>

      {banner}

      <header className="sticky top-0 z-20 border-b bg-card/90 backdrop-blur">
        <div className="flex h-14 items-center gap-3 px-4 sm:px-6">
          <div className="lg:hidden">
            <Brand href="/admin" />
          </div>
          <span className="rounded-full bg-primary-soft px-2.5 py-0.5 text-xs font-semibold text-primary-soft-foreground">{roleLabel}</span>
          <div className="flex-1" />
          <DropdownMenu>
            <DropdownMenuTrigger className="flex items-center gap-2 rounded-lg p-1 transition-colors hover:bg-muted" aria-label="Menu du compte">
              <Avatar name={user.fullName} className="size-8" />
              <span className="hidden max-w-40 truncate text-sm font-medium md:block">{user.fullName}</span>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuLabel>{user.email}</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link href="/">
                  <ArrowLeft /> Retour à l&apos;application
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem destructive onSelect={() => void clearAppCaches().then(() => logoutAction())}>
                <LogOut /> Se déconnecter
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        {/* Mobile : onglets défilants */}
        <nav aria-label="Administration" className="scrollbar-thin flex gap-1 overflow-x-auto px-3 pb-2 lg:hidden">
          {NAV.map((item) => {
            const active = isActive(pathname, item.href, "exact" in item && item.exact);
            return (
              <Link key={item.href} href={item.href} aria-current={active ? "page" : undefined} className={cn("flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium", active ? "bg-primary-soft text-primary-soft-foreground" : "text-muted-foreground hover:bg-muted")}>
                {item.label}
                {item.href === "/admin/messages" && newMessages > 0 && <span className="rounded-full bg-destructive px-1.5 text-[11px] font-semibold leading-4 text-white">{newMessages}</span>}
              </Link>
            );
          })}
        </nav>
      </header>

      <main id="contenu" className="mx-auto w-full max-w-7xl px-4 pb-12 pt-5 sm:px-6 lg:px-8 lg:pt-7">
        {children}
      </main>
    </div>
  );
}
