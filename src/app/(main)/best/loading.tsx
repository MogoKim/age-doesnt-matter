export default function BestLoading() {
  return (
    <div className="max-w-[960px] mx-auto px-4 py-4">
      {/* 탭 skeleton — 실제 탭 높이 h-[52px] */}
      <div className="flex gap-2 pt-4 pb-2 mb-2">
        <div className="h-[52px] w-28 rounded-full bg-muted animate-pulse" />
        <div className="h-[52px] w-32 rounded-full bg-muted animate-pulse" />
      </div>

      {/* 목록 행 skeleton — PostCard 실제 행 구조(제목/preview 2줄/메타/통계)와 높이 일치 */}
      <div>
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="border-b border-border py-[18px] last:border-b-0 animate-pulse">
            {/* 제목 1줄 */}
            <div className="h-[25px] w-3/4 rounded bg-muted" />
            {/* preview 2줄 */}
            <div className="h-[48px] w-full rounded bg-muted mt-1.5" />
            {/* 메타(출처·닉네임·시간) */}
            <div className="h-[26px] w-2/3 rounded bg-muted mt-4" />
            {/* 통계(공감·댓글·조회) */}
            <div className="h-[26px] w-1/3 rounded bg-muted mt-1.5" />
          </div>
        ))}
      </div>
    </div>
  )
}
