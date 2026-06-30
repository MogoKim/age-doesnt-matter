import Link from 'next/link'
import {
  getDashboardStats,
  getMonthlyOkrStats,
  getDailyTrend,
  getBoardActivity,
  getDailyBrief,
  getAutomationStatus,
  getAdminQueueCounts,
  getInsights,
  getRetentionQuadrants,
} from '@/lib/queries/admin'
import AdminQuickStart from '@/components/admin/AdminQuickStart'
import DailyBriefWidget from '@/components/admin/DailyBriefWidget'
import InsightsSection from '@/components/admin/InsightsSection'
import AutomationToggle from '@/components/admin/AutomationToggle'
import InfoTip from '@/components/admin/InfoTip'
import { prisma } from '@/lib/prisma'
import KpiHistoryPanel from '@/components/admin/KpiHistoryPanel'
import type { SnapshotRow } from '@/lib/queries/admin/admin.kpi-history'

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
  const [stats, okr, trend, boards, brief, isAutomationActive, queueCounts, insights, retention] =
    await Promise.all([
      getDashboardStats(),
      getMonthlyOkrStats(),
      getDailyTrend(),
      getBoardActivity(),
      getDailyBrief(),
      getAutomationStatus(),
      getAdminQueueCounts(),
      getInsights(),
      getRetentionQuadrants(),
    ])

  // 운영 상황판용 완료 스냅샷(DailyKpiSnapshot) — 테이블 부재 등은 빈 배열로 폴백(패널이 안내)
  let snapshotRows: SnapshotRow[] = []
  try {
    snapshotRows = (await prisma.dailyKpiSnapshot.findMany({ orderBy: { date: 'desc' }, take: 90 })) as unknown as SnapshotRow[]
  } catch { /* 패널이 빈 상태 안내 */ }

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

      {/* 운영 상황판 — 완료 데이터(DailyKpiSnapshot 스냅샷). 첫 화면 최상단 */}
      <KpiHistoryPanel rows={snapshotRows} />

      {/* ② 오늘 실시간 (당일 partial) — 완료 데이터와 시각 구분 */}
      <div className="rounded-2xl border border-dashed border-amber-300 bg-amber-50/40 p-4">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center rounded-full bg-amber-500 px-3 py-1 text-xs font-bold text-white">⏳ 오늘 실시간</span>
        <span className="text-xs text-amber-700">당일 미완결(partial) · 확정 수치는 위 “완료 데이터” 상황판</span>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <KpiCard label="오늘 방문 (UV)" value={stats.todayUniqueVisitors} icon="👁️" sub={`회원 ${stats.memberUv} · 비회원 ${stats.guestUv}`} tip="오늘 방문한 고유 사용자(세션) 수. 봇 제외. 회원=오늘 로그인한 세션, 비회원=비로그인 세션, 합=전체. 비회원→회원 전환 유저는 회원으로 1회만(중복 없음)." />
        <KpiCard label="오늘 PV" value={stats.todayPV} icon="📄" sub={`회원 ${stats.memberPv.toLocaleString()} · 비회원 ${stats.guestPv.toLocaleString()}`} tip="오늘 페이지 조회 수(봇 제외). 회원/비회원 분리, 합=전체. 같은 사람이 여러 번 봐도 다 카운트(UV와 달리 중복 포함)." />
        <KpiCard label="신규 가입" value={stats.todaySignups} icon="🆕" sub="실고객만(봇 제외)" href="/admin/members" tip="오늘 가입한 실고객 수. providerId가 순수 숫자인 진짜 카카오 가입자만. seed·curator 등 봇 전부 제외." />
        <KpiCard
          label="방문→가입 전환율"
          value={stats.todayConversionRate !== null ? `${stats.todayConversionRate}%` : '—'}
          icon="📊"
          sub={stats.todayUniqueVisitors === 0 ? '방문 데이터 없음' : undefined}
          tip="오늘 신규가입 ÷ 전체 UV(회원+비회원). 분모는 오늘 전체 방문자(회원 재방문 포함). 가입은 비회원만 하므로 회원 방문이 분모에 섞여 다소 보수적으로 잡힘."
        />
        <KpiCard
          label="오늘 글/댓글"
          value={`+${stats.todayPosts.toLocaleString()} / +${stats.todayComments.toLocaleString()}`}
          icon="📝"
          sub="회원 글 / 회원 댓글(봇 제외)"
          href="/admin/content"
          tip="오늘 실고객(카카오 가입 회원)이 쓴 글/댓글 수. 봇(wave·seed·curator)과 비회원 게스트 댓글은 제외. 글=source USER, 댓글=author가 실고객."
        />
        <KpiCard
          label="미처리 신고"
          value={stats.pendingReports}
          icon="🛡️"
          sub={stats.pendingReports === 0 ? '이상 없음' : '즉시 처리 필요'}
          href="/admin/reports"
          tip="아직 처리(승인/숨김/삭제)하지 않은 신고 건수. PENDING 상태 Report."
        />
      </div>
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
            tip="이달(1일~오늘) 고유 세션 누적 수. 봇·창업자 제외, 같은 세션은 한 달 내 중복 제거. (트렌드 그래프의 '30일 합'과 달리 월 단위 distinct라 더 작음)"
          />
          <OkrCard
            label={Q2_OKR.avgPv.label}
            current={okr.avgPvPerUv}
            target={Q2_OKR.avgPv.target}
            unit={Q2_OKR.avgPv.unit}
            desc={Q2_OKR.avgPv.desc}
            decimals={1}
            tip="이달 총 PV ÷ 이달 UV. 방문 한 번에 평균 몇 페이지 보는지. 콘텐츠 흡인력 지표."
          />
          <OkrCard
            label={Q2_OKR.conversion.label}
            current={okr.conversionRate}
            target={Q2_OKR.conversion.target}
            unit={Q2_OKR.conversion.unit}
            desc={Q2_OKR.conversion.desc}
            decimals={1}
            tip="이달 신규가입(실고객 providerId 숫자) ÷ 이달 UV. 상단 '오늘 전환율'과 봇 기준 동일, 기간만 월 단위."
          />
          {/* KR4 D7 — 공식: EventLog 비회원 D7(성숙 코호트). GA4는 legacy(수집중단) */}
          <div className="rounded-xl border border-zinc-200 bg-white p-4">
            <p className="text-xs font-bold text-zinc-700">{Q2_OKR.d7Retention.label}<InfoTip text="EventLog 기반 비회원 D7 재방문율(공식). 성숙 코호트(첫방문 후 7일 경과)만 분모에 포함 — 아직 7일 안 지난 코호트는 실패로 세지 않음. GA4 코호트는 수집 중단되어 공식 지표에서 제외(아래 legacy 참고만)." /></p>
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
            <p className="mt-1.5 flex items-center justify-between text-xs text-zinc-500">
              <span>코호트 {okr.guestRetention.d7.denom}명 · 재방문 {okr.guestRetention.d7.returned}명 (D1 {okr.d1RetentionPct ?? '–'}%)</span>
              <span className="font-bold">
                {Math.min(100, Math.round(((okr.d7RetentionPct ?? 0) / Q2_OKR.d7Retention.target) * 100))}%
              </span>
            </p>
            <p className="mt-1 text-xs text-zinc-400">
              GA4(legacy·수집중단): {okr.ga4D7RetentionPctLegacy ?? '–'}%
              {okr.ga4LastCollectedAt && ` · 최종 ${new Date(okr.ga4LastCollectedAt).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' })}`}
            </p>
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
            tip="막대=각 날의 고유 방문자(일별 distinct), 큰 숫자=최근 30일 합계. 같은 사람이 여러 날 오면 날마다 세므로 월 UV(distinct)보다 큼."
          />
          <MiniBarChart
            data={trend}
            accessor="pv"
            max={trendMaxPv}
            color="bg-blue-400"
            label="일별 PV"
            tip="막대=각 날의 페이지뷰, 큰 숫자=최근 30일 합계. 봇 제외."
          />
          <MiniBarChart
            data={trend}
            accessor="signups"
            max={trendMaxSignups}
            color="bg-green-400"
            label="일별 신규가입"
            tip="막대=각 날의 신규가입(실고객 providerId 숫자만), 큰 숫자=최근 30일 합계. 인사이트 7일 신규와 봇 기준 동일."
          />
        </div>
      </section>

      {/* ④ 인사이트 (구 /admin/insights 통합) */}
      <InsightsSection data={insights} retention={retention} />

      {/* ⑤ 욕망 지도 + 게시판 활성도 */}
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

      {/* 어드민 가이드 — 하단 이동(운영 상황판 우선) */}
      <AdminQuickStart />
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
  tip,
}: {
  label: string
  current: number
  target: number
  unit: string
  desc: string
  decimals?: number
  tip?: string
}) {
  const pct = target <= 0 ? 0 : Math.min(100, Math.round((current / target) * 100))
  const displayCurrent = decimals > 0 ? current.toFixed(decimals) : current.toLocaleString()
  const displayTarget = decimals > 0 ? target.toFixed(decimals) : target.toLocaleString()
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4">
      <p className="text-xs font-bold text-zinc-700">{label}{tip && <InfoTip text={tip} />}</p>
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
  tip,
}: {
  data: TrendDay[]
  accessor: 'uv' | 'pv' | 'signups'
  max: number
  color: string
  label: string
  tip?: string
}) {
  const total = data.reduce((s, d) => s + d[accessor], 0)
  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between">
        <span className="text-xs font-medium text-zinc-600">{label}{tip && <InfoTip text={tip} />}</span>
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
  tip,
}: {
  label: string
  value: number | string
  icon: string
  prefix?: string
  href?: string
  sub?: string
  tip?: string
}) {
  const displayValue = typeof value === 'number' ? `${prefix}${value.toLocaleString()}` : value
  const inner = (
    <div
      className={`rounded-xl border border-zinc-200 bg-white p-5 ${
        href ? 'transition-colors hover:border-zinc-300 hover:bg-zinc-50' : ''
      }`}
    >
      <div className="flex items-center justify-between">
        <span className="text-sm text-zinc-500">{label}{tip && <InfoTip text={tip} />}</span>
        <span className="text-lg">{icon}</span>
      </div>
      <p className="mt-2 text-2xl font-bold text-zinc-900">{displayValue}</p>
      {sub && <p className="mt-1 text-xs text-zinc-400">{sub}</p>}
    </div>
  )
  if (href) return <Link href={href} className="block no-underline">{inner}</Link>
  return inner
}
