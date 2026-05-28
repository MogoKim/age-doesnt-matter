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

        {/* 결과 카드 */}
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="p-4 bg-card rounded-xl border border-border space-y-2">
              <div className="h-4 w-16 rounded-full bg-muted animate-pulse" />
              <div className="h-5 w-full rounded bg-muted animate-pulse" />
              <div className="h-4 w-3/4 rounded bg-muted animate-pulse" />
              <div className="flex gap-3 mt-1">
                <div className="h-3 w-16 rounded bg-muted animate-pulse" />
                <div className="h-3 w-10 rounded bg-muted animate-pulse" />
                <div className="h-3 w-10 rounded bg-muted animate-pulse" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
