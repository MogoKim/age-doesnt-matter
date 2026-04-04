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

    const [dau, wau, mau, todayPosts, todayComments, activeUsers, pendingReports] =
      await Promise.all([
        prisma.user.count({ where: { lastLoginAt: { gte: todayStart } } }),
        prisma.user.count({ where: { lastLoginAt: { gte: weekAgo } } }),
        prisma.user.count({ where: { lastLoginAt: { gte: monthAgo } } }),
        prisma.post.count({ where: { createdAt: { gte: todayStart }, status: 'PUBLISHED' } }),
        prisma.comment.count({ where: { createdAt: { gte: todayStart }, status: 'ACTIVE' } }),
        prisma.user.count({ where: { status: 'ACTIVE' } }),
        prisma.report.count({ where: { status: 'PENDING' } }),
      ])

    return { dau, wau, mau, todayPosts, todayComments, activeUsers, pendingReports }
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
        <div className="rounded-xl border border-zinc-200 bg-white px-6 py-16 text-center">
          <p className="text-4xl">📈</p>
          <h2 className="mt-3 text-lg font-semibold text-zinc-900">상세 분석 대시보드 준비 중</h2>
          <p className="mt-2 text-sm text-zinc-500">
            트래픽 추이, 유입 경로, 콘텐츠 분석, 사용자 코호트, 전환, 건강 지표 등<br />
            GA4 + Search Console 연동 데이터 대시보드가 추가될 예정입니다.
          </p>
        </div>
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
