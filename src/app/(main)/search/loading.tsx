export default function SearchLoading() {
  return (
    <div>
      {/* 검색 입력 바 */}
      <div className="flex items-center gap-3 p-4 bg-card border-b border-border">
        <div className="w-[52px] h-[52px] rounded-xl bg-muted animate-pulse shrink-0" />
        <div className="flex-1 h-[52px] rounded-xl bg-muted animate-pulse" />
        <div className="w-[52px] h-[52px] rounded-xl bg-muted animate-pulse shrink-0" />
      </div>

      {/* 탭 바 */}
      <div className="flex border-b border-border bg-card">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex-1 flex justify-center items-center h-[52px] px-4">
            <div className="h-4 w-10 rounded bg-muted animate-pulse" />
          </div>
        ))}
      </div>

      {/* 결과 목록 */}
      <div className="px-4 py-6 space-y-8">
        {/* 검색 결과 수 */}
        <div className="h-5 w-40 rounded bg-muted animate-pulse" />

        {/* 결과 행 skeleton — SearchResultCard 실제 행 구조(제목/preview 2줄/메타/통계)와 높이 일치 */}
        <div>
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="border-b border-border py-[18px] last:border-b-0 animate-pulse">
              {/* 제목 1줄 */}
              <div className="h-[25px] w-3/4 rounded bg-muted" />
              {/* preview 2줄 */}
              <div className="h-[48px] w-full rounded bg-muted mt-1.5" />
              {/* 메타(카테고리·작성자·시간) */}
              <div className="h-[26px] w-2/3 rounded bg-muted mt-4" />
              {/* 통계(좋아요·댓글) */}
              <div className="h-[26px] w-1/4 rounded bg-muted mt-1.5" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
