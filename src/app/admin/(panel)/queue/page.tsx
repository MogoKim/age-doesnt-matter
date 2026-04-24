import type { Metadata } from 'next'
import Link from 'next/link'
import { getAdminQueue, getAdminQueueCounts } from '@/lib/queries/admin'
import type { AdminQueueStatus, AdminQueueType } from '@/generated/prisma/client'
import QueueActions from '@/components/admin/QueueActions'

export const metadata: Metadata = { title: '승인 대기' }
export const dynamic = 'force-dynamic'

const STATUS_TABS: { key: AdminQueueStatus; label: string }[] = [
  { key: 'PENDING', label: '대기 중' },
  { key: 'APPROVED', label: '승인됨' },
  { key: 'REJECTED', label: '거절됨' },
  { key: 'EXPIRED', label: '만료됨' },
]

const TYPE_LABELS: Record<AdminQueueType, string> = {
  CONTENT_PUBLISH: '📢 콘텐츠 게시',
  AGENT_EVOLUTION: '🧬 에이전트 진화',
  SCHEMA_CHANGE: '🗄️ 스키마 변경',
  BUDGET_CHANGE: '💰 예산 변경',
  SYSTEM_ACTION: '⚙️ 시스템 액션',
}

const STATUS_BADGE: Record<AdminQueueStatus, { label: string; className: string }> = {
  PENDING: { label: '대기 중', className: 'bg-yellow-50 text-yellow-700' },
  APPROVED: { label: '승인됨', className: 'bg-green-50 text-green-700' },
  REJECTED: { label: '거절됨', className: 'bg-red-50 text-red-700' },
  EXPIRED: { label: '만료됨', className: 'bg-zinc-100 text-zinc-500' },
}

interface Props {
  searchParams: Promise<{ status?: string }>
}

export default async function AdminQueuePage({ searchParams }: Props) {
  const params = await searchParams
  const activeTab = (params.status ?? 'PENDING') as AdminQueueStatus

  const [items, counts] = await Promise.all([
    getAdminQueue(activeTab),
    getAdminQueueCounts(),
  ])

  const countMap: Record<AdminQueueStatus, number> = {
    PENDING: counts.pending,
    APPROVED: counts.approved,
    REJECTED: counts.rejected,
    EXPIRED: counts.expired,
  }

  return (
    <div className="space-y-6">
      {/* 탭 */}
      <div className="flex gap-1 rounded-xl border border-zinc-200 bg-zinc-50 p-1">
        {STATUS_TABS.map((tab) => (
          <Link
            key={tab.key}
            href={`/admin/queue?status=${tab.key}`}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium no-underline transition-colors ${
              activeTab === tab.key
                ? 'bg-white text-zinc-900 shadow-sm'
                : 'text-zinc-500 hover:text-zinc-700'
            }`}
          >
            {tab.label}
            {countMap[tab.key] > 0 && (
              <span className={`rounded-full px-1.5 py-0.5 text-xs ${
                tab.key === 'PENDING' ? 'bg-red-500 text-white' : 'bg-zinc-200 text-zinc-600'
              }`}>
                {countMap[tab.key]}
              </span>
            )}
          </Link>
        ))}
      </div>

      {/* 목록 */}
      {items.length === 0 ? (
        <div className="py-12 text-center text-sm text-zinc-400">항목이 없습니다.</div>
      ) : (
        <div className="space-y-3">
          {items.map((item) => {
            const badge = STATUS_BADGE[item.status]
            return (
              <div key={item.id} className="rounded-xl border border-zinc-200 bg-white p-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="mb-1 flex items-center gap-2">
                      <span className="text-sm font-medium text-zinc-500">
                        {TYPE_LABELS[item.type]}
                      </span>
                      <span className={`rounded-md px-2 py-0.5 text-xs font-medium ${badge.className}`}>
                        {badge.label}
                      </span>
                    </div>
                    <h3 className="text-base font-bold text-zinc-900">{item.title}</h3>
                    <p className="mt-1 text-sm text-zinc-600 line-clamp-2">{item.description}</p>
                    <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-zinc-400">
                      <span>요청: {item.requestedBy}</span>
                      <span>{new Date(item.createdAt).toLocaleString('ko-KR')}</span>
                      {item.expiresAt && (
                        <span>만료: {new Date(item.expiresAt).toLocaleString('ko-KR')}</span>
                      )}
                      {item.resolvedBy && (
                        <span>처리자: {item.resolvedBy}</span>
                      )}
                    </div>
                  </div>
                  <QueueActions
                    itemId={item.id}
                    status={item.status}
                    payload={item.payload as Record<string, unknown> | null}
                    description={item.description}
                    title={item.title}
                  />
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
