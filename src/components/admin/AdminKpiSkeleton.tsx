export default function AdminKpiSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="rounded-xl border border-zinc-200 bg-white p-5">
          <div className="flex items-center justify-between">
            <div className="h-4 w-16 animate-pulse rounded bg-zinc-200" />
            <div className="size-6 animate-pulse rounded bg-zinc-100" />
          </div>
          <div className="mt-3 h-8 w-20 animate-pulse rounded bg-zinc-200" />
        </div>
      ))}
    </div>
  )
}
