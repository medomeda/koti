import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils/cn";

/** Pagination par liens (?page=n) : fonctionne sans JavaScript et conserve les filtres. */
export function Pagination({ page, pages, total, hrefFor }: { page: number; pages: number; total: number; hrefFor: (page: number) => string }) {
  if (pages <= 1) return null;
  const link = (p: number, label: string, icon: React.ReactNode, disabled: boolean) =>
    disabled ? (
      <span aria-disabled className="inline-flex size-9 items-center justify-center rounded-lg border text-muted-foreground opacity-40">
        {icon}
      </span>
    ) : (
      <Link href={hrefFor(p)} aria-label={label} className={cn("inline-flex size-9 items-center justify-center rounded-lg border bg-card hover:bg-muted")}>
        {icon}
      </Link>
    );
  return (
    <nav aria-label="Pagination" className="flex items-center justify-between gap-3 border-t px-4 py-3 text-sm text-muted-foreground sm:px-5">
      <span>
        {total} résultats · page {page}/{pages}
      </span>
      <div className="flex gap-1.5">
        {link(page - 1, "Page précédente", <ChevronLeft className="size-4" />, page <= 1)}
        {link(page + 1, "Page suivante", <ChevronRight className="size-4" />, page >= pages)}
      </div>
    </nav>
  );
}
