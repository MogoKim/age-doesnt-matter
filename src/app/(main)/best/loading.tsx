export default function BestLoading() {
  return (
    <div className="max-w-[960px] mx-auto px-4 py-4">
      {/* 탭 skeleton — 실제 탭 높이 h-[52px] */}
      <div className="flex gap-2 pt-4 pb-2 mb-2">
        <div className="h-[52px] w-28 rounded-full bg-muted animate-pulse" />
        <div className="h-[52px] w-32 rounded-full bg-muted animate-pulse" />
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
            {/* 작성자/시간 */}
            <div className="h-4 w-40 rounded bg-muted animate-pulse" />
            {/* 메타 행 */}
            <div className="h-4 w-32 rounded bg-muted animate-pulse" />
          </div>
        ))}
      </div>
    </div>
  )
}
