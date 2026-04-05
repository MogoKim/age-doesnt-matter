import type { Metadata } from 'next'
import Link from 'next/link'
import { prisma } from '@/lib/prisma'
import { unstable_cache } from 'next/cache'
import { getSocialExperiments } from '@/lib/queries/admin'
import type { ExperimentStatus } from '@/generated/prisma/client'

export const metadata: Metadata = { title: '데이터 분석' }

const getAnalyticsStats = unstable_cache(
  async () => {
    const now = new Date()
    const todayStart = new Date(now)
    todayStart.setHours(0, 0, 0, 0)

    const weekAgo = new Date(now)
    weekAgo.setDate(weekAgo.getDate() - 7)

    const monthAgo = new Date(now)
    monthAgo.setDate(monthAgo.getDate() - 30)

    const [dau, wau, mau, todayPosts, todayComments, activeUsers, pendingReports, weeklyCommentersRaw] =
      await Promise.all([
        prisma.user.count({ where: { lastLoginAt: { gte: todayStart } } }),
        prisma.user.count({ where: { lastLoginAt: { gte: weekAgo } } }),
        prisma.user.count({ where: { lastLoginAt: { gte: monthAgo } } }),
        prisma.post.count({ where: { createdAt: { gte: todayStart }, status: 'PUBLISHED' } }),
        prisma.comment.count({ where: { createdAt: { gte: todayStart }, status: 'ACTIVE' } }),
        prisma.user.count({ where: { status: 'ACTIVE' } }),
        prisma.report.count({ where: { status: 'PENDING' } }),
        // NSM: 주간 댓글 작성 고유 유저 수
        prisma.comment.groupBy({
          by: ['authorId'],
          where: { createdAt: { gte: weekAgo }, status: 'ACTIVE' },
        }),
      ])

    return {
      dau, wau, mau, todayPosts, todayComments, activeUsers, pendingReports,
      weeklyCommenters: weeklyCommentersRaw.length,
    }
  },
  ['admin-analytics-stats'],
  { revalidate: 600 }
)

const EXPERIMENT_STATUS_LABELS: Record<ExperimentStatus, { label: string; className: string }> = {
  PLANNING: { label: '기획 중', className: 'bg-zinc-100 text-zinc-600' },
  ACTIVE: { label: '진행 중', className: 'bg-blue-50 text-blue-700' },
  COMPLETED: { label: '완료', className: 'bg-green-50 text-green-700' },
  ANALYZED: { label: '분석 완료', className: 'bg-purple-50 text-purple-700' },
}

interface Props {
  searchParams: Promise<{ tab?: string }>
}

export default async function AdminAnalyticsPage({ searchParams }: Props) {
  const params = await searchParams
  const activeTab = params.tab ?? 'overview'

  const [stats, experiments] = await Promise.all([
    getAnalyticsStats(),
    activeTab === 'sns' ? getSocialExperiments(20) : Promise.resolve([]),
  ])

  const { dau, wau, mau, todayPosts, todayComments, activeUsers, pendingReports } = stats

  const kpis = [
    { label: 'DAU (오늘)', value: dau },
    { label: 'WAU (7일)', value: wau },
    { label: 'MAU (30일)', value: mau },
    { label: '총 회원', value: activeUsers },
    { label: '오늘 글', value: todayPosts },
    { label: '오늘 댓글', value: todayComments },
    { label: '미처리 신고', value: pendingReports },
  ]

  const tabs = [
    { key: 'overview', label: '📊 개요' },
    { key: 'sns', label: '📱 SNS 실험' },
  ]

  return (
    <div className="space-y-6">
      {/* KPI 카드 */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
        {kpis.map((kpi) => (
          <div key={kpi.label} className="rounded-xl border border-zinc-200 bg-white p-4">
            <p className="text-xs text-zinc-500">{kpi.label}</p>
            <p className="mt-1 text-2xl font-bold text-zinc-900">
              {kpi.value.toLocaleString()}
            </p>
          </div>
        ))}
      </div>

      {/* 탭 */}
      <div className="flex gap-1 rounded-xl border border-zinc-200 bg-zinc-50 p-1">
        {tabs.map((tab) => (
          <Link
            key={tab.key}
            href={`/admin/analytics?tab=${tab.key}`}
            className={`rounded-lg px-5 py-2 text-sm font-medium no-underline transition-colors ${
              activeTab === tab.key
                ? 'bg-white text-zinc-900 shadow-sm'
                : 'text-zinc-500 hover:text-zinc-700'
            }`}
          >
            {tab.label}
          </Link>
        ))}
      </div>

      {/* 탭 콘텐츠 */}
      {activeTab === 'overview' && (
        <OkrWidget mau={mau} wau={wau} weeklyCommenters={stats.weeklyCommenters} />
      )}

      {activeTab === 'sns' && (
        <div className="space-y-4">
          <h2 className="text-sm font-bold text-zinc-900">📱 SNS A/B 실험 결과</h2>
          {experiments.length === 0 ? (
            <div className="rounded-xl border border-zinc-200 bg-white px-6 py-12 text-center text-sm text-zinc-400">
              SNS 실험 데이터가 없습니다.
            </div>
          ) : (
            <div className="space-y-4">
              {experiments.map((exp) => {
                const badge = EXPERIMENT_STATUS_LABELS[exp.status]
                const results = exp.results as {
                  controlAvg?: number
                  testAvg?: number
                  winner?: string
                  delta?: number
                } | null
                return (
                  <div key={exp.id} className="rounded-xl border border-zinc-200 bg-white p-5">
                    <div className="mb-3 flex items-start justify-between gap-4">
                      <div>
                        <div className="mb-1 flex items-center gap-2">
                          <span className="text-xs font-medium text-zinc-400">{exp.weekNumber}주차</span>
                          <span className={`rounded-md px-2 py-0.5 text-xs font-medium ${badge.className}`}>
                            {badge.label}
                          </span>
                        </div>
                        <h3 className="font-bold text-zinc-900">{exp.hypothesis}</h3>
                      </div>
                      <div className="shrink-0 text-right text-xs text-zinc-400">
                        <div>{new Date(exp.startDate).toLocaleDateString('ko-KR')} ~</div>
                        <div>{new Date(exp.endDate).toLocaleDateString('ko-KR')}</div>
                      </div>
                    </div>

                    <div className="mb-3 flex gap-4 text-xs">
                      <span className="rounded bg-zinc-100 px-2 py-1 text-zinc-600">
                        변수: {exp.variable}
                      </span>
                      <span className="rounded bg-blue-50 px-2 py-1 text-blue-700">
                        통제: {exp.controlValue}
                      </span>
                      <span className="rounded bg-[#FF6F61]/10 px-2 py-1 text-[#FF6F61]">
                        실험: {exp.testValue}
                      </span>
                    </div>

                    {results && (
                      <div className="mb-3 grid grid-cols-3 gap-3">
                        <div className="rounded-lg bg-zinc-50 p-3 text-center">
                          <div className="text-xs text-zinc-400">통제군 평균</div>
                          <div className="mt-1 text-lg font-bold text-zinc-700">
                            {results.controlAvg?.toFixed(1) ?? '—'}
                          </div>
                        </div>
                        <div className="rounded-lg bg-zinc-50 p-3 text-center">
                          <div className="text-xs text-zinc-400">실험군 평균</div>
                          <div className="mt-1 text-lg font-bold text-zinc-700">
                            {results.testAvg?.toFixed(1) ?? '—'}
                          </div>
                        </div>
                        <div className="rounded-lg bg-zinc-50 p-3 text-center">
                          <div className="text-xs text-zinc-400">승자</div>
                          <div className="mt-1 text-lg font-bold text-[#FF6F61]">
                            {results.winner ?? '—'}
                            {results.delta !== undefined && (
                              <span className="ml-1 text-sm text-zinc-500">
                                (+{results.delta?.toFixed(1)})
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    )}

                    {exp.learnings && (
                      <div className="rounded-lg bg-blue-50 p-3">
                        <div className="mb-1 text-xs font-medium text-blue-700">💡 인사이트</div>
                        <p className="text-sm text-blue-800">{exp.learnings}</p>
                      </div>
                    )}

                    {exp.nextAction && (
                      <div className="mt-2 text-xs text-zinc-500">
                        다음 액션: <span className="font-medium text-zinc-700">{exp.nextAction}</span>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Q2 2026 OKR 위젯 ──
// 목표: MAU 500 / 주간 댓글 50명 / D7 35% / 월 매출 20만원
const Q2_OKR = {
  mau:              { label: 'KR1 — MAU', target: 500,  unit: '명', desc: '채널별: 지식인봇150 / SEO200 / SNS100 / 직접50' },
  weeklyCommenters: { label: 'KR2 — 주간 댓글 참여 (NSM)', target: 50, unit: '명/주', desc: '"봇은 댓글을 쓰지 않는다" — 진짜 커뮤니티 생명력' },
  d7Retention:      { label: 'KR3 — D7 재방문율', target: 35, unit: '%', desc: 'GA4 Cohort 설정 필요 (현재 미측정)' },
  revenue:          { label: 'KR4 — 월 매출', target: 20, unit: '만원', desc: 'AdSense 5만 + 쿠팡파트너스 15만' },
} as const

function ProgressBar({ value, max }: { value: number; max: number }) {
  const pct = Math.min(100, Math.round((value / max) * 100))
  const color = pct >= 80 ? 'bg-green-500' : pct >= 40 ? 'bg-[#FF6F61]' : 'bg-zinc-300'
  return (
    <div className="mt-2 h-2 w-full rounded-full bg-zinc-100">
      <div className={`h-2 rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
    </div>
  )
}

function OkrWidget({
  mau,
  wau,
  weeklyCommenters,
}: {
  mau: number
  wau: number
  weeklyCommenters: number
}) {
  const milestones = [
    { date: '4월 말', target: 50 },
    { date: '5월 말', target: 150 },
    { date: '6월 말 (최종)', target: 500 },
  ]

  const krs = [
    { ...Q2_OKR.mau, current: mau },
    { ...Q2_OKR.weeklyCommenters, current: weeklyCommenters },
    { ...Q2_OKR.d7Retention, current: 0 },   // GA4 미연동 → 0
    { ...Q2_OKR.revenue, current: 0 },         // 수동 입력 필요
  ]

  return (
    <div className="space-y-4">
      {/* OKR 헤더 */}
      <div className="rounded-xl border border-[#FF6F61]/30 bg-[#FF6F61]/5 p-5">
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-sm font-bold text-zinc-900">🎯 Q2 2026 OKR — 도전안</h2>
          <span className="text-xs text-zinc-400">2026-04-01 ~ 2026-06-30</span>
        </div>
        <p className="text-sm font-medium text-[#FF6F61]">"SEO + 입소문 동시 성과로 500명을 만든다"</p>
      </div>

      {/* KR 카드 4개 */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {krs.map((kr) => {
          const pct = Math.min(100, Math.round((kr.current / kr.target) * 100))
          const isUnmeasured = kr.current === 0 && (kr.label.includes('D7') || kr.label.includes('매출'))
          return (
            <div key={kr.label} className="rounded-xl border border-zinc-200 bg-white p-4">
              <div className="flex items-start justify-between gap-2">
                <p className="text-xs font-bold text-zinc-700">{kr.label}</p>
                <span className="shrink-0 text-xs font-bold text-zinc-900">
                  {isUnmeasured ? '—' : kr.current.toLocaleString()}{kr.unit} / {kr.target.toLocaleString()}{kr.unit}
                </span>
              </div>
              {isUnmeasured ? (
                <div className="mt-2 rounded-lg bg-zinc-50 px-3 py-1.5 text-xs text-zinc-400">
                  측정 미연동 — {kr.label.includes('D7') ? 'GA4 Cohort 설정 필요' : '매출 수동 기록 필요'}
                </div>
              ) : (
                <>
                  <ProgressBar value={kr.current} max={kr.target} />
                  <p className="mt-1.5 text-right text-xs font-bold text-zinc-500">{pct}%</p>
                </>
              )}
              <p className="mt-2 text-xs text-zinc-400">{kr.desc}</p>
            </div>
          )
        })}
      </div>

      {/* 월별 마일스톤 */}
      <div className="rounded-xl border border-zinc-200 bg-white p-5">
        <h3 className="mb-3 text-sm font-bold text-zinc-900">📅 MAU 마일스톤</h3>
        <div className="flex items-end gap-3">
          {milestones.map((m) => {
            const reached = mau >= m.target
            const pct = Math.min(100, Math.round((mau / m.target) * 100))
            return (
              <div key={m.date} className="flex-1 text-center">
                <div className="relative mx-auto mb-1 h-20 w-full rounded-lg bg-zinc-100">
                  <div
                    className={`absolute bottom-0 left-0 right-0 rounded-lg transition-all ${reached ? 'bg-green-400' : 'bg-[#FF6F61]/60'}`}
                    style={{ height: `${pct}%` }}
                  />
                  <span className="absolute inset-0 flex items-center justify-center text-xs font-bold text-zinc-700">
                    {reached ? '✅' : `${pct}%`}
                  </span>
                </div>
                <p className="text-xs font-bold text-zinc-700">{m.target}명</p>
                <p className="text-xs text-zinc-400">{m.date}</p>
              </div>
            )
          })}
        </div>
        <p className="mt-3 text-center text-xs text-zinc-400">
          현재 MAU: <span className="font-bold text-zinc-700">{mau.toLocaleString()}명</span>
          {' · '}WAU: <span className="font-bold text-zinc-700">{wau.toLocaleString()}명</span>
        </p>
      </div>

      {/* NSM 강조 */}
      <div className="rounded-xl border border-zinc-200 bg-white p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-bold text-zinc-900">⭐ NSM — 주간 댓글 참여 유저</h3>
          <span className="rounded-full bg-[#FF6F61]/10 px-3 py-1 text-xs font-bold text-[#FF6F61]">
            목표 50명/주
          </span>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-4xl font-bold text-zinc-900">{weeklyCommenters}</div>
          <div className="flex-1">
            <ProgressBar value={weeklyCommenters} max={50} />
            <p className="mt-1 text-xs text-zinc-400">
              봇은 댓글을 쓰지 않는다 — 이 숫자가 진짜 커뮤니티 생명력
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
