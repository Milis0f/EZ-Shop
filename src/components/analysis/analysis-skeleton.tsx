import { Skeleton } from "@/components/ui/skeleton";

/** Same silhouette as the analysis page, so nothing jumps when the data streams in. */
export function AnalysisSkeleton() {
  return (
    <div role="status" aria-label="Chargement de l'analyse">
      <Skeleton className="h-9 w-80" />
      <Skeleton className="mt-4 h-4 w-[30rem] max-w-full" />
      <Skeleton className="mt-2 h-4 w-72" />
      <div className="panel mt-12 grid grid-cols-2 gap-px overflow-hidden lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="space-y-3 px-6 py-5">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-7 w-20" />
          </div>
        ))}
      </div>
      <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_20rem]">
        <Skeleton className="h-[26rem] rounded-panel" />
        <Skeleton className="h-64 rounded-panel" />
      </div>
      <div className="panel mt-16 space-y-4 p-5">
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="h-8" style={{ opacity: 1 - i * 0.12 }} />
        ))}
      </div>
    </div>
  );
}
