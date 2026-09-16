export default function WriteLoading() {
  return (
    <>
      {/* 고정 헤더 skeleton — 실제 h-control fixed top */}
      <div className="fixed top-0 left-0 right-0 z-40 bg-card border-b border-border h-control flex items-center justify-between px-4">
        <div className="h-5 w-10 rounded bg-muted animate-pulse" />
        <div className="h-5 w-24 rounded bg-muted animate-pulse" />
        <div className="h-5 w-8 rounded bg-muted animate-pulse" />
      </div>

      {/* 본문 영역 */}
      <div className="max-w-[720px] mx-auto px-4 pt-[52px]">
        {/* 카테고리 선택 — 실제 h-control-lg border-b-2 */}
        <div className="h-control-lg w-full border-b-2 border-border flex items-center animate-pulse">
          <div className="h-5 w-32 rounded bg-muted" />
        </div>

        {/* 제목 입력 — 실제 h-[60px] border-b-2 */}
        <div className="h-[60px] w-full border-b-2 border-border flex items-center animate-pulse mt-4">
          <div className="h-6 w-48 rounded bg-muted" />
        </div>

        {/* 본문 에디터 */}
        <div className="h-64 w-full rounded-xl bg-muted animate-pulse mt-6" />
      </div>

      {/* 하단 고정 CTA skeleton — 실제 fixed bottom-0 h-control-lg */}
      <div className="fixed bottom-0 left-0 right-0 h-control-lg bg-card border-t border-border animate-pulse" />
    </>
  )
}
