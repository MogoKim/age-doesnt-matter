import { prisma } from '@/lib/prisma'
import { unstable_cache } from 'next/cache'
import type {
  AdSlot,
  AdminQueueStatus,
  BoardType,
  BannedWordCategory,
  BotStatus,
  BotType,
  PostSource,
  PostStatus,
  ReportStatus,
  UserStatus,
} from '@/generated/prisma/client'

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

export const getRecentBotLogs = unstable_cache(
  async () => {
    return prisma.botLog.findMany({
      orderBy: { executedAt: 'desc' },
      take: 10,
      distinct: ['botType'],
    })
  },
  ['admin-recent-bot-logs'],
  { revalidate: 300 }
)

// ─── 콘텐츠 관리 ───

export interface ContentListOptions {
  boardType?: BoardType
  status?: PostStatus
  source?: PostSource
  search?: string
  cursor?: string
  limit?: number
}

export async function getContentList(options: ContentListOptions = {}) {
  const { boardType, status, source, search, cursor, limit = 20 } = options

  const where = {
    ...(boardType && { boardType }),
    ...(status && { status }),
    ...(source && { source }),
    ...(search && {
      OR: [
        { title: { contains: search, mode: 'insensitive' as const } },
        { content: { contains: search, mode: 'insensitive' as const } },
        { author: { nickname: { contains: search, mode: 'insensitive' as const } } },
      ],
    }),
    ...(cursor && { createdAt: { lt: new Date(cursor) } }),
  }

  const posts = await prisma.post.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: limit + 1,
    select: {
      id: true,
      boardType: true,
      title: true,
      status: true,
      source: true,
      promotionLevel: true,
      isPinned: true,
      viewCount: true,
      likeCount: true,
      commentCount: true,
      createdAt: true,
      author: {
        select: { id: true, nickname: true },
      },
    },
  })

  const hasMore = posts.length > limit
  if (hasMore) posts.pop()

  return { posts, hasMore }
}

// ─── 콘텐츠 액션 ───

export async function updatePostStatus(postId: string, status: PostStatus) {
  return prisma.post.update({
    where: { id: postId },
    data: { status },
  })
}

export async function togglePostPin(postId: string, isPinned: boolean) {
  return prisma.post.update({
    where: { id: postId },
    data: { isPinned },
  })
}

// ─── 회원 관리 ───

export interface MemberListOptions {
  status?: UserStatus
  search?: string
  cursor?: string
  limit?: number
  botOnly?: boolean
  hideBot?: boolean
}

export async function getMemberList(options: MemberListOptions = {}) {
  const { status, search, cursor, limit = 20, botOnly, hideBot } = options

  const where = {
    ...(status && { status }),
    ...(botOnly && { email: { endsWith: '@unao.bot' } }),
    ...(hideBot && { NOT: { email: { endsWith: '@unao.bot' } } }),
    ...(search && {
      OR: [
        { nickname: { contains: search, mode: 'insensitive' as const } },
        { email: { contains: search, mode: 'insensitive' as const } },
      ],
    }),
    ...(cursor && { createdAt: { lt: new Date(cursor) } }),
  }

  const users = await prisma.user.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: limit + 1,
    select: {
      id: true,
      nickname: true,
      email: true,
      grade: true,
      status: true,
      isOnboarded: true,
      postCount: true,
      commentCount: true,
      receivedLikes: true,
      lastLoginAt: true,
      createdAt: true,
    },
  })

  const hasMore = users.length > limit
  if (hasMore) users.pop()

  return { users, hasMore }
}

export async function getMemberDetail(userId: string) {
  return prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      nickname: true,
      email: true,
      profileImage: true,
      grade: true,
      status: true,
      birthYear: true,
      gender: true,
      regions: true,
      interests: true,
      postCount: true,
      commentCount: true,
      receivedLikes: true,
      suspendedUntil: true,
      lastLoginAt: true,
      createdAt: true,
    },
  })
}

// ─── 신고 관리 ───

export interface ReportListOptions {
  status?: ReportStatus
  cursor?: string
  limit?: number
}

export async function getReportList(options: ReportListOptions = {}) {
  const { status, cursor, limit = 20 } = options

  const where = {
    ...(status ? { status } : { status: 'PENDING' as const }),
    ...(cursor && { createdAt: { lt: new Date(cursor) } }),
  }

  const reports = await prisma.report.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: limit + 1,
    select: {
      id: true,
      reason: true,
      description: true,
      status: true,
      action: true,
      createdAt: true,
      processedAt: true,
      reporter: {
        select: { id: true, nickname: true },
      },
      post: {
        select: { id: true, title: true, boardType: true },
      },
      comment: {
        select: { id: true, content: true },
      },
      processor: {
        select: { nickname: true },
      },
    },
  })

  const hasMore = reports.length > limit
  if (hasMore) reports.pop()

  return { reports, hasMore }
}

// ─── 히어로 배너 ───

export async function getBannerList() {
  return prisma.banner.findMany({
    orderBy: [{ priority: 'asc' }, { createdAt: 'desc' }],
  })
}

export async function getBannerById(id: string) {
  return prisma.banner.findUnique({ where: { id } })
}

// ─── 광고 배너 ───

export interface AdBannerListOptions {
  slot?: AdSlot
  cursor?: string
  limit?: number
}

export async function getAdBannerList(options: AdBannerListOptions = {}) {
  const { slot, cursor, limit = 20 } = options

  const where = {
    ...(slot && { slot }),
    ...(cursor && { createdAt: { lt: new Date(cursor) } }),
  }

  const ads = await prisma.adBanner.findMany({
    where,
    orderBy: [{ slot: 'asc' }, { priority: 'asc' }, { createdAt: 'desc' }],
    take: limit + 1,
  })

  const hasMore = ads.length > limit
  if (hasMore) ads.pop()

  return { ads, hasMore }
}

// ─── 금지어 ───

export interface BannedWordListOptions {
  category?: BannedWordCategory
  search?: string
  cursor?: string
  limit?: number
}

export async function getBannedWordList(options: BannedWordListOptions = {}) {
  const { category, search, cursor, limit = 30 } = options

  const where = {
    ...(category && { category }),
    ...(search && { word: { contains: search, mode: 'insensitive' as const } }),
    ...(cursor && { createdAt: { lt: new Date(cursor) } }),
  }

  const words = await prisma.bannedWord.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: limit + 1,
  })

  const hasMore = words.length > limit
  if (hasMore) words.pop()

  return { words, hasMore }
}

// ─── 게시판 설정 ───

export async function getBoardConfigList() {
  return prisma.boardConfig.findMany({
    orderBy: { createdAt: 'asc' },
  })
}

export async function getBoardConfigById(id: string) {
  return prisma.boardConfig.findUnique({ where: { id } })
}

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

// ─── AdminQueue ───

export async function getAdminQueue(status?: AdminQueueStatus) {
  return prisma.adminQueue.findMany({
    where: status ? { status } : undefined,
    orderBy: { createdAt: 'desc' },
    take: 50,
  })
}

export async function getAdminQueueCounts() {
  const [pending, approved, rejected, expired] = await Promise.all([
    prisma.adminQueue.count({ where: { status: 'PENDING' } }),
    prisma.adminQueue.count({ where: { status: 'APPROVED' } }),
    prisma.adminQueue.count({ where: { status: 'REJECTED' } }),
    prisma.adminQueue.count({ where: { status: 'EXPIRED' } }),
  ])
  return { pending, approved, rejected, expired }
}

// ─── DailyBrief ───

export async function getDailyBrief(date?: Date) {
  const target = date ?? new Date()
  target.setHours(0, 0, 0, 0)
  return prisma.dailyBrief.findFirst({
    where: { date: { gte: target, lt: new Date(target.getTime() + 86400000) } },
    orderBy: { createdAt: 'desc' },
  })
}

export async function getDailyBriefs(days = 7) {
  const since = new Date()
  since.setDate(since.getDate() - days)
  since.setHours(0, 0, 0, 0)
  return prisma.dailyBrief.findMany({
    where: { date: { gte: since } },
    orderBy: { date: 'desc' },
  })
}

// ─── BotLog 상세 ───

export interface BotLogFilterOptions {
  botType?: BotType
  status?: BotStatus
  since?: Date
  limit?: number
  cursor?: string
}

export async function getBotLogsDetail(options: BotLogFilterOptions = {}) {
  const { botType, status, since, limit = 50, cursor } = options
  const logs = await prisma.botLog.findMany({
    where: {
      ...(botType && { botType }),
      ...(status && { status }),
      ...(since && { executedAt: { gte: since } }),
      ...(cursor && { executedAt: { lt: new Date(cursor) } }),
    },
    orderBy: { executedAt: 'desc' },
    take: limit + 1,
  })
  const hasMore = logs.length > limit
  if (hasMore) logs.pop()
  return { logs, hasMore }
}

export async function getBotLogStats() {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const [todayCount, successCount, failedCount, totalTimeResult] = await Promise.all([
    prisma.botLog.count({ where: { executedAt: { gte: today } } }),
    prisma.botLog.count({ where: { executedAt: { gte: today }, status: 'SUCCESS' } }),
    prisma.botLog.count({ where: { executedAt: { gte: today }, status: 'FAILED' } }),
    prisma.botLog.aggregate({ _avg: { executionTimeMs: true }, where: { executedAt: { gte: today } } }),
  ])
  return {
    todayCount,
    successCount,
    failedCount,
    avgExecutionMs: Math.round(totalTimeResult._avg.executionTimeMs ?? 0),
  }
}

// ─── SocialExperiment ───

export async function getSocialExperiments(limit = 10) {
  return prisma.socialExperiment.findMany({
    orderBy: { weekNumber: 'desc' },
    take: limit,
  })
}

// ─── 자동화 상태 조회 ───

export async function getAutomationStatus(): Promise<boolean> {
  const latest = await prisma.adminAuditLog.findFirst({
    where: { action: 'AUTOMATION_TOGGLE' },
    orderBy: { createdAt: 'desc' },
  })
  if (!latest || !latest.after) return true
  const after = latest.after as { active?: boolean }
  return after.active !== false
}

// ─── 감사 로그 ───

export async function getAuditLogs(filters: {
  action?: string
  search?: string
  cursor?: string
}) {
  const where: Record<string, unknown> = {}
  if (filters.action) where.action = filters.action
  if (filters.search) {
    where.OR = [
      { targetId: { contains: filters.search, mode: 'insensitive' } },
      { action: { contains: filters.search, mode: 'insensitive' } },
    ]
  }

  const logs = await prisma.adminAuditLog.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: 30,
    ...(filters.cursor
      ? { cursor: { id: filters.cursor }, skip: 1 }
      : {}),
    include: {
      admin: { select: { nickname: true, email: true } },
    },
  })

  return {
    logs,
    hasMore: logs.length === 30,
  }
}
