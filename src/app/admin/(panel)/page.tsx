import Link from 'next/link'
import {
  getDashboardStats,
  getMonthlyOkrStats,
  getDailyTrend,
  getBoardActivity,
  getDailyBrief,
  getAutomationStatus,
  getAdminQueueCounts,
} from '@/lib/queries/admin'
import AdminQuickStart from '@/components/admin/AdminQuickStart'
import DailyBriefWidget from '@/components/admin/DailyBriefWidget'
import AutomationToggle from '@/components/admin/AutomationToggle'

// 1~2분 캐시 허용(창업자 합의) — 매 접속 풀렌더 방지. 긴급 알림은 최대 2분 지연 가능.
export const revalidate = 120

const BOARD_TYPE_LABELS: Record<string, string> = {
  JOB: '일자리',
  STORY: '사는 이야기',
  HUMOR: '웃음방',
  MAGAZINE: '매거진',
  WEEKLY: '수다방',
  LIFE2: '2막 준비',
}

const Q2_OKR = {
  uv:          { label: 'KR1 — 월 순방문자 (UV)', target: 5000, unit: '명', desc: '비회원 포함 실방문 고유 세션 (봇·창업자 제외)' },
  avgPv:       { label: 'KR2 — 방문당 평균 PV', target: 5.0, unit: 'PV', desc: '광고로 온 사람이 머무는가? 콘텐츠 흡인력 지표' },
  conversion:  { label: 'KR3 — 방문→가입 전환율', target: 10, unit: '%', desc: '실방문 대비 신규가입 비율 — 광고 효율의 직접 지표' },
  d7Retention: { label: 'KR4 — 비회원 D7 재방문율', target: 45, unit: '%', desc: 'GA4 Cohort — CDO 에이전트 매일 22:00 수집' },
} as const

export default async function AdminDashboardPage() {
  const [stats, okr, trend, boards, brief, isAutomationActive, queueCounts] =
    await Promise.all([
      getDashboardStats(),
      getMonthlyOkrStats(),
      getDailyTrend(),
      getBoardActivity(),
      getDailyBrief(),
      getAutomationStatus(),
      getAdminQueueCounts(),
    ])

  const cdoIsStale =
    !okr.cdoLastCollectedAt ||
    Date.now() - new Date(okr.cdoLastCollectedAt).getTime() > 48 * 60 * 60 * 1000

  const boardMax = boards.length > 0 ? Math.max(...boards.map((b) => b.total)) : 1
  const trendMaxUv = Math.max(...trend.map((d) => d.uv), 1)
  const trendMaxPv = Math.max(...trend.map((d) => d.pv), 1)
  const trendMaxSignups = Math.max(...trend.map((d) => d.signups), 1)

  const kstNow = new Date(Date.now() + 9 * 60 * 60 * 1000)
  const kstY = kstNow.getUTCFullYear()
  const kstM = String(kstNow.getUTCMonth() + 1).padStart(2, '0')
  const kstD = String(kstNow.getUTCDate()).padStart(2, '0')
  const okrPeriod = `${kstY}.${kstM}.01 ~ ${kstY}.${kstM}.${kstD}`

  return (
    <div className="space-y-6">
      {/* 자동화 중지 배너 */}
      {!isAutomationActive && (
        <div className="rounded-xl border border-orange-200 bg-orange-50 p-4">
          <div className="flex items-center justify-between">
            <div>
              <span className="font-bold text-orange-800">🚨 자동화 일시 중지 중</span>
              <p className="mt-0.5 text-sm text-orange-700">
                에이전트가 실행되지 않습니다. 재개하려면 아래 버튼을 누르세요.
              </p>
            </div>
            <AutomationToggle isActive={false} />
          </div>
        </div>
      )}

      <AdminQuickStart />

      {/* ① Today KPI */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        <KpiCard label="오늘 방문 (UV)" value={stats.todayUniqueVisitors} icon="👁️" sub={`회원 ${stats.memberUv} · 비회원 ${stats.guestUv}`} />
        <KpiCard label="오늘 PV" value={stats.todayPV} icon="📄" sub={`회원 ${stats.memberPv.toLocaleString()} · 비회원 ${stats.guestPv.toLocaleString()}`} />
        <KpiCard label="신규 가입" value={stats.todaySignups} icon="🆕" sub="실고객만(봇 제외)" href="/admin/members" />
        <KpiCard
          label="방문→가입 전환율"
          value={stats.todayConversionRate !== null ? `${stats.todayConversionRate}%` : '—'}
          icon="📊"
          sub={stats.todayUniqueVisitors === 0 ? '방문 데이터 없음' : undefined}
        />
        <KpiCard
          label="오늘 글/댓글"
          value={`+${stats.todayPosts.toLocaleString()} / +${stats.todayComments.toLocaleString()}`}
          icon="📝"
          sub="회원 글 / 회원 댓글(봇 제외)"
          href="/admin/content"
        />
        <KpiCard
          label="미처리 신고"
          value={stats.pendingReports}
          icon="🛡️"
          sub={stats.pendingReports === 0 ? '이상 없음' : '즉시 처리 필요'}
          href="/admin/reports"
        />
      </div>

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

      {/* ② Monthly OKR */}
      <section className="rounded-xl border border-[#FF6F61]/30 bg-[#FF6F61]/5 p-5">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-bold text-zinc-900">🎯 이번 달 OKR</h2>
            <p className="mt-0.5 text-xs font-medium text-[#FF6F61]">
              광고 + SEO로 진짜 커뮤니티 트래픽 만들기
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs text-zinc-500">{okrPeriod}</p>
            <p className="mt-0.5 text-xs text-zinc-400">6월 말 목표 대비 기준선</p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <OkrCard
            label={Q2_OKR.uv.label}
            current={okr.monthlyUv}
            target={Q2_OKR.uv.target}
            unit={Q2_OKR.uv.unit}
            desc={Q2_OKR.uv.desc}
          />
          <OkrCard
            label={Q2_OKR.avgPv.label}
            current={okr.avgPvPerUv}
            target={Q2_OKR.avgPv.target}
            unit={Q2_OKR.avgPv.unit}
            desc={Q2_OKR.avgPv.desc}
            decimals={1}
          />
          <OkrCard
            label={Q2_OKR.conversion.label}
            current={okr.conversionRate}
            target={Q2_OKR.conversion.target}
            unit={Q2_OKR.conversion.unit}
            desc={Q2_OKR.conversion.desc}
            decimals={1}
          />
          {/* KR4 D7 — CDO 수집 상태에 따라 분기 */}
          <div className="rounded-xl border border-zinc-200 bg-white p-4">
            <p className="text-xs font-bold text-zinc-700">{Q2_OKR.d7Retention.label}</p>
            {cdoIsStale ? (
              <div className="mt-2 rounded-lg bg-zinc-50 px-3 py-2 text-xs text-zinc-500">
                📡 수집 중단
                {okr.cdoLastCollectedAt && (
                  <span className="mt-0.5 block text-zinc-400">
                    최종:{' '}
                    {new Date(okr.cdoLastCollectedAt).toLocaleDateString('ko-KR', {
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                )}
              </div>
            ) : (
              <>
                <div className="mt-2 flex items-baseline justify-between">
                  <span className="text-xl font-bold text-zinc-900">
                    {okr.d7RetentionPct ?? 0}
                    {Q2_OKR.d7Retention.unit}
                  </span>
                  <span className="text-xs text-zinc-500">
                    / {Q2_OKR.d7Retention.target}
                    {Q2_OKR.d7Retention.unit}
                  </span>
                </div>
                <ProgressBar value={okr.d7RetentionPct ?? 0} max={Q2_OKR.d7Retention.target} />
                <p className="mt-1.5 text-right text-xs font-bold text-zinc-500">
                  {Math.min(
                    100,
                    Math.round(((okr.d7RetentionPct ?? 0) / Q2_OKR.d7Retention.target) * 100),
                  )}
                  %
                </p>
              </>
            )}
            <p className="mt-2 text-xs text-zinc-400">{Q2_OKR.d7Retention.desc}</p>
          </div>
        </div>

      </section>

      {/* ③ 30일 트렌드 */}
      <section className="rounded-xl border border-zinc-200 bg-white p-5">
        <h2 className="mb-4 text-sm font-bold text-zinc-900">📈 최근 30일 트렌드</h2>
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
          <MiniBarChart
            data={trend}
            accessor="uv"
            max={trendMaxUv}
            color="bg-[#FF6F61]"
            label="일별 UV"
          />
          <MiniBarChart
            data={trend}
            accessor="pv"
            max={trendMaxPv}
            color="bg-blue-400"
            label="일별 PV"
          />
          <MiniBarChart
            data={trend}
            accessor="signups"
            max={trendMaxSignups}
            color="bg-green-400"
            label="일별 신규가입"
          />
        </div>
      </section>

      {/* ④ 욕망 지도 + 게시판 활성도 */}
      {brief && (
        <DailyBriefWidget
          dominantDesire={brief.dominantDesire}
          dominantEmotion={brief.dominantEmotion}
          desireRanking={
            brief.desireRanking as Array<{ category: string; percent: number; label: string }>
          }
          date={brief.date}
        />
      )}

      {boards.length > 0 && (
        <section className="rounded-xl border border-zinc-200 bg-white p-5">
          <h2 className="mb-4 text-sm font-bold text-zinc-900">🗂️ 게시판별 7일 활성도 <span className="font-normal text-zinc-400">(사용자 글 / 전체 댓글)</span></h2>
          <div className="space-y-2">
            {boards.map((b) => (
              <div key={b.boardType} className="flex items-center gap-3">
                <span className="w-24 shrink-0 truncate text-xs text-zinc-600">
                  {BOARD_TYPE_LABELS[b.boardType] ?? b.boardType}
                </span>
                <div className="relative h-6 flex-1 rounded bg-zinc-100">
                  <div
                    className="absolute inset-y-0 left-0 rounded bg-[#FF6F61]/60 transition-all"
                    style={{
                      width: `${Math.max(2, Math.round((b.total / boardMax) * 100))}%`,
                    }}
                  />
                  <span className="absolute inset-0 flex items-center justify-end pr-2 text-xs font-medium text-zinc-700">
                    글 {b.posts} · 댓글 {b.comments}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

    </div>
  )
}

// ── 공통 컴포넌트 ──

function ProgressBar({ value, max }: { value: number; max: number }) {
  const pct = max <= 0 ? 0 : Math.min(100, Math.round((value / max) * 100))
  const color = pct >= 80 ? 'bg-green-500' : pct >= 40 ? 'bg-[#FF6F61]' : 'bg-zinc-300'
  return (
    <div className="mt-2 h-2 w-full rounded-full bg-zinc-100">
      <div className={`h-2 rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
    </div>
  )
}

function OkrCard({
  label,
  current,
  target,
  unit,
  desc,
  decimals = 0,
}: {
  label: string
  current: number
  target: number
  unit: string
  desc: string
  decimals?: number
}) {
  const pct = target <= 0 ? 0 : Math.min(100, Math.round((current / target) * 100))
  const displayCurrent = decimals > 0 ? current.toFixed(decimals) : current.toLocaleString()
  const displayTarget = decimals > 0 ? target.toFixed(decimals) : target.toLocaleString()
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4">
      <p className="text-xs font-bold text-zinc-700">{label}</p>
      <div className="mt-2 flex items-baseline justify-between">
        <span className="text-xl font-bold text-zinc-900">
          {displayCurrent}
          {unit}
        </span>
        <span className="text-xs text-zinc-500">
          / {displayTarget}
          {unit}
        </span>
      </div>
      <ProgressBar value={current} max={target} />
      <p className="mt-1.5 text-right text-xs font-bold text-zinc-500">{pct}%</p>
      <p className="mt-2 text-xs text-zinc-400">{desc}</p>
    </div>
  )
}

type TrendDay = { date: string; uv: number; pv: number; signups: number }

function MiniBarChart({
  data,
  accessor,
  max,
  color,
  label,
}: {
  data: TrendDay[]
  accessor: 'uv' | 'pv' | 'signups'
  max: number
  color: string
  label: string
}) {
  const total = data.reduce((s, d) => s + d[accessor], 0)
  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between">
        <span className="text-xs font-medium text-zinc-600">{label}</span>
        <span className="text-sm font-bold text-zinc-900">{total.toLocaleString()}</span>
      </div>
      <div className="flex h-16 items-end gap-px">
        {data.map((d) => {
          const h = Math.max(2, Math.round((d[accessor] / max) * 64))
          return (
            <div
              key={d.date}
              title={`${d.date}: ${d[accessor].toLocaleString()}`}
              className={`flex-1 rounded-t-sm ${color}`}
              style={{ height: `${h}px` }}
            />
          )
        })}
      </div>
      <div className="mt-1 flex justify-between text-xs text-zinc-400">
        <span>{data[0]?.date.slice(5)}</span>
        <span>{data[data.length - 1]?.date.slice(5)}</span>
      </div>
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
    <div
      className={`rounded-xl border border-zinc-200 bg-white p-5 ${
        href ? 'transition-colors hover:border-zinc-300 hover:bg-zinc-50' : ''
      }`}
    >
      <div className="flex items-center justify-between">
        <span className="text-sm text-zinc-500">{label}</span>
        <span className="text-lg">{icon}</span>
      </div>
      <p className="mt-2 text-2xl font-bold text-zinc-900">{displayValue}</p>
      {sub && <p className="mt-1 text-xs text-zinc-400">{sub}</p>}
    </div>
  )
  if (href) return <Link href={href} className="block no-underline">{inner}</Link>
  return inner
}
