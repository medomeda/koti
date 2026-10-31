import { AlertTriangle, Inbox, Lock, SearchX } from "lucide-react";
import Link from "next/link";
import * as React from "react";
import type { Tone } from "@/lib/constants/labels";
import { cn } from "@/lib/utils/cn";

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn("animate-pulse rounded-md bg-muted", className)} />;
}

export function EmptyState({ title, description, action, icon, className }: { title: string; description?: React.ReactNode; action?: React.ReactNode; icon?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-col items-center justify-center px-4 py-12 text-center", className)}>
      <div className="mb-3 rounded-full bg-muted p-3 text-muted-foreground [&_svg]:size-6">{icon ?? <Inbox />}</div>
      <p className="text-sm font-semibold">{title}</p>
      {description && <p className="mt-1 max-w-sm text-sm text-muted-foreground">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function StatusScreen({ kind, title, description, action }: { kind: "forbidden" | "not-found" | "error"; title: string; description: React.ReactNode; action?: React.ReactNode }) {
  const icon = { forbidden: <Lock />, "not-found": <SearchX />, error: <AlertTriangle /> }[kind];
  const tone = { forbidden: "bg-warning-soft text-warning", "not-found": "bg-muted text-muted-foreground", error: "bg-destructive-soft text-destructive" }[kind];
  return (
    <div role={kind === "error" ? "alert" : undefined} className="flex flex-col items-center justify-center px-4 py-16 text-center">
      <div className={cn("mb-4 rounded-full p-4 [&_svg]:size-7", tone)}>{icon}</div>
      <h1 className="text-lg font-semibold">{title}</h1>
      <p className="mt-1 max-w-md text-sm text-muted-foreground">{description}</p>
      {action && <div className="mt-6 flex flex-wrap justify-center gap-2">{action}</div>}
    </div>
  );
}

const ALERT_TONES: Record<Tone, string> = {
  neutral: "border-border bg-muted/60 text-foreground",
  brand: "border-primary/25 bg-primary-soft text-primary-soft-foreground",
  success: "border-primary/25 bg-primary-soft text-primary-soft-foreground",
  warning: "border-warning/25 bg-warning-soft text-warning-soft-foreground",
  danger: "border-destructive/25 bg-destructive-soft text-destructive-soft-foreground",
};

export function Alert({ tone = "neutral", title, children, icon, action, className }: { tone?: Tone; title?: React.ReactNode; children?: React.ReactNode; icon?: React.ReactNode; action?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-wrap items-start gap-3 rounded-xl border px-4 py-3 text-sm sm:flex-nowrap", ALERT_TONES[tone], className)} role={tone === "danger" ? "alert" : "status"}>
      {icon && <span className="mt-0.5 shrink-0 [&_svg]:size-4">{icon}</span>}
      <div className="min-w-0 flex-1">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className={cn(title && "mt-0.5", "opacity-90")}>{children}</div>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

export function PageHeader({ title, description, actions, back }: { title: React.ReactNode; description?: React.ReactNode; actions?: React.ReactNode; back?: { href: string; label: string } }) {
  return (
    <div className="mb-6 space-y-1.5">
      {back && (
        <Link href={back.href} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-primary">
          ← {back.label}
        </Link>
      )}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">{title}</h1>
          {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </div>
  );
}

const STAT_ACCENT: Record<Tone, string> = {
  neutral: "text-foreground",
  brand: "text-primary",
  success: "text-primary",
  warning: "text-warning",
  danger: "text-destructive",
};

export function StatCard({ label, value, hint, tone = "neutral", icon, href }: { label: string; value: React.ReactNode; hint?: React.ReactNode; tone?: Tone; icon?: React.ReactNode; href?: string }) {
  const body = (
    <div className="flex h-full flex-col gap-1.5 p-4">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
        {icon && <span className="text-muted-foreground [&_svg]:size-4">{icon}</span>}
      </div>
      <div className={cn("text-xl font-semibold tabular-nums tracking-tight sm:text-2xl", STAT_ACCENT[tone])}>{value}</div>
      {hint && <div className="text-xs text-muted-foreground">{hint}</div>}
    </div>
  );
  const cls = "block rounded-xl border bg-card shadow-xs";
  return href ? (
    <Link href={href} className={cn(cls, "transition-colors hover:border-primary/40")}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}

export function DescriptionList({ items, className }: { items: Array<[React.ReactNode, React.ReactNode]>; className?: string }) {
  return (
    <dl className={cn("grid grid-cols-1 gap-x-6 gap-y-3.5 sm:grid-cols-2", className)}>
      {items.map(([k, v], i) => (
        <div key={i} className="min-w-0">
          <dt className="text-xs text-muted-foreground">{k}</dt>
          <dd className="mt-0.5 break-words text-sm font-medium">{v}</dd>
        </div>
      ))}
    </dl>
  );
}
