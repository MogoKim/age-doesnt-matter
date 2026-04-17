import { prisma } from '@/lib/prisma'
import { unstable_cache } from 'next/cache'

// ─── 대시보드 KPI (5분 캐시) ───

export const getDashboardStats = unstable_cache(
  async () => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    const [
      todayUsers,
      todaySignups,
      todayPosts,
      todayComments,
      pendingReports,
      pendingBotReviews,
    ] = await Promise.all([
      prisma.user.count({
        where: { lastLoginAt: { gte: today } },
      }),
      prisma.user.count({
        where: { createdAt: { gte: today } },
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
    ])

    return {
      todayUsers,
      todaySignups,
      todayPosts,
      todayComments,
      pendingReports,
      pendingBotReviews,
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
