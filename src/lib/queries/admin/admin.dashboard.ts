import { prisma } from '@/lib/prisma'
import { unstable_cache } from 'next/cache'

// ─── KST 날짜 헬퍼 ───

function getKstTodayStart(): Date {
  const now = new Date()
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000)
  return new Date(Date.UTC(kst.getUTCFullYear(), kst.getUTCMonth(), kst.getUTCDate(), -9, 0, 0, 0))
}

function getKstMonthStart(): Date {
  const now = new Date()
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000)
  return new Date(Date.UTC(kst.getUTCFullYear(), kst.getUTCMonth(), 1, -9, 0, 0, 0))
}

// ─── 오늘 핵심 KPI (5분 캐시) ───

export const getDashboardStats = unstable_cache(
  async () => {
    const today = getKstTodayStart()

    const [
      todayUvRows,
      todayPV,
      todayLogins,
      todaySignups,
      todayUserPosts,
      todayComments,
      pendingReports,
      pendingBotReviews,
      pushSubCount,
    ] = await Promise.all([
      // UV: isBot=false 필터로 founder(isBot=true) 자동 제외
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
      prisma.eventLog.count({
        where: {
          eventName: 'page_view',
          isBot: false,
          createdAt: { gte: today },
        },
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
      // 사용자 글만 (BOT/ADMIN 제외)
      prisma.post.count({
        where: { createdAt: { gte: today }, status: 'PUBLISHED', source: 'USER' },
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

    const todayUniqueVisitors = todayUvRows.length
    const todayConversionRate =
      todayUniqueVisitors > 0
        ? Math.round((todaySignups / todayUniqueVisitors) * 1000) / 10
        : null

    return {
      todayUniqueVisitors,
      todayPV,
      todayLogins,
      todaySignups,
      todayConversionRate,
      todayPosts: todayUserPosts,
      todayComments,
      pendingReports,
      pendingBotReviews,
      pushSubCount,
    }
  },
  ['admin-dashboard-stats-v2'],
  { revalidate: 300 }
)

// ─── 월간 OKR 지표 (10분 캐시) ───

export const getMonthlyOkrStats = unstable_cache(
  async () => {
    const monthStart = getKstMonthStart()

    // KR1: 월 UV
    const monthlyUvRows = await prisma.eventLog.findMany({
      where: {
        eventName: 'page_view',
        isBot: false,
        sessionId: { not: null },
        createdAt: { gte: monthStart },
      },
      select: { sessionId: true },
      distinct: ['sessionId'],
    })
    const monthlyUv = monthlyUvRows.length

    // KR2: 월 PV
    const monthlyPv = await prisma.eventLog.count({
      where: {
        eventName: 'page_view',
        isBot: false,
        createdAt: { gte: monthStart },
      },
    })
    const avgPvPerUv =
      monthlyUv > 0 ? Math.round((monthlyPv / monthlyUv) * 10) / 10 : 0

    // KR3: 월 신규가입 / UV
    const monthlySignups = await prisma.user.count({
      where: {
        createdAt: { gte: monthStart },
        NOT: { email: { endsWith: '@unao.bot' } },
      },
    })
    const conversionRate =
      monthlyUv > 0
        ? Math.round((monthlySignups / monthlyUv) * 1000) / 10
        : 0

    // KR4: CDO GA4 Cohort D7
    const latestCdoLog = await prisma.botLog.findFirst({
      where: { botType: 'CDO', action: 'KPI_DAILY', status: 'SUCCESS' },
      orderBy: { createdAt: 'desc' },
      select: { details: true, createdAt: true },
    })

    let d7RetentionPct: number | null = null
    let cdoLastCollectedAt: string | null = null

    if (latestCdoLog) {
      cdoLastCollectedAt = latestCdoLog.createdAt.toISOString()
      try {
        const kpi = JSON.parse(latestCdoLog.details as string) as {
          cohortRetention?: { d7RetentionRate?: number }
        }
        if (kpi.cohortRetention?.d7RetentionRate !== undefined) {
          d7RetentionPct = Math.round(kpi.cohortRetention.d7RetentionRate * 100)
        }
      } catch { /* ignore */ }
    }

    return {
      monthlyUv,
      monthlyPv,
      avgPvPerUv,
      monthlySignups,
      conversionRate,
      d7RetentionPct,
      cdoLastCollectedAt,
    }
  },
  ['admin-monthly-okr-stats'],
  { revalidate: 600 }
)

// ─── 최근 30일 일별 트렌드 (30분 캐시) ───

export const getDailyTrend = unstable_cache(
  async () => {
    const days = 30
    const today = getKstTodayStart()
    const startDate = new Date(today.getTime() - (days - 1) * 24 * 60 * 60 * 1000)

    const [events, signups] = await Promise.all([
      prisma.eventLog.findMany({
        where: {
          eventName: 'page_view',
          isBot: false,
          createdAt: { gte: startDate },
        },
        select: { sessionId: true, createdAt: true },
      }),
      prisma.user.findMany({
        where: {
          createdAt: { gte: startDate },
          NOT: { email: { endsWith: '@unao.bot' } },
        },
        select: { createdAt: true },
      }),
    ])

    // KST 기준 날짜별 버킷 초기화
    type Bucket = { uvSet: Set<string>; pv: number; signups: number }
    const buckets: Record<string, Bucket> = {}
    for (let i = 0; i < days; i++) {
      const kstMs = startDate.getTime() + i * 24 * 60 * 60 * 1000 + 9 * 60 * 60 * 1000
      const key = new Date(kstMs).toISOString().slice(0, 10)
      buckets[key] = { uvSet: new Set(), pv: 0, signups: 0 }
    }

    for (const ev of events) {
      const key = new Date(ev.createdAt.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10)
      if (buckets[key]) {
        buckets[key].pv++
        if (ev.sessionId) buckets[key].uvSet.add(ev.sessionId)
      }
    }

    for (const su of signups) {
      const key = new Date(su.createdAt.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10)
      if (buckets[key]) buckets[key].signups++
    }

    return Object.entries(buckets)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, { uvSet, pv, signups }]) => ({
        date,
        uv: uvSet.size,
        pv,
        signups,
      }))
  },
  ['admin-daily-trend'],
  { revalidate: 1800 }
)

// ─── 게시판별 7일 활성도 (10분 캐시) ───

export const getBoardActivity = unstable_cache(
  async () => {
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)

    const [postsByBoard, recentComments] = await Promise.all([
      prisma.post.groupBy({
        by: ['boardType'],
        where: { createdAt: { gte: weekAgo }, status: 'PUBLISHED', source: 'USER' },
        _count: { id: true },
      }),
      prisma.comment.findMany({
        where: { createdAt: { gte: weekAgo }, status: 'ACTIVE' },
        select: { post: { select: { boardType: true } } },
      }),
    ])

    const commentsByBoard: Record<string, number> = {}
    for (const c of recentComments) {
      if (c.post?.boardType) {
        commentsByBoard[c.post.boardType] = (commentsByBoard[c.post.boardType] ?? 0) + 1
      }
    }

    const allBoards = new Set<string>([
      ...postsByBoard.map((p) => p.boardType as string),
      ...Object.keys(commentsByBoard),
    ])

    return Array.from(allBoards)
      .map((boardType) => ({
        boardType,
        posts: postsByBoard.find((p) => (p.boardType as string) === boardType)?._count.id ?? 0,
        comments: commentsByBoard[boardType] ?? 0,
        total:
          (postsByBoard.find((p) => (p.boardType as string) === boardType)?._count.id ?? 0) +
          (commentsByBoard[boardType] ?? 0),
      }))
      .filter((b) => b.total > 0)
      .sort((a, b) => b.total - a.total)
  },
  ['admin-board-activity'],
  { revalidate: 600 }
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
