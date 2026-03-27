export default function WriteLoading() {
  return (
    <div className="max-w-[720px] mx-auto px-4 py-6 md:px-6 md:py-8">
      {/* 제목 */}
      <div className="h-7 w-20 rounded bg-muted animate-pulse mb-6 pb-4 border-b-2 border-transparent" />

      {/* 게시판 선택 */}
      <div className="h-12 w-full rounded-xl bg-muted animate-pulse mb-4" />

      {/* 카테고리 선택 */}
      <div className="h-12 w-full rounded-xl bg-muted animate-pulse mb-4" />

      {/* 제목 입력 */}
      <div className="h-12 w-full rounded-xl bg-muted animate-pulse mb-4" />

      {/* 본문 입력 */}
      <div className="h-64 w-full rounded-xl bg-muted animate-pulse mb-4" />

      {/* 버튼 */}
      <div className="flex gap-3">
        <div className="h-[52px] flex-1 rounded-xl bg-muted animate-pulse" />
        <div className="h-[52px] flex-1 rounded-xl bg-muted animate-pulse" />
      </div>
    </div>
  )
}
