import AdminKpiSkeleton from '@/components/admin/AdminKpiSkeleton'

export default function AnalyticsLoading() {
  return (
    <div className="space-y-6">
      <AdminKpiSkeleton count={4} />
      <div className="rounded-xl border border-zinc-200 bg-white p-8">
        <div className="h-5 w-32 animate-pulse rounded bg-zinc-200" />
        <div className="mt-4 h-64 animate-pulse rounded-lg bg-zinc-50" />
      </div>
    </div>
  )
}
