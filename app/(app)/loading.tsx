import { Skeleton } from "@/components/ui/skeleton";

// Feed loading skeleton (three-pane).
export default function FeedLoading() {
  return (
    <div className="flex h-full">
      <div className="hidden w-1/5 shrink-0 space-y-4 border-r border-border p-4 lg:block">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="space-y-2">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-8 w-full" />
          </div>
        ))}
      </div>
      <div className="w-full divide-y divide-border lg:w-2/5">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="space-y-2 p-4">
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-3 w-1/2" />
            <Skeleton className="h-3 w-1/3" />
          </div>
        ))}
      </div>
      <div className="hidden flex-1 space-y-4 p-5 lg:block">
        <Skeleton className="h-6 w-1/2" />
        <Skeleton className="h-4 w-1/3" />
        <Skeleton className="h-32 w-full rounded-lg" />
      </div>
    </div>
  );
}
