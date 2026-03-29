import AdminTableSkeleton from '@/components/admin/AdminTableSkeleton'

export default function PopupsLoading() {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="h-7 w-24 animate-pulse rounded bg-zinc-200" />
        <div className="h-10 w-24 animate-pulse rounded-lg bg-zinc-200" />
      </div>
      <AdminTableSkeleton rows={5} columns={7} />
    </div>
  )
}
