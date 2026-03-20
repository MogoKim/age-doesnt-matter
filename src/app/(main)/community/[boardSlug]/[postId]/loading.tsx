export default function PostDetailLoading() {
  return (
    <div className="max-w-[720px] mx-auto px-4 py-6 md:px-6 md:py-8">
      {/* 뒤로가기 */}
      <div className="h-5 w-24 rounded bg-muted animate-pulse mb-6" />

      {/* 카테고리 배지 */}
      <div className="h-6 w-16 rounded-full bg-muted animate-pulse mb-3" />

      {/* 제목 */}
      <div className="h-7 w-4/5 rounded bg-muted animate-pulse mb-4" />

      {/* 작성자 정보 */}
      <div className="flex items-center gap-2 mb-8 pb-6 border-b border-border">
        <div className="w-10 h-10 rounded-full bg-muted animate-pulse" />
        <div>
          <div className="h-4 w-20 rounded bg-muted animate-pulse mb-1" />
          <div className="h-3 w-16 rounded bg-muted animate-pulse" />
        </div>
      </div>

      {/* 본문 */}
      <div className="space-y-3 mb-8">
        <div className="h-4 w-full rounded bg-muted animate-pulse" />
        <div className="h-4 w-full rounded bg-muted animate-pulse" />
        <div className="h-4 w-3/4 rounded bg-muted animate-pulse" />
        <div className="h-4 w-5/6 rounded bg-muted animate-pulse" />
      </div>

      {/* 액션바 */}
      <div className="h-14 rounded-2xl bg-muted animate-pulse mb-8" />

      {/* 댓글 영역 */}
      <div className="h-6 w-24 rounded bg-muted animate-pulse mb-4" />
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-20 rounded-xl bg-muted animate-pulse" />
        ))}
      </div>
    </div>
  )
}
