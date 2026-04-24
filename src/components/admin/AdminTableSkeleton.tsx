export default function AdminTableSkeleton({
  rows = 5,
  columns = 6,
}: {
  rows?: number
  columns?: number
}) {
  return (
    <div className="space-y-4">
      {/* 필터 바 */}
      <div className="flex gap-3">
        <div className="h-10 w-32 animate-pulse rounded-lg bg-zinc-200" />
        <div className="h-10 w-32 animate-pulse rounded-lg bg-zinc-200" />
        <div className="h-10 w-48 animate-pulse rounded-lg bg-zinc-200" />
      </div>

      {/* 테이블 */}
      <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white">
        {/* 헤더 */}
        <div className="flex border-b border-zinc-200 bg-zinc-50 px-4 py-3">
          {Array.from({ length: columns }).map((_, i) => (
            <div key={i} className="flex-1 px-2">
              <div className="h-4 w-16 animate-pulse rounded bg-zinc-200" />
            </div>
          ))}
        </div>
        {/* 행 */}
        {Array.from({ length: rows }).map((_, rowIdx) => (
          <div key={rowIdx} className="flex border-b border-zinc-100 px-4 py-4">
            {Array.from({ length: columns }).map((_, colIdx) => (
              <div key={colIdx} className="flex-1 px-2">
                <div
                  className="h-4 animate-pulse rounded bg-zinc-100"
                  style={{ width: `${60 + (((rowIdx * columns + colIdx) * 17) % 30)}%` }}
                />
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
