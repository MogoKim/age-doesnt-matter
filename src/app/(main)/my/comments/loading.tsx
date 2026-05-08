export default function MyCommentsLoading() {
  return (
    <div className="max-w-[720px] mx-auto px-4 py-6 md:px-6 md:py-8">
      <div className="h-[52px] w-24 rounded-lg bg-muted animate-pulse mb-4" />
      <div className="h-7 w-28 rounded-lg bg-muted animate-pulse mb-6" />
      <div className="space-y-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="p-4 bg-card rounded-xl border border-border">
            <div className="h-5 w-full rounded bg-muted animate-pulse mb-2" />
            <div className="h-5 w-4/5 rounded bg-muted animate-pulse mb-3" />
            <div className="flex items-center gap-2">
              <div className="h-3.5 w-32 rounded bg-muted animate-pulse" />
              <div className="h-3.5 w-16 rounded bg-muted animate-pulse" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
