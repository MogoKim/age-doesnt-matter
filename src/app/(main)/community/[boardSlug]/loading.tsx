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

      {/* 목록 행 skeleton — PostCard 실제 행 구조(제목/preview 2줄/메타/통계)와 높이 일치 */}
      <div>
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="border-b border-border py-4 last:border-b-0 animate-pulse">
            {/* 제목 1줄 */}
            <div className="h-[27px] w-3/4 rounded bg-muted" />
            {/* preview 2줄 */}
            <div className="h-[46px] w-full rounded bg-muted mt-2" />
            {/* 메타(카테고리·작성자·시간) */}
            <div className="h-[26px] w-2/3 rounded bg-muted mt-2.5" />
            {/* 통계(공감·댓글·조회) */}
            <div className="h-[26px] w-1/3 rounded bg-muted mt-2" />
          </div>
        ))}
      </div>
    </div>
  )
}
