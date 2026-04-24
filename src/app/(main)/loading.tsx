export default function MainLoading() {
  return (
    <div className="max-w-[960px] mx-auto px-4 py-6 md:px-6 md:py-8">
      {/* 히어로 스켈레톤 */}
      <div className="h-[200px] md:h-[280px] rounded-2xl bg-muted animate-pulse mb-8" />

      {/* 섹션 타이틀 */}
      <div className="h-7 w-40 rounded-lg bg-muted animate-pulse mb-4" />

      {/* 카드 그리드 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="h-[140px] rounded-2xl bg-muted animate-pulse"
          />
        ))}
      </div>
    </div>
  )
}
