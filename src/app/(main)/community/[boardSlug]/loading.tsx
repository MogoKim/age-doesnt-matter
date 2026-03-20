export default function BoardLoading() {
  return (
    <div className="max-w-[720px] mx-auto px-4 py-6 md:px-6 md:py-8">
      {/* 헤더 */}
      <div className="h-8 w-32 rounded-lg bg-muted animate-pulse mb-6" />

      {/* 탭/정렬 */}
      <div className="flex gap-2 mb-6">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-10 w-20 rounded-xl bg-muted animate-pulse" />
        ))}
      </div>

      {/* 게시글 목록 */}
      <div className="space-y-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="p-4 rounded-2xl border border-border bg-card">
            <div className="h-5 w-3/4 rounded bg-muted animate-pulse mb-3" />
            <div className="h-4 w-full rounded bg-muted animate-pulse mb-2" />
            <div className="flex gap-4 mt-3">
              <div className="h-4 w-16 rounded bg-muted animate-pulse" />
              <div className="h-4 w-16 rounded bg-muted animate-pulse" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
