import { prisma } from '@/lib/prisma'
import { unstable_cache } from 'next/cache'

// ─── 대시보드 KPI (5분 캐시) ───

function getKstTodayStart(): Date {
  const now = new Date()
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000)
  return new Date(Date.UTC(kst.getUTCFullYear(), kst.getUTCMonth(), kst.getUTCDate(), -9, 0, 0, 0))
}

export const getDashboardStats = unstable_cache(
  async () => {
    const today = getKstTodayStart()

    const [
      todayUniqueVisitorRows,
      todayLogins,
      todaySignups,
      todayPosts,
      todayComments,
      pendingReports,
      pendingBotReviews,
      pushSubCount,
    ] = await Promise.all([
      prisma.eventLog.findMany({
        where: {
          eventName: 'page_view',
          isBot: false,
          sessionId: { not: null },
          createdAt: { gte: today },
        },
        select: { sessionId: true },
        distinct: ['sessionId'],
      }),
      prisma.user.count({
        where: {
          lastLoginAt: { gte: today },
          NOT: { email: { endsWith: '@unao.bot' } },
        },
      }),
      prisma.user.count({
        where: {
          createdAt: { gte: today },
          NOT: { email: { endsWith: '@unao.bot' } },
        },
      }),
      prisma.post.count({
        where: { createdAt: { gte: today }, status: 'PUBLISHED' },
      }),
      prisma.comment.count({
        where: { createdAt: { gte: today }, status: 'ACTIVE' },
      }),
      prisma.report.count({
        where: { status: 'PENDING' },
      }),
      prisma.botLog.count({
        where: { reviewPendingCount: { gt: 0 } },
      }),
      prisma.pushSubscription.count(),
    ])

    return {
      todayUniqueVisitors: todayUniqueVisitorRows.length,
      todayLogins,
      todaySignups,
      todayPosts,
      todayComments,
      pendingReports,
      pendingBotReviews,
      pushSubCount,
    }
  },
  ['admin-dashboard-stats'],
  { revalidate: 300 }
)

// ─── 총 카운트 ───

export const getTotalCounts = unstable_cache(
  async () => {
    const [totalUsers, totalPosts, totalComments] = await Promise.all([
      prisma.user.count({ where: { status: 'ACTIVE' } }),
      prisma.post.count({ where: { status: 'PUBLISHED' } }),
      prisma.comment.count({ where: { status: 'ACTIVE' } }),
    ])
    return { totalUsers, totalPosts, totalComments }
  },
  ['admin-total-counts'],
  { revalidate: 600 }
)

// ─── SocialExperiment ───

export async function getSocialExperiments(limit = 10) {
  return prisma.socialExperiment.findMany({
    orderBy: { weekNumber: 'desc' },
    take: limit,
  })
}
