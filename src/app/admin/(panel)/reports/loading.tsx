import AdminTableSkeleton from '@/components/admin/AdminTableSkeleton'

export default function ReportsLoading() {
  return (
    <div className="space-y-4">
      {/* 탭 바 */}
      <div className="flex gap-2">
        <div className="h-10 w-20 animate-pulse rounded-lg bg-zinc-200" />
        <div className="h-10 w-20 animate-pulse rounded-lg bg-zinc-200" />
        <div className="h-10 w-20 animate-pulse rounded-lg bg-zinc-200" />
      </div>
      <AdminTableSkeleton rows={5} columns={7} />
    </div>
  )
}
