import { Skeleton } from "@/components/ui/feedback";

export default function Loading() {
  return (
    <div role="status" aria-label="Chargement" className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
      </div>
      <Skeleton className="h-80 rounded-xl" />
    </div>
  );
}
