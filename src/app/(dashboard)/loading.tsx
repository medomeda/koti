import { Skeleton } from "@/components/ui/feedback";

export default function Loading() {
  return (
    <div role="status" aria-label="Chargement" className="space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-7 w-56" />
        <Skeleton className="h-4 w-80 max-w-full" />
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 3 }, (_, i) => <Skeleton key={i} className="h-60 rounded-xl" />)}
      </div>
      <span className="sr-only">Chargement…</span>
    </div>
  );
}
