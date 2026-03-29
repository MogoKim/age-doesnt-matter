import AdminKpiSkeleton from '@/components/admin/AdminKpiSkeleton'

export default function DashboardLoading() {
  return (
    <div className="space-y-6">
      <AdminKpiSkeleton count={4} />
      <div className="rounded-xl border border-zinc-200 bg-white p-5">
        <div className="mb-4 h-5 w-24 animate-pulse rounded bg-zinc-200" />
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex items-center justify-between rounded-lg border border-zinc-100 px-4 py-3">
              <div className="h-4 w-32 animate-pulse rounded bg-zinc-200" />
              <div className="h-4 w-24 animate-pulse rounded bg-zinc-100" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
