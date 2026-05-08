export default function MySettingsLoading() {
  return (
    <div className="max-w-[720px] mx-auto px-4 py-6 md:px-6 md:py-8">
      <div className="h-[52px] w-24 rounded-lg bg-muted animate-pulse mb-4" />
      <div className="h-7 w-20 rounded-lg bg-muted animate-pulse mb-6" />
      <div className="space-y-6">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="bg-card rounded-2xl p-4 md:p-6 border border-border">
            <div className="h-5 w-28 rounded bg-muted animate-pulse mb-4" />
            <div className="space-y-3">
              <div className="h-[52px] w-full rounded-xl bg-muted animate-pulse" />
              {i === 0 && (
                <div className="h-3.5 w-48 rounded bg-muted animate-pulse" />
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
