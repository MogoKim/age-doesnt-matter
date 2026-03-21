export default function MyLoading() {
  return (
    <div className="max-w-[960px] mx-auto px-4 py-6 md:px-6 md:py-8">
      <div className="h-8 w-32 rounded-lg bg-muted animate-pulse mb-6" />
      <div className="rounded-2xl border border-border p-6 mb-6">
        <div className="flex items-center gap-4 mb-4">
          <div className="h-16 w-16 rounded-full bg-muted animate-pulse" />
          <div className="space-y-2">
            <div className="h-5 w-24 rounded bg-muted animate-pulse" />
            <div className="h-4 w-16 rounded bg-muted animate-pulse" />
          </div>
        </div>
        <div className="grid grid-cols-3 gap-4 mt-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-16 rounded-xl bg-muted animate-pulse" />
          ))}
        </div>
      </div>
    </div>
  )
}
