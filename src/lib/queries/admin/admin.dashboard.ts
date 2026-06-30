import { prisma } from '@/lib/prisma'
import { unstable_cache } from 'next/cache'
import { getInternalSessionIds, getAdminUserIds } from './internal-sessions'
import { isPcDirectBotSession, ACTIVITY_EVENTS } from './pc-direct-filter'

// 실고객 = providerId 순수 숫자(진짜 카카오 가입자). seed_/bot-/curator-/@unao.bot 봇 전부 제외.
// 봇 판별 단일 기준 — 대시보드 전 지표 통일(트렌드·OKR·카드).
const isReal = (pid?: string | null): boolean => !!pid && /^\d+$/.test(pid)
const beOf = (props: unknown): string => {
  const v = (props as Record<string, unknown> | null)?.browser_env
  return typeof v === 'string' ? v : ''
}

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

const DAY_MS = 86400000
const kstDayIdx = (t: number) => Math.floor((t + 9 * 3600000) / DAY_MS)

export interface RetentionPoint { denom: number; returned: number; rate: number | null }
export interface GuestRetention { d1: RetentionPoint; d3: RetentionPoint; d7: RetentionPoint; d14: RetentionPoint; d30: RetentionPoint }

// EventLog 비회원(userId=null) D-N 재방문율 — 공식 리텐션(GA4 대체).
// 코호트 = sessionId 첫 page_view일(KST). 분모 = N일 경과한(성숙) 코호트만 — 아직 N일 안 지난 코호트는
// '실패'로 세지 않고 분모에서 제외. 분자 = 첫방문+N일 이후 재방문 존재. 내부 세션(/admin·founder) 제외.
async function computeGuestRetention(now: number, windowDays = 60): Promise<GuestRetention> {
  const nowIdx = kstDayIdx(now)
  const since = new Date(now - windowDays * DAY_MS)
  const internalSids = await getInternalSessionIds(since)
  const events = await prisma.eventLog.findMany({
    where: { eventName: 'page_view', isBot: false, userId: null, sessionId: { not: null }, createdAt: { gte: since } },
    select: { sessionId: true, createdAt: true },
    orderBy: { createdAt: 'asc' },
  })
  const active = new Map<string, Set<number>>()
  for (const e of events) {
    const sid = e.sessionId!
    if (internalSids.has(sid)) continue
    let s = active.get(sid)
    if (!s) { s = new Set(); active.set(sid, s) }
    s.add(kstDayIdx(e.createdAt.getTime()))
  }
  const offs = [1, 3, 7, 14, 30] as const
  const denom: Record<number, number> = { 1: 0, 3: 0, 7: 0, 14: 0, 30: 0 }
  const ret: Record<number, number> = { 1: 0, 3: 0, 7: 0, 14: 0, 30: 0 }
  for (const days of active.values()) {
    let firstDay = Infinity
    for (const d of days) if (d < firstDay) firstDay = d
    for (const off of offs) {
      if (firstDay + off > nowIdx) continue // 미성숙 코호트 → 분모 제외(실패 아님)
      denom[off]++
      for (const d of days) { if (d >= firstDay + off) { ret[off]++; break } }
    }
  }
  const pt = (off: number): RetentionPoint => ({
    denom: denom[off],
    returned: ret[off],
    rate: denom[off] > 0 ? Math.round((ret[off] / denom[off]) * 1000) / 10 : null,
  })
  return { d1: pt(1), d3: pt(3), d7: pt(7), d14: pt(14), d30: pt(30) }
}

// ─── 오늘 핵심 KPI (5분 캐시) ───

export const getDashboardStats = unstable_cache(
  async () => {
    const today = getKstTodayStart()

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
      // 오늘 page_view 전부(isBot=false). 회원/비회원/봇/PC직접봇 분리는 아래 JS에서.
      prisma.eventLog.findMany({
        where: { eventName: 'page_view', isBot: false, createdAt: { gte: today } },
        select: { sessionId: true, userId: true, referrer: true, properties: true },
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

    // 창업자/어드민 트래픽 제외 — 내부 세션(/admin·founder플래그) + role=ADMIN 회원
    // + 오늘 활동(login/가입/댓글 등) 있는 세션id(B룰 면제용)
    const [internalSids, adminIds, activeRows] = await Promise.all([
      getInternalSessionIds(today),
      getAdminUserIds(),
      prisma.eventLog.findMany({
        where: { eventName: { in: [...ACTIVITY_EVENTS] }, isBot: false, sessionId: { not: null }, createdAt: { gte: today } },
        select: { sessionId: true },
        distinct: ['sessionId'],
      }),
    ])
    const activeSids = new Set(activeRows.map((r) => r.sessionId).filter((s): s is string => !!s))
    const rows = pvRows.filter((r) => !(r.sessionId && internalSids.has(r.sessionId)))

    // UV/PV 회원·비회원·봇 분리 (등장 userId의 실고객 여부 조회)
    const uids = [...new Set(rows.filter((r) => r.userId).map((r) => r.userId!))]
    const userRows = uids.length
      ? await prisma.user.findMany({ where: { id: { in: uids } }, select: { id: true, providerId: true } })
      : []
    const realUserSet = new Set(userRows.filter((u) => isReal(u.providerId) && !adminIds.has(u.id)).map((u) => u.id))

    const memberSessions = new Set<string>() // 실고객 userId 가진 세션
    const botSessions = new Set<string>() // 비실고객 userId(seed 등) = 봇 → 제외
    const sMeta = new Map<string, { pv: number; firstRef: string; be: string }>() // 세션별 메타(B룰용)
    let memberPv = 0
    let guestPvAll = 0
    for (const r of rows) {
      const sid = r.sessionId
      if (sid && !sMeta.has(sid)) sMeta.set(sid, { pv: 0, firstRef: typeof r.referrer === 'string' ? r.referrer : '', be: beOf(r.properties) })
      if (sid) sMeta.get(sid)!.pv++
      if (r.userId && realUserSet.has(r.userId)) {
        memberPv++
        if (sid) memberSessions.add(sid)
      } else if (r.userId) {
        if (sid) botSessions.add(sid)
      } else {
        guestPvAll++ // userId null = 진짜 익명(비회원)
      }
    }
    // 비회원(게스트) 세션 — PC직접 봇(B룰: desktop·무referrer·1PV·비회원·무활동) 집계 제외
    const guestSessions = new Set<string>()
    let pcDirectBotPv = 0
    let pcDirectExcluded = 0
    for (const r of rows) {
      const sid = r.sessionId
      if (!sid || memberSessions.has(sid) || botSessions.has(sid) || guestSessions.has(sid)) continue
      const m = sMeta.get(sid)!
      if (isPcDirectBotSession({ browserEnv: m.be, firstReferrer: m.firstRef, pv: m.pv, hasUserId: false, hasActivity: activeSids.has(sid) })) {
        pcDirectExcluded++
        pcDirectBotPv += m.pv
        continue
      }
      guestSessions.add(sid)
    }
    const guestPv = guestPvAll - pcDirectBotPv
    const memberUv = memberSessions.size
    const guestUv = guestSessions.size
    const todayUniqueVisitors = memberUv + guestUv // 봇·PC직접봇 세션 제외 합
    const todayPV = memberPv + guestPv // 봇·PC직접봇 PV 제외 합

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
      pcDirectExcluded, // PC직접 봇(B룰) 집계 제외 세션 수(오늘)
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
  ['admin-dashboard-stats-v4'],
  { revalidate: 300 }
)

// ─── 월간 OKR 지표 (10분 캐시) ───

export const getMonthlyOkrStats = unstable_cache(
  async () => {
    const monthStart = getKstMonthStart()

    // 창업자/어드민 내부 세션 제외 (KR1·KR2)
    const internalSids = await getInternalSessionIds(monthStart)
    const internalArr = [...internalSids]

    // KR1: 월 UV (내부 세션 제외)
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
    const monthlyUv = monthlyUvRows.filter((r) => r.sessionId && !internalSids.has(r.sessionId)).length

    // KR2: 월 PV (내부 세션 제외 — null sessionId PV는 보존)
    const monthlyPv = await prisma.eventLog.count({
      where: {
        eventName: 'page_view',
        isBot: false,
        createdAt: { gte: monthStart },
        ...(internalArr.length
          ? { OR: [{ sessionId: null }, { sessionId: { notIn: internalArr } }] }
          : {}),
      },
    })
    const avgPvPerUv =
      monthlyUv > 0 ? Math.round((monthlyPv / monthlyUv) * 10) / 10 : 0

    // KR3: 월 신규가입(실고객 providerId ^\d+$) / UV — 카드 신규가입과 봇 기준 통일
    const monthNewUsers = await prisma.user.findMany({
      where: { createdAt: { gte: monthStart } },
      select: { providerId: true },
    })
    const monthlySignups = monthNewUsers.filter((u) => isReal(u.providerId)).length
    const conversionRate =
      monthlyUv > 0
        ? Math.round((monthlySignups / monthlyUv) * 1000) / 10
        : 0

    // KR4(공식): EventLog 비회원 D7 재방문율 — 성숙 코호트만 분모.
    // GA4/CDO cohort는 수집 중단(stale)이라 공식 지표에서 제외 → 아래 legacy 값으로만 참고 노출.
    const guestRetention = await computeGuestRetention(Date.now())
    const d7RetentionPct = guestRetention.d7.rate
    const d1RetentionPct = guestRetention.d1.rate

    // (legacy/stale) GA4 CDO Cohort D7 — 공식 지표 아님. 마지막 수집 시각과 함께 참고용으로만 보존.
    const latestCdoLog = await prisma.botLog.findFirst({
      where: { botType: 'CDO', action: 'KPI_DAILY', status: 'SUCCESS' },
      orderBy: { createdAt: 'desc' },
      select: { details: true, createdAt: true },
    })
    let ga4D7RetentionPctLegacy: number | null = null
    let ga4LastCollectedAt: string | null = null
    if (latestCdoLog) {
      ga4LastCollectedAt = latestCdoLog.createdAt.toISOString()
      try {
        const kpi = JSON.parse(latestCdoLog.details as string) as {
          cohortRetention?: { d7RetentionRate?: number }
        }
        if (kpi.cohortRetention?.d7RetentionRate !== undefined) {
          ga4D7RetentionPctLegacy = Math.round(kpi.cohortRetention.d7RetentionRate * 100)
        }
      } catch { /* ignore */ }
    }

    return {
      monthlyUv,
      monthlyPv,
      avgPvPerUv,
      monthlySignups,
      conversionRate,
      // 공식 리텐션 = EventLog 비회원
      retentionSource: 'eventlog' as const,
      d1RetentionPct,
      d7RetentionPct,
      guestRetention,
      // legacy 참고(수집중단)
      ga4D7RetentionPctLegacy,
      ga4LastCollectedAt,
    }
  },
  ['admin-monthly-okr-stats-v3'], // v3: KR4 = EventLog 비회원 D7(성숙 코호트)로 교체, GA4는 legacy
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
        where: { createdAt: { gte: startDate } },
        select: { createdAt: true, providerId: true }, // providerId로 실고객 필터(인사이트 7일신규와 봇 기준 통일)
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
      if (!isReal(su.providerId)) continue // 실고객만(봇 제외)
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
  ['admin-daily-trend-v2'],
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
