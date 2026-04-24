export default function SearchLoading() {
  return (
    <div className="max-w-[960px] mx-auto px-4 py-6 md:px-6 md:py-8">
      <div className="h-12 w-full rounded-xl bg-muted animate-pulse mb-6" />
      <div className="h-6 w-48 rounded bg-muted animate-pulse mb-4" />
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-20 rounded-xl bg-muted animate-pulse" />
        ))}
      </div>
    </div>
  )
}
