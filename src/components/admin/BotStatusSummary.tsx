import Link from 'next/link'
import { getRecentBotLogs, getAutomationStatus } from '@/lib/queries/admin'
import AutomationToggle from '@/components/admin/AutomationToggle'

// 봇 상태 요약 — ERROR → ACTIVE → DORMANT 그룹.
// 기존 메인 대시보드(/admin)에 있던 섹션을 /admin/agents 상단으로 이동.

const BOT_TYPE_LABELS: Record<string, string> = {
  JOB: '💼 일자리',
  HUMOR: '😄 유머',
  STORY: '💬 이야기',
  THREAD: '🤖 스레드',
  CEO: '👑 CEO',
  CTO: '🔧 CTO',
  CMO: '📣 CMO',
  CPO: '📦 CPO',
  CDO: '📊 CDO',
  CFO: '💰 CFO',
  COO: '⚙️ COO',
  SEED: '🌱 SEED',
  CAFE_CRAWLER: '☕ 카페 크롤러',
}

const BOT_STATUS_BADGE: Record<string, { label: string; className: string }> = {
  SUCCESS: { label: '✅ 정상', className: 'text-green-700 bg-green-50' },
  PARTIAL: { label: '⚠️ 부분', className: 'text-yellow-700 bg-yellow-50' },
  FAILED: { label: '❌ 실패', className: 'text-red-700 bg-red-50' },
}

type DashboardBotLog = Awaited<ReturnType<typeof getRecentBotLogs>>[number]

export default async function BotStatusSummary() {
  const [botLogs, isAutomationActive] = await Promise.all([
    getRecentBotLogs(),
    getAutomationStatus(),
  ])

  const errorBots = botLogs.filter((log) => log.dashboardState === 'error')
  const activeBots = botLogs.filter((log) => log.dashboardState === 'active')
  const dormantBots = botLogs.filter((log) => log.dashboardState === 'dormant')

  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-5">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-bold text-zinc-900">🤖 봇 상태</h2>
        <AutomationToggle isActive={isAutomationActive} />
      </div>
      {botLogs.length === 0 ? (
        <p className="text-sm text-zinc-500">봇 실행 기록이 없습니다.</p>
      ) : (
        <div className="space-y-5">
          <BotStatusGroup
            title="오류 에이전트"
            tone="error"
            logs={errorBots}
            emptyText="현재 실패 상태인 에이전트가 없습니다."
          />
          <BotStatusGroup
            title="활성 에이전트"
            tone="active"
            logs={activeBots}
            emptyText="오늘 실행된 에이전트가 없습니다."
          />
          <BotStatusGroup
            title="휴면 에이전트"
            tone="dormant"
            logs={dormantBots}
            emptyText="오래된 실행 로그가 없습니다."
          />
        </div>
      )}
    </section>
  )
}

function BotStatusGroup({
  title,
  tone,
  logs,
  emptyText,
}: {
  title: string
  tone: 'active' | 'error' | 'dormant'
  logs: DashboardBotLog[]
  emptyText: string
}) {
  const titleClassName =
    tone === 'active' ? 'text-green-700' : tone === 'error' ? 'text-red-700' : 'text-zinc-500'
  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <h3 className={`text-xs font-bold ${titleClassName}`}>{title}</h3>
        <span className="text-xs text-zinc-400">{logs.length}개</span>
      </div>
      {logs.length === 0 ? (
        <p className="rounded-lg border border-dashed border-zinc-200 px-4 py-3 text-xs text-zinc-400">
          {emptyText}
        </p>
      ) : (
        <div className="space-y-2">
          {logs.map((log) => (
            <BotStatusRow key={log.id} log={log} />
          ))}
        </div>
      )}
    </div>
  )
}

function BotStatusRow({ log }: { log: DashboardBotLog }) {
  const statusBadge =
    log.dashboardState === 'dormant'
      ? { label: '🔇 휴면', className: 'text-zinc-600 bg-zinc-100' }
      : BOT_STATUS_BADGE[log.status] || BOT_STATUS_BADGE.SUCCESS
  const actionLabel = log.action ?? '최근 실행'

  return (
    <div className="rounded-lg border border-zinc-100 px-4 py-3">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium text-zinc-900">
              {BOT_TYPE_LABELS[log.botType] || log.botType}
            </span>
            <span className={`rounded-md px-2 py-0.5 text-xs font-medium ${statusBadge.className}`}>
              {statusBadge.label}
            </span>
            <span className="text-xs text-zinc-400">{log.executedAtLabel}</span>
            <span className="text-xs text-zinc-400">· {log.ageLabel}</span>
          </div>
          <p className="mt-1 truncate text-xs text-zinc-500">
            {actionLabel}
            {log.failureSummary ? ` · ${log.failureSummary}` : ''}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-4 text-xs text-zinc-500">
          <span>수집 {log.collectedCount}</span>
          <span>발행 {log.publishedCount}</span>
          {log.itemCount > 0 && <span>처리 {log.itemCount}</span>}
          {log.reviewPendingCount > 0 && (
            <span className="font-medium text-yellow-600">검수 {log.reviewPendingCount}</span>
          )}
          <Link
            href={`/admin/agents?botType=${log.botType}`}
            className="font-medium text-[#FF6F61] no-underline hover:underline"
          >
            로그 →
          </Link>
        </div>
      </div>
    </div>
  )
}
