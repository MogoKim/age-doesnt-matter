export default function BannersLoading() {
  return (
    <div className="space-y-4">
      {/* 탭 바 */}
      <div className="flex gap-2">
        <div className="h-10 w-28 animate-pulse rounded-lg bg-zinc-200" />
        <div className="h-10 w-28 animate-pulse rounded-lg bg-zinc-200" />
      </div>
      {/* 카드 그리드 */}
      <div className="grid gap-4 sm:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-xl border border-zinc-200 bg-white p-5">
            <div className="mb-3 h-32 animate-pulse rounded-lg bg-zinc-100" />
            <div className="h-5 w-40 animate-pulse rounded bg-zinc-200" />
            <div className="mt-2 h-4 w-28 animate-pulse rounded bg-zinc-100" />
          </div>
        ))}
      </div>
    </div>
  )
}
