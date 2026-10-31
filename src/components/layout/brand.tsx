import Link from "next/link";
import { cn } from "@/lib/utils/cn";

export function Logo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={cn("size-8", className)} aria-hidden>
      <rect width="32" height="32" rx="9" fill="#15803d" />
      <circle cx="16" cy="16" r="8.5" fill="none" stroke="#bbf7d0" strokeWidth="2.5" />
      <circle cx="16" cy="7.5" r="3" fill="#fff" />
      <circle cx="23.4" cy="20.3" r="3" fill="#fff" />
      <circle cx="8.6" cy="20.3" r="3" fill="#fff" />
    </svg>
  );
}

export function Brand({ dark, href = "/" }: { dark?: boolean; href?: string }) {
  return (
    <Link href={href} className="flex items-center gap-2.5" aria-label="KOTI — accueil">
      <Logo />
      <span className={cn("text-lg font-bold tracking-tight", dark ? "text-white" : "text-foreground")}>KOTI</span>
    </Link>
  );
}
