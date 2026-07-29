export default function BestLoading() {
  return (
    <div className="max-w-[960px] mx-auto px-4 py-4">
      {/* 탭 skeleton — 실제 탭 높이 h-[52px] */}
      <div className="flex gap-2 pt-4 pb-2 mb-2">
        <div className="h-[52px] w-28 rounded-full bg-muted animate-pulse" />
        <div className="h-[52px] w-32 rounded-full bg-muted animate-pulse" />
      </div>

      {/* 목록 행 skeleton — PostCard 실제 행 구조(제목/preview/메타)와 높이 일치 */}
      <div>
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="border-b border-border py-3.5 last:border-b-0 animate-pulse">
            {/* 제목 1줄 */}
            <div className="h-[27px] w-3/4 rounded bg-muted" />
            {/* preview 1줄 */}
            <div className="h-[22px] w-full rounded bg-muted mt-1" />
            {/* 메타(보드배지·작성자·시간 + 통계) */}
            <div className="h-[25px] w-2/3 rounded bg-muted mt-1.5" />
          </div>
        ))}
      </div>
    </div>
  )
}
