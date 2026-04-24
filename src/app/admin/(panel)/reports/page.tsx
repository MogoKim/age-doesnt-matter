import type { Metadata } from 'next'
import type { ReportStatus } from '@/generated/prisma/client'
import { getReportList } from '@/lib/queries/admin'
import ReportTable from '@/components/admin/ReportTable'

export const metadata: Metadata = { title: '신고 관리' }
export const dynamic = 'force-dynamic'

interface Props {
  searchParams: Promise<{
    status?: string
    cursor?: string
  }>
}

export default async function AdminReportsPage({ searchParams }: Props) {
  const params = await searchParams
  const { reports, hasMore } = await getReportList({
    status: params.status as ReportStatus | undefined,
    cursor: params.cursor,
  })

  return (
    <div className="space-y-4">
      <ReportTable
        reports={reports}
        hasMore={hasMore}
        currentStatus={params.status}
      />
    </div>
  )
}
