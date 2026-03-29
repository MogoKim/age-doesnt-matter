import type { Metadata } from 'next'
import { prisma } from '@/lib/prisma'
import { unstable_cache } from 'next/cache'

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

export default async function AdminAnalyticsPage() {
  const { dau, wau, mau, todayPosts, todayComments, activeUsers, pendingReports } =
    await getAnalyticsStats()

  const kpis = [
    { label: 'DAU (오늘)', value: dau },
    { label: 'WAU (7일)', value: wau },
    { label: 'MAU (30일)', value: mau },
    { label: '총 회원', value: activeUsers },
    { label: '오늘 글', value: todayPosts },
    { label: '오늘 댓글', value: todayComments },
    { label: '미처리 신고', value: pendingReports },
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

      {/* 준비 중 안내 */}
      <div className="rounded-xl border border-zinc-200 bg-white px-6 py-16 text-center">
        <p className="text-4xl">📈</p>
        <h2 className="mt-3 text-lg font-semibold text-zinc-900">상세 분석 대시보드 준비 중</h2>
        <p className="mt-2 text-sm text-zinc-500">
          트래픽 추이, 유입 경로, 콘텐츠 분석, 사용자 코호트, 전환, 건강 지표 등<br />
          6개 탭 대시보드가 곧 추가됩니다.
        </p>
      </div>
    </div>
  )
}
