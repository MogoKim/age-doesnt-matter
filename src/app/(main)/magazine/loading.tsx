export default function MagazineLoading() {
  return (
    <div className="max-w-[960px] mx-auto px-4 py-6 md:px-6 md:py-8">
      <div className="h-8 w-32 rounded-lg bg-muted animate-pulse mb-6" />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-2xl border border-border bg-card overflow-hidden">
            <div className="h-[180px] bg-muted animate-pulse" />
            <div className="p-4">
              <div className="h-5 w-3/4 rounded bg-muted animate-pulse mb-2" />
              <div className="h-4 w-full rounded bg-muted animate-pulse mb-1" />
              <div className="h-4 w-2/3 rounded bg-muted animate-pulse" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
