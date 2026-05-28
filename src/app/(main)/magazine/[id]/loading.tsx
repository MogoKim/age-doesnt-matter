export default function MagazineDetailLoading() {
  return (
    <div className="max-w-[720px] mx-auto px-4 py-6 md:px-6 md:py-8">
      {/* 뒤로가기 */}
      <div className="h-[52px] flex items-center mb-4">
        <div className="h-5 w-16 rounded bg-muted animate-pulse" />
      </div>

      {/* 헤더 */}
      <div className="mb-8 pb-6 border-b border-border">
        {/* 카테고리 배지 */}
        <div className="h-6 w-16 rounded-full bg-muted animate-pulse mb-2" />
        {/* 제목 */}
        <div className="h-8 w-4/5 rounded bg-muted animate-pulse mb-2" />
        <div className="h-6 w-3/5 rounded bg-muted animate-pulse mb-4" />
        {/* 메타 */}
        <div className="flex items-center gap-2">
          <div className="h-5 w-24 rounded bg-muted animate-pulse" />
          <div className="h-5 w-16 rounded bg-muted animate-pulse" />
        </div>
      </div>

      {/* 시리즈 네비 placeholder */}
      <div className="my-6 rounded-xl border border-primary/20 bg-primary/5 h-[88px] animate-pulse" />

      {/* 본문 */}
      <div className="space-y-3 mb-8">
        {Array.from({ length: 8 }).map((_, i) => (
          <div
            key={i}
            className={`h-4 rounded bg-muted animate-pulse ${i % 4 === 3 ? 'w-3/4' : 'w-full'}`}
          />
        ))}
      </div>

      {/* CPS 카드 placeholder */}
      <div className="mb-8 p-4 bg-muted/30 rounded-2xl border border-border h-24 animate-pulse" />

      {/* ActionBar */}
      <div className="fixed bottom-0 left-0 right-0 h-[68px] bg-card border-t border-border animate-pulse" />

      {/* 함께 읽어보세요 */}
      <div className="mb-8">
        <div className="h-5 w-28 rounded bg-muted animate-pulse mb-4" />
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-[72px] rounded-xl bg-muted animate-pulse" />
          ))}
        </div>
      </div>

      {/* 댓글 */}
      <div className="space-y-3">
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="h-20 rounded-xl bg-muted animate-pulse" />
        ))}
      </div>
    </div>
  )
}
