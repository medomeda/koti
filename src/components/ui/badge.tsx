import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";
import { cn } from "@/lib/utils/cn";

const badgeVariants = cva("inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium [&_svg]:size-3", {
  variants: {
    tone: {
      neutral: "bg-muted text-muted-foreground",
      brand: "bg-primary text-primary-foreground",
      success: "bg-primary-soft text-primary-soft-foreground",
      warning: "bg-warning-soft text-warning-soft-foreground",
      danger: "bg-destructive-soft text-destructive-soft-foreground",
    },
  },
  defaultVariants: { tone: "neutral" },
});

export interface BadgeProps extends React.ComponentProps<"span">, VariantProps<typeof badgeVariants> {
  /** Pastille colorée devant le libellé (le statut ne repose pas uniquement sur la couleur : le texte reste explicite). */
  dot?: boolean;
}

export function Badge({ className, tone, dot, children, ...props }: BadgeProps) {
  return (
    <span className={cn(badgeVariants({ tone }), className)} {...props}>
      {dot && <span aria-hidden className="size-1.5 rounded-full bg-current" />}
      {children}
    </span>
  );
}
