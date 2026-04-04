import type { Metadata } from 'next'
import Link from 'next/link'
import { getBotLogsDetail, getBotLogStats } from '@/lib/queries/admin'
import type { BotStatus, BotType } from '@/generated/prisma/client'
import BotLogDetail from '@/components/admin/BotLogDetail'

export const metadata: Metadata = { title: '에이전트 로그' }
export const dynamic = 'force-dynamic'

const BOT_TYPE_OPTIONS: { value: BotType | ''; label: string }[] = [
  { value: '', label: '전체 에이전트' },
  { value: 'CEO', label: '👑 CEO' },
  { value: 'CTO', label: '🔧 CTO' },
  { value: 'CMO', label: '📣 CMO' },
  { value: 'CPO', label: '📦 CPO' },
  { value: 'CDO', label: '📊 CDO' },
  { value: 'CFO', label: '💰 CFO' },
  { value: 'COO', label: '⚙️ COO' },
  { value: 'SEED', label: '🌱 SEED' },
  { value: 'CAFE_CRAWLER', label: '☕ 카페 크롤러' },
  { value: 'JOB', label: '💼 일자리' },
  { value: 'HUMOR', label: '😄 유머' },
  { value: 'STORY', label: '💬 이야기' },
  { value: 'THREAD', label: '🤖 스레드' },
]

const STATUS_OPTIONS: { value: BotStatus | ''; label: string }[] = [
  { value: '', label: '전체 상태' },
  { value: 'SUCCESS', label: '✅ 성공' },
  { value: 'PARTIAL', label: '⚠️ 부분 성공' },
  { value: 'FAILED', label: '❌ 실패' },
]

const BOT_TYPE_LABELS: Record<string, string> = {
  CEO: '👑 CEO', CTO: '🔧 CTO', CMO: '📣 CMO', CPO: '📦 CPO',
  CDO: '📊 CDO', CFO: '💰 CFO', COO: '⚙️ COO', SEED: '🌱 SEED',
  CAFE_CRAWLER: '☕ 카페 크롤러', JOB: '💼 일자리', HUMOR: '😄 유머',
  STORY: '💬 이야기', THREAD: '🤖 스레드',
}

const STATUS_BADGE: Record<string, { label: string; className: string }> = {
  SUCCESS: { label: '✅ 성공', className: 'bg-green-50 text-green-700' },
  PARTIAL: { label: '⚠️ 부분', className: 'bg-yellow-50 text-yellow-700' },
  FAILED: { label: '❌ 실패', className: 'bg-red-50 text-red-700' },
}

interface Props {
  searchParams: Promise<{
    type?: string
    status?: string
    days?: string
    cursor?: string
  }>
}

export default async function AgentsPage({ searchParams }: Props) {
  const params = await searchParams
  const days = parseInt(params.days ?? '1', 10)
  const since = new Date()
  since.setDate(since.getDate() - days)

  const [{ logs, hasMore }, stats] = await Promise.all([
    getBotLogsDetail({
      botType: params.type ? (params.type as BotType) : undefined,
      status: params.status ? (params.status as BotStatus) : undefined,
      since,
      cursor: params.cursor,
    }),
    getBotLogStats(),
  ])

  const buildUrl = (overrides: Record<string, string | undefined>) => {
    const p = new URLSearchParams({
      ...(params.type && { type: params.type }),
      ...(params.status && { status: params.status }),
      ...(params.days && params.days !== '1' && { days: params.days }),
      ...overrides,
    })
    const str = p.toString()
    return `/admin/agents${str ? `?${str}` : ''}`
  }

  return (
    <div className="space-y-6">
      {/* 통계 카드 */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard label="오늘 실행" value={stats.todayCount} />
        <StatCard label="성공" value={stats.successCount} className="text-green-700" />
        <StatCard label="실패" value={stats.failedCount} className="text-red-700" />
        <StatCard label="평균 소요" value={`${(stats.avgExecutionMs / 1000).toFixed(1)}s`} />
      </div>

      {/* 필터 */}
      <div className="flex flex-wrap gap-3">
        {/* 에이전트 타입 */}
        <div className="flex gap-1">
          {BOT_TYPE_OPTIONS.slice(0, 5).map((opt) => (
            <Link
              key={opt.value}
              href={buildUrl({ type: opt.value || undefined, cursor: undefined })}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium no-underline transition-colors ${
                (params.type ?? '') === opt.value
                  ? 'bg-[#FF6F61] text-white'
                  : 'border border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50'
              }`}
            >
              {opt.label}
            </Link>
          ))}
          {BOT_TYPE_OPTIONS.slice(5).map((opt) => (
            <Link
              key={opt.value}
              href={buildUrl({ type: opt.value || undefined, cursor: undefined })}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium no-underline transition-colors ${
                (params.type ?? '') === opt.value
                  ? 'bg-[#FF6F61] text-white'
                  : 'border border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50'
              }`}
            >
              {opt.label}
            </Link>
          ))}
        </div>

        <div className="flex gap-1">
          {STATUS_OPTIONS.map((opt) => (
            <Link
              key={opt.value}
              href={buildUrl({ status: opt.value || undefined, cursor: undefined })}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium no-underline transition-colors ${
                (params.status ?? '') === opt.value
                  ? 'bg-zinc-900 text-white'
                  : 'border border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50'
              }`}
            >
              {opt.label}
            </Link>
          ))}
        </div>

        {/* 기간 필터 */}
        <div className="flex gap-1">
          {[
            { value: '1', label: '오늘' },
            { value: '3', label: '3일' },
            { value: '7', label: '7일' },
          ].map((opt) => (
            <Link
              key={opt.value}
              href={buildUrl({ days: opt.value, cursor: undefined })}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium no-underline transition-colors ${
                (params.days ?? '1') === opt.value
                  ? 'bg-zinc-900 text-white'
                  : 'border border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50'
              }`}
            >
              {opt.label}
            </Link>
          ))}
        </div>
      </div>

      {/* 로그 테이블 */}
      {logs.length === 0 ? (
        <div className="py-12 text-center text-sm text-zinc-400">로그가 없습니다.</div>
      ) : (
        <div className="rounded-xl border border-zinc-200 bg-white">
          <div className="divide-y divide-zinc-100">
            {logs.map((log) => {
              const badge = STATUS_BADGE[log.status] ?? STATUS_BADGE.SUCCESS
              const execSec = (log.executionTimeMs / 1000).toFixed(1)
              return (
                <BotLogDetail
                  key={log.id}
                  log={{
                    id: log.id,
                    botType: log.botType,
                    status: log.status,
                    action: log.action,
                    itemCount: log.itemCount,
                    executionTimeMs: log.executionTimeMs,
                    details: log.details,
                    executedAt: log.executedAt,
                  }}
                  typeLabel={BOT_TYPE_LABELS[log.botType] ?? log.botType}
                  badge={badge}
                  execSec={execSec}
                />
              )
            })}
          </div>
        </div>
      )}

      {/* 페이지네이션 */}
      {hasMore && logs.length > 0 && (
        <div className="flex justify-center">
          <Link
            href={buildUrl({ cursor: logs[logs.length - 1].executedAt.toISOString() })}
            className="rounded-lg border border-zinc-200 bg-white px-6 py-2.5 text-sm font-medium text-zinc-600 no-underline transition-colors hover:bg-zinc-50"
          >
            더 보기
          </Link>
        </div>
      )}
    </div>
  )
}

function StatCard({ label, value, className = 'text-zinc-900' }: { label: string; value: string | number; className?: string }) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4">
      <div className="text-xs text-zinc-500">{label}</div>
      <div className={`mt-1 text-xl font-bold ${className}`}>{value}</div>
    </div>
  )
}
