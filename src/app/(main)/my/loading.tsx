export default function MyLoading() {
  return (
    <div className="max-w-[720px] mx-auto px-4 py-6 md:px-6 md:py-8">
      {/* 프로필 카드 */}
      <div className="bg-card rounded-2xl p-6 shadow-sm border border-border mb-6">
        <div className="flex items-center gap-4 mb-6">
          <div className="h-16 w-16 rounded-full bg-muted animate-pulse shrink-0" />
          <div className="flex-1 space-y-2">
            <div className="h-6 w-32 rounded bg-muted animate-pulse" />
            <div className="h-4 w-24 rounded bg-muted animate-pulse" />
            <div className="h-4 w-40 rounded bg-muted animate-pulse" />
          </div>
        </div>
        <div className="grid grid-cols-3 gap-4 p-4 bg-background rounded-xl">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-16 rounded-xl bg-muted animate-pulse" />
          ))}
        </div>
      </div>

      {/* 메뉴 */}
      <div className="bg-card rounded-2xl shadow-sm border border-border overflow-hidden">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 min-h-[56px] px-6 border-b border-border last:border-b-0">
            <div className="h-5 w-5 rounded bg-muted animate-pulse shrink-0" />
            <div className="h-4 w-24 rounded bg-muted animate-pulse flex-1" />
          </div>
        ))}
      </div>
    </div>
  )
}
