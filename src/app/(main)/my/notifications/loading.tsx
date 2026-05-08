export default function MyNotificationsLoading() {
  return (
    <div className="max-w-[720px] mx-auto px-4 py-6 md:px-6 md:py-8">
      <div className="h-[52px] w-24 rounded-lg bg-muted animate-pulse mb-4" />
      <div className="h-7 w-28 rounded-lg bg-muted animate-pulse mb-6" />
      <div className="space-y-2">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="flex items-start gap-3 p-4 bg-card rounded-xl border border-border">
            <div className="h-9 w-9 rounded-full bg-muted animate-pulse shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <div className="h-4 w-full rounded bg-muted animate-pulse mb-2" />
              <div className="h-4 w-2/3 rounded bg-muted animate-pulse mb-2" />
              <div className="h-3.5 w-20 rounded bg-muted animate-pulse" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
