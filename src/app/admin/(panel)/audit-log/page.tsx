import { getAuditLogs } from '@/lib/queries/admin'
import AuditLogTable from '@/components/admin/AuditLogTable'

export const dynamic = 'force-dynamic'

interface PageProps {
  searchParams: Promise<{ action?: string; search?: string; cursor?: string }>
}

export default async function AuditLogPage({ searchParams }: PageProps) {
  const params = await searchParams
  const { logs, hasMore } = await getAuditLogs({
    action: params.action,
    search: params.search,
    cursor: params.cursor,
  })

  return (
    <div className="space-y-4">
      <AuditLogTable
        logs={logs}
        hasMore={hasMore}
        filters={{ action: params.action, search: params.search }}
      />
    </div>
  )
}
