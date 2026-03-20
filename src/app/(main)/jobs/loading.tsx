export default function JobsLoading() {
  return (
    <div className="max-w-[960px] mx-auto px-4 py-6 md:px-6 md:py-8">
      <div className="h-8 w-32 rounded-lg bg-muted animate-pulse mb-6" />

      {/* 필터 태그 */}
      <div className="flex gap-2 mb-6 flex-wrap">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-9 w-20 rounded-full bg-muted animate-pulse" />
        ))}
      </div>

      {/* 잡 카드 리스트 */}
      <div className="space-y-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="p-5 rounded-2xl border border-border bg-card">
            <div className="h-5 w-2/3 rounded bg-muted animate-pulse mb-2" />
            <div className="h-4 w-1/3 rounded bg-muted animate-pulse mb-3" />
            <div className="flex gap-2">
              <div className="h-7 w-16 rounded-full bg-muted animate-pulse" />
              <div className="h-7 w-16 rounded-full bg-muted animate-pulse" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
