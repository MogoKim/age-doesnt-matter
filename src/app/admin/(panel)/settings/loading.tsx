export default function SettingsLoading() {
  return (
    <div className="space-y-4">
      {/* 탭 바 */}
      <div className="flex gap-2">
        <div className="h-10 w-28 animate-pulse rounded-lg bg-zinc-200" />
        <div className="h-10 w-28 animate-pulse rounded-lg bg-zinc-200" />
      </div>
      {/* 폼 placeholder */}
      <div className="rounded-xl border border-zinc-200 bg-white p-6">
        <div className="space-y-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i}>
              <div className="mb-2 h-4 w-20 animate-pulse rounded bg-zinc-200" />
              <div className="h-10 w-full animate-pulse rounded-lg bg-zinc-100" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
