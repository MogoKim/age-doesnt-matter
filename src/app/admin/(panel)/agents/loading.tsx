export default function AgentsLoading() {
  return (
    <div className="space-y-6">
      <div className="h-8 w-48 animate-pulse rounded bg-zinc-200" />
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-center justify-between rounded-lg border border-zinc-100 px-4 py-3">
            <div className="h-4 w-32 animate-pulse rounded bg-zinc-200" />
            <div className="h-4 w-24 animate-pulse rounded bg-zinc-100" />
          </div>
        ))}
      </div>
    </div>
  )
}
