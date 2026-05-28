export default function BoardLoading() {
  return (
    <div className="max-w-[960px] mx-auto px-4 pt-4 pb-6 md:px-6 md:pb-8">
      {/* 카테고리 필터 + 정렬 skeleton */}
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="flex gap-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-[52px] w-16 rounded-full bg-muted animate-pulse" />
          ))}
        </div>
        <div className="flex gap-1">
          <div className="h-[52px] w-16 rounded-full bg-muted animate-pulse" />
          <div className="h-[52px] w-16 rounded-full bg-muted animate-pulse" />
        </div>
      </div>

      {/* PostCard skeleton — 실제 카드 구조와 일치 */}
      <div className="space-y-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="bg-card rounded-2xl p-6 border border-border flex flex-col gap-2.5">
            {/* 배지 */}
            <div className="h-6 w-16 rounded-full bg-muted animate-pulse" />
            {/* 제목 */}
            <div className="h-5 w-3/4 rounded bg-muted animate-pulse" />
            {/* preview 2줄 */}
            <div className="h-4 w-full rounded bg-muted animate-pulse" />
            <div className="h-4 w-2/3 rounded bg-muted animate-pulse" />
            {/* 작성자 */}
            <div className="h-4 w-32 rounded bg-muted animate-pulse" />
            {/* 메타 행 */}
            <div className="h-4 w-28 rounded bg-muted animate-pulse" />
          </div>
        ))}
      </div>
    </div>
  )
}
