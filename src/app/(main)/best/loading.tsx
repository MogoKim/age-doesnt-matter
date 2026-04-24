export default function BestLoading() {
  return (
    <div className="max-w-[960px] mx-auto px-4 py-6 md:px-6 md:py-8">
      <div className="h-8 w-40 rounded-lg bg-muted animate-pulse mb-6" />
      <div className="flex gap-2 mb-6">
        <div className="h-10 w-20 rounded-full bg-muted animate-pulse" />
        <div className="h-10 w-28 rounded-full bg-muted animate-pulse" />
      </div>
      <div className="space-y-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-24 rounded-2xl bg-muted animate-pulse" />
        ))}
      </div>
    </div>
  )
}
