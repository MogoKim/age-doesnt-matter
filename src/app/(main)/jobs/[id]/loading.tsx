export default function JobDetailLoading() {
  return (
    <div className="max-w-[720px] mx-auto px-4 py-6 md:px-6 md:py-8">
      {/* 뒤로가기 */}
      <div className="h-[52px] flex items-center mb-4">
        <div className="h-5 w-24 rounded bg-muted animate-pulse" />
      </div>

      {/* 태그 */}
      <div className="flex gap-1.5 mb-3">
        <div className="h-6 w-16 rounded-full bg-muted animate-pulse" />
        <div className="h-6 w-12 rounded-full bg-muted animate-pulse" />
      </div>

      {/* 제목 */}
      <div className="h-8 w-4/5 rounded bg-muted animate-pulse mb-2" />
      <div className="h-5 w-3/5 rounded bg-muted animate-pulse mb-6" />

      {/* 정보 카드 */}
      <div className="bg-card rounded-xl border border-border p-5 mb-6 space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-5 w-3/4 rounded bg-muted animate-pulse" />
        ))}
      </div>

      {/* 이런 분을 찾아요 */}
      <div className="bg-primary/5 rounded-xl p-5 mb-6 space-y-2">
        <div className="h-5 w-32 rounded bg-muted animate-pulse mb-3" />
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-5 w-full rounded bg-muted animate-pulse" />
        ))}
      </div>

      {/* 본문 */}
      <div className="bg-card rounded-xl p-6 mb-8 space-y-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className={`h-4 rounded bg-muted animate-pulse ${i % 3 === 2 ? 'w-3/4' : 'w-full'}`}
          />
        ))}
      </div>

      {/* 지원 방법 */}
      <div className="mb-8">
        <div className="h-5 w-24 rounded bg-muted animate-pulse mb-3" />
        <div className="h-[52px] w-full rounded-xl bg-muted animate-pulse lg:w-32" />
      </div>

      {/* ActionBar */}
      <div className="fixed bottom-0 left-0 right-0 h-[68px] bg-card border-t border-border animate-pulse" />

      {/* 댓글 */}
      <div className="space-y-4 mt-8">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-20 bg-muted animate-pulse rounded-xl" />
        ))}
      </div>
    </div>
  )
}
