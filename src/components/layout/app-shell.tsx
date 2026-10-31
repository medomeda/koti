"use client";

import { Bell, CircleUserRound, CreditCard, Home, LogOut, Users } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { logoutAction } from "@/actions/auth";
import { Avatar, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/misc";
import { cn } from "@/lib/utils/cn";
import { Brand } from "./brand";

const NAV = [
  { href: "/", label: "Accueil", icon: Home, exact: true },
  { href: "/tontines", label: "Tontines", icon: Users },
  { href: "/payments", label: "Paiements", icon: CreditCard },
  { href: "/alerts", label: "Alertes", icon: Bell },
  { href: "/profile", label: "Profil", icon: CircleUserRound },
] as const;

function isActive(pathname: string, href: string, exact?: boolean) {
  return exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
}

interface ShellUser {
  fullName: string;
  email: string;
  avatarUrl: string | null;
}

function CountBadge({ count, className }: { count: number; className?: string }) {
  if (count <= 0) return null;
  return <span className={cn("min-w-5 rounded-full bg-destructive px-1.5 text-center text-[11px] font-semibold leading-5 text-white tabular-nums", className)}>{count > 99 ? "99+" : count}</span>;
}

export function AppShell({ user, unread, pendingPayments, children }: { user: ShellUser; unread: number; pendingPayments: number; children: ReactNode }) {
  const pathname = usePathname();
  const badgeFor = (href: string) => (href === "/alerts" ? unread : href === "/payments" ? pendingPayments : 0);

  return (
    <div className="min-h-dvh lg:pl-64">
      {/* Navigation latérale — desktop */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col bg-sidebar px-3 py-5 lg:flex">
        <div className="px-2">
          <Brand dark />
        </div>
        <nav aria-label="Navigation principale" className="mt-8 flex-1 space-y-0.5">
          {NAV.map((item) => {
            const active = isActive(pathname, item.href, "exact" in item && item.exact);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                  active ? "bg-white/10 text-white" : "text-sidebar-foreground hover:bg-white/5 hover:text-white",
                )}
              >
                <Icon className={cn("size-[18px]", active ? "text-green-300" : "text-sidebar-muted")} aria-hidden />
                <span className="flex-1">{item.label}</span>
                <CountBadge count={badgeFor(item.href)} />
              </Link>
            );
          })}
        </nav>
        <p className="px-3 text-[11px] leading-snug text-sidebar-muted">KOTI ne détient ni ne transfère aucun fonds. Les paiements sont déclarés par les membres et validés par l&apos;administrateur.</p>
      </aside>

      {/* En-tête */}
      <header className="sticky top-0 z-20 flex h-14 items-center gap-2 border-b bg-card/90 px-4 backdrop-blur sm:px-6">
        <div className="lg:hidden">
          <Brand />
        </div>
        <div className="flex-1" />
        <Link href="/alerts" className="relative rounded-lg p-2.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground" aria-label={unread ? `Alertes (${unread} non lues)` : "Alertes"}>
          <Bell className="size-5" />
          {unread > 0 && (
            <>
              {/* Mobile : compteur (les alertes ne sont plus dans la barre du bas). Desktop : simple pastille. */}
              <CountBadge count={unread} className="absolute -right-0.5 -top-0.5 ring-2 ring-card lg:hidden" />
              <span className="absolute right-1.5 top-1.5 hidden size-2.5 rounded-full bg-destructive ring-2 ring-card lg:block" aria-hidden />
            </>
          )}
        </Link>
        <DropdownMenu>
          <DropdownMenuTrigger className="flex items-center gap-2 rounded-lg p-1 transition-colors hover:bg-muted" aria-label="Menu du compte">
            <Avatar name={user.fullName} src={user.avatarUrl} className="size-8" />
            <span className="hidden max-w-40 truncate text-sm font-medium md:block">{user.fullName}</span>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuLabel>{user.email}</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href="/profile">
                <CircleUserRound /> Mon profil
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem destructive onSelect={() => void logoutAction()}>
              <LogOut /> Se déconnecter
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </header>

      <main id="contenu" className="mx-auto w-full max-w-6xl px-4 pb-28 pt-5 sm:px-6 lg:px-8 lg:pb-10 lg:pt-7">
        {children}
      </main>

      {/* Bottom Navigation Bar — mobile (4 entrées, pas de bouton central). Les alertes passent par la cloche de l'en-tête. */}
      <nav aria-label="Navigation principale" className="fixed inset-x-0 bottom-0 z-30 border-t bg-card/95 pb-safe backdrop-blur lg:hidden">
        <ul className="mx-auto grid max-w-lg grid-cols-4">
          {NAV.filter((item) => item.href !== "/alerts").map((item) => {
            const active = isActive(pathname, item.href, "exact" in item && item.exact);
            const Icon = item.icon;
            const count = badgeFor(item.href);
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cn("relative flex min-h-14 flex-col items-center justify-center gap-0.5 text-[11px] font-medium transition-colors", active ? "text-primary" : "text-muted-foreground hover:text-foreground")}
                >
                  <span className={cn("rounded-full px-4 py-1 transition-colors", active && "bg-primary-soft")}>
                    <Icon className="size-5" aria-hidden />
                  </span>
                  {item.label}
                  {count > 0 && <CountBadge count={count} className="absolute left-1/2 top-1 ml-2.5" />}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}
