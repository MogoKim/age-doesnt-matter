export default function MagazineLoading() {
  return (
    <div className="max-w-[960px] mx-auto px-4 py-6">
      {/* 카테고리 필터 skeleton */}
      <div className="flex gap-2 py-2 pb-4 mb-4 overflow-hidden">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-[52px] w-20 shrink-0 rounded-full bg-muted animate-pulse" />
        ))}
      </div>

      {/* 카드 skeleton — 실제 MagazineCard 구조와 일치 */}
      <div className="space-y-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex items-start gap-3 p-4 bg-card rounded-xl border border-border">
            {/* 썸네일 */}
            <div className="w-24 h-20 shrink-0 rounded-lg bg-muted animate-pulse" />
            <div className="flex-1 min-w-0 space-y-2">
              {/* 카테고리 */}
              <div className="h-4 w-14 rounded bg-muted animate-pulse" />
              {/* 제목 */}
              <div className="h-5 w-3/4 rounded bg-muted animate-pulse" />
              {/* preview */}
              <div className="h-4 w-full rounded bg-muted animate-pulse" />
              <div className="h-4 w-2/3 rounded bg-muted animate-pulse" />
              {/* meta */}
              <div className="h-3 w-24 rounded bg-muted animate-pulse" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
