export default function JobDetailLoading() {
  return (
    <div className="max-w-[720px] mx-auto px-4 py-6 md:px-6 md:py-8">
      {/* 뒤로가기 */}
      <div className="h-5 w-24 rounded bg-muted animate-pulse mb-6" />

      {/* 태그 */}
      <div className="flex gap-1.5 mb-3">
        <div className="h-6 w-14 rounded-full bg-muted animate-pulse" />
        <div className="h-6 w-14 rounded-full bg-muted animate-pulse" />
      </div>

      {/* 제목 */}
      <div className="h-7 w-4/5 rounded bg-muted animate-pulse mb-6" />

      {/* 정보 카드 */}
      <div className="bg-card rounded-xl border border-border p-5 mb-6 space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-5 w-3/4 rounded bg-muted animate-pulse" />
        ))}
      </div>

      {/* 본문 */}
      <div className="space-y-3 mb-8">
        <div className="h-4 w-full rounded bg-muted animate-pulse" />
        <div className="h-4 w-full rounded bg-muted animate-pulse" />
        <div className="h-4 w-3/4 rounded bg-muted animate-pulse" />
      </div>

      {/* 액션바 */}
      <div className="h-14 rounded-2xl bg-muted animate-pulse mb-8" />
    </div>
  )
}
