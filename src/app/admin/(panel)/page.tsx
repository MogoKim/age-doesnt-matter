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
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiCard label="오늘 방문" value={stats.todayUsers} icon="👁️" />
        <KpiCard label="오늘 가입" value={stats.todaySignups} icon="🆕" />
        <KpiCard label="오늘 글" value={stats.todayPosts} icon="📝" prefix="+" />
        <KpiCard label="오늘 댓글" value={stats.todayComments} icon="💬" prefix="+" />
      </div>

      {/* 푸시 구독 KPI */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-4">
        <KpiCard label="푸시 구독자" value={stats.pushSubCount} icon="🔔" />
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
          <div className="space-y-3">
            {botLogs.map((log) => {
              const badge = BOT_STATUS_BADGE[log.status] || BOT_STATUS_BADGE.SUCCESS
              return (
                <div
                  key={log.id}
                  className="flex items-center justify-between rounded-lg border border-zinc-100 px-4 py-3"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-medium text-zinc-900">
                      {BOT_TYPE_LABELS[log.botType] || log.botType}
                    </span>
                    <span
                      className={`rounded-md px-2 py-0.5 text-xs font-medium ${badge.className}`}
                    >
                      {badge.label}
                    </span>
                  </div>
                  <div className="flex items-center gap-4 text-xs text-zinc-500">
                    <span>수집 {log.collectedCount}</span>
                    <span>발행 {log.publishedCount}</span>
                    {log.reviewPendingCount > 0 && (
                      <span className="font-medium text-yellow-600">
                        검수 {log.reviewPendingCount}
                      </span>
                    )}
                  </div>
                </div>
              )
            })}
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
}: {
  label: string
  value: number
  icon: string
  prefix?: string
}) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-5">
      <div className="flex items-center justify-between">
        <span className="text-sm text-zinc-500">{label}</span>
        <span className="text-lg">{icon}</span>
      </div>
      <p className="mt-2 text-2xl font-bold text-zinc-900">
        {prefix}{value.toLocaleString()}
      </p>
    </div>
  )
}
