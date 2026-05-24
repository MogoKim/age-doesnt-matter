import Link from 'next/link'
import { getDashboardStats, getRecentBotLogs, getDailyBrief, getAutomationStatus, getAdminQueueCounts } from '@/lib/queries/admin'
import AdminQuickStart from '@/components/admin/AdminQuickStart'
import DailyBriefWidget from '@/components/admin/DailyBriefWidget'
import AutomationToggle from '@/components/admin/AutomationToggle'

export const dynamic = 'force-dynamic'

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

export default async function AdminDashboardPage() {
  const [stats, botLogs, brief, isAutomationActive, queueCounts] = await Promise.all([
    getDashboardStats(),
    getRecentBotLogs(),
    getDailyBrief(),
    getAutomationStatus(),
    getAdminQueueCounts(),
  ])
  const activeBots = botLogs.filter((log) => log.dashboardState === 'active')
  const errorBots = botLogs.filter((log) => log.dashboardState === 'error')
  const dormantBots = botLogs.filter((log) => log.dashboardState === 'dormant')

  return (
    <div className="space-y-6">
      {/* 자동화 상태 배너 */}
      {!isAutomationActive && (
        <div className="rounded-xl border border-orange-200 bg-orange-50 p-4">
          <div className="flex items-center justify-between">
            <div>
              <span className="font-bold text-orange-800">🚨 자동화 일시 중지 중</span>
              <p className="mt-0.5 text-sm text-orange-700">에이전트가 실행되지 않습니다. 재개하려면 아래 버튼을 누르세요.</p>
            </div>
            <AutomationToggle isActive={false} />
          </div>
        </div>
      )}

      <AdminQuickStart />

      {/* KPI 카드 */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <KpiCard label="오늘 방문" value={stats.todayUniqueVisitors} icon="👁️" sub="비로그인 포함" />
        <KpiCard label="로그인 회원" value={stats.todayLogins} icon="🔑" sub="봇 제외" href="/admin/members" />
        <KpiCard label="신규가입" value={stats.todaySignups} icon="🆕" sub="봇 제외" href="/admin/members" />
        <KpiCard
          label="오늘 글/댓글"
          value={`+${stats.todayPosts.toLocaleString()} / +${stats.todayComments.toLocaleString()}`}
          icon="📝"
          sub="글 / 댓글"
          href="/admin/content"
        />
        <KpiCard label="푸시 구독자" value={stats.pushSubCount} icon="🔔" href="/admin/push" />
      </div>

      {/* 욕망 지도 위젯 */}
      {brief && (
        <DailyBriefWidget
          dominantDesire={brief.dominantDesire}
          dominantEmotion={brief.dominantEmotion}
          desireRanking={brief.desireRanking as Array<{ category: string; percent: number; label: string }>}
          date={brief.date}
        />
      )}

      {/* 긴급 알림 */}
      {(stats.pendingReports > 0 || stats.pendingBotReviews > 0 || queueCounts.pending > 0) && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-5">
          <h2 className="mb-3 text-sm font-bold text-red-800">🚨 긴급</h2>
          <ul className="space-y-2">
            {stats.pendingReports > 0 && (
              <li className="flex items-center justify-between text-sm text-red-700">
                <span>미처리 신고 {stats.pendingReports}건</span>
                <Link
                  href="/admin/reports"
                  className="rounded-md bg-red-100 px-3 py-1 text-xs font-medium text-red-700 no-underline transition-colors hover:bg-red-200"
                >
                  바로 처리 →
                </Link>
              </li>
            )}
            {stats.pendingBotReviews > 0 && (
              <li className="flex items-center justify-between text-sm text-red-700">
                <span>봇 검수 대기 {stats.pendingBotReviews}건</span>
                <Link
                  href="/admin/agents"
                  className="rounded-md bg-red-100 px-3 py-1 text-xs font-medium text-red-700 no-underline transition-colors hover:bg-red-200"
                >
                  확인 →
                </Link>
              </li>
            )}
            {queueCounts.pending > 0 && (
              <li className="flex items-center justify-between text-sm text-red-700">
                <span>에이전트 승인 대기 {queueCounts.pending}건</span>
                <Link
                  href="/admin/queue"
                  className="rounded-md bg-red-100 px-3 py-1 text-xs font-medium text-red-700 no-underline transition-colors hover:bg-red-200"
                >
                  승인하기 →
                </Link>
              </li>
            )}
          </ul>
        </div>
      )}

      {/* 봇 상태 */}
      <section className="rounded-xl border border-zinc-200 bg-white p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-bold text-zinc-900">🤖 봇 상태</h2>
          <div className="flex items-center gap-3">
            <AutomationToggle isActive={isAutomationActive} />
            <Link
              href="/admin/agents"
              className="text-xs font-medium text-[#FF6F61] no-underline hover:underline"
            >
              전체 로그 →
            </Link>
          </div>
        </div>
        {botLogs.length === 0 ? (
          <p className="text-sm text-zinc-500">봇 실행 기록이 없습니다.</p>
        ) : (
          <div className="space-y-5">
            <BotStatusGroup title="활성 에이전트" tone="active" logs={activeBots} emptyText="오늘 실행된 에이전트가 없습니다." />
            <BotStatusGroup title="오류 에이전트" tone="error" logs={errorBots} emptyText="현재 실패 상태인 에이전트가 없습니다." />
            <BotStatusGroup title="휴면 에이전트" tone="dormant" logs={dormantBots} emptyText="오래된 실행 로그가 없습니다." />
          </div>
        )}
      </section>
    </div>
  )
}

function KpiCard({
  label,
  value,
  icon,
  prefix = '',
  href,
  sub,
}: {
  label: string
  value: number | string
  icon: string
  prefix?: string
  href?: string
  sub?: string
}) {
  const displayValue = typeof value === 'number' ? `${prefix}${value.toLocaleString()}` : value
  const inner = (
    <div className={`rounded-xl border border-zinc-200 bg-white p-5 ${href ? 'transition-colors hover:border-zinc-300 hover:bg-zinc-50' : ''}`}>
      <div className="flex items-center justify-between">
        <span className="text-sm text-zinc-500">{label}</span>
        <span className="text-lg">{icon}</span>
      </div>
      <p className="mt-2 text-2xl font-bold text-zinc-900">
        {displayValue}
      </p>
      {sub && <p className="mt-1 text-xs text-zinc-400">{sub}</p>}
    </div>
  )
  if (href) return <Link href={href} className="block no-underline">{inner}</Link>
  return inner
}

type DashboardBotLog = Awaited<ReturnType<typeof getRecentBotLogs>>[number]

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
    tone === 'active'
      ? 'text-green-700'
      : tone === 'error'
        ? 'text-red-700'
        : 'text-zinc-500'

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <h3 className={`text-xs font-bold ${titleClassName}`}>{title}</h3>
        <span className="text-xs text-zinc-400">{logs.length}개</span>
      </div>
      {logs.length === 0 ? (
        <p className="rounded-lg border border-dashed border-zinc-200 px-4 py-3 text-xs text-zinc-400">{emptyText}</p>
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
