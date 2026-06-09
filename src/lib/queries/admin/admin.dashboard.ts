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

    // 실고객 = providerId 순수 숫자(진짜 카카오 가입자). seed_/bot-/curator-/@unao.bot 봇 전부 제외.
    const isReal = (pid?: string | null) => !!pid && /^\d+$/.test(pid)

    const [
      pvRows,
      todayLogins,
      newUsers,
      todayUserPosts,
      todayCmts,
      pendingReports,
      pendingBotReviews,
      pushSubCount,
    ] = await Promise.all([
      // 오늘 page_view 전부(isBot=false). 회원/비회원/봇 분리는 아래 JS에서.
      prisma.eventLog.findMany({
        where: { eventName: 'page_view', isBot: false, createdAt: { gte: today } },
        select: { sessionId: true, userId: true },
      }),
      prisma.user.count({
        where: {
          lastLoginAt: { gte: today },
          NOT: { email: { endsWith: '@unao.bot' } },
        },
      }),
      // 신규가입 — 실고객 판별 위해 providerId 가져와 JS 필터
      prisma.user.findMany({
        where: { createdAt: { gte: today } },
        select: { providerId: true },
      }),
      // 사용자 글만 (BOT/ADMIN 제외)
      prisma.post.count({
        where: { createdAt: { gte: today }, status: 'PUBLISHED', source: 'USER' },
      }),
      // 댓글 — author.providerId로 실회원 판별(Comment에 source 없음). 봇·게스트 제외
      prisma.comment.findMany({
        where: { createdAt: { gte: today }, status: 'ACTIVE' },
        select: { author: { select: { providerId: true } } },
      }),
      prisma.report.count({
        where: { status: 'PENDING' },
      }),
      prisma.botLog.count({
        where: { reviewPendingCount: { gt: 0 } },
      }),
      prisma.pushSubscription.count(),
    ])

    // UV/PV 회원·비회원·봇 분리 (등장 userId의 실고객 여부 조회)
    const uids = [...new Set(pvRows.filter((r) => r.userId).map((r) => r.userId!))]
    const userRows = uids.length
      ? await prisma.user.findMany({ where: { id: { in: uids } }, select: { id: true, providerId: true } })
      : []
    const realUserSet = new Set(userRows.filter((u) => isReal(u.providerId)).map((u) => u.id))

    const memberSessions = new Set<string>() // 실고객 userId 가진 세션
    const botSessions = new Set<string>() // 비실고객 userId(seed 등) = 봇 → 제외
    let memberPv = 0
    let guestPv = 0
    for (const r of pvRows) {
      if (r.userId && realUserSet.has(r.userId)) {
        memberPv++
        if (r.sessionId) memberSessions.add(r.sessionId)
      } else if (r.userId) {
        if (r.sessionId) botSessions.add(r.sessionId)
      } else {
        guestPv++ // userId null = 진짜 익명(비회원)
      }
    }
    const guestSessions = new Set<string>()
    for (const r of pvRows) {
      if (r.sessionId && !memberSessions.has(r.sessionId) && !botSessions.has(r.sessionId)) guestSessions.add(r.sessionId)
    }
    const memberUv = memberSessions.size
    const guestUv = guestSessions.size
    const todayUniqueVisitors = memberUv + guestUv // 봇 세션 제외 합
    const todayPV = memberPv + guestPv // 봇 PV 제외 합

    const todaySignups = newUsers.filter((u) => isReal(u.providerId)).length
    const todayComments = todayCmts.filter((c) => isReal(c.author?.providerId)).length

    const todayConversionRate =
      todayUniqueVisitors > 0
        ? Math.round((todaySignups / todayUniqueVisitors) * 1000) / 10
        : null

    return {
      todayUniqueVisitors,
      memberUv,
      guestUv,
      todayPV,
      memberPv,
      guestPv,
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
  ['admin-dashboard-stats-v3'],
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
    // totalUsers: 봇 제외(@unao.bot 이메일 + seed_ providerId)로 실유저만 카운트.
    // kpi-collector.ts·slack-commands.ts와 동일 기준 (Prisma는 정규식 where 미지원 → ^\d+$ 대신 prefix 제외).
    // ※ totalPosts/totalComments는 발행 콘텐츠 총량이므로 봇 포함이 의도된 값.
    const [totalUsers, totalPosts, totalComments] = await Promise.all([
      prisma.user.count({
        where: {
          status: 'ACTIVE',
          AND: [
            { NOT: { email: { endsWith: '@unao.bot' } } },
            { NOT: { providerId: { startsWith: 'seed_' } } },
          ],
        },
      }),
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
