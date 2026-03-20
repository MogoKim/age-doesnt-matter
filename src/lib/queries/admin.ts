import { prisma } from '@/lib/prisma'
import type {
  AdSlot,
  BoardType,
  BannedWordCategory,
  PostSource,
  PostStatus,
  ReportStatus,
  UserStatus,
} from '@/generated/prisma/client'

// ─── 대시보드 KPI ───

export async function getDashboardStats() {
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
    // 오늘 방문자 (lastLoginAt 기준)
    prisma.user.count({
      where: { lastLoginAt: { gte: today } },
    }),
    // 오늘 가입
    prisma.user.count({
      where: { createdAt: { gte: today } },
    }),
    // 오늘 글
    prisma.post.count({
      where: { createdAt: { gte: today }, status: 'PUBLISHED' },
    }),
    // 오늘 댓글
    prisma.comment.count({
      where: { createdAt: { gte: today }, status: 'ACTIVE' },
    }),
    // 미처리 신고
    prisma.report.count({
      where: { status: 'PENDING' },
    }),
    // 봇 검수 대기
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
}

export async function getRecentBotLogs() {
  return prisma.botLog.findMany({
    orderBy: { executedAt: 'desc' },
    take: 10,
    distinct: ['botType'],
  })
}

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
}

export async function getMemberList(options: MemberListOptions = {}) {
  const { status, search, cursor, limit = 20 } = options

  const where = {
    ...(status && { status }),
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

export async function getTotalCounts() {
  const [totalUsers, totalPosts, totalComments] = await Promise.all([
    prisma.user.count({ where: { status: 'ACTIVE' } }),
    prisma.post.count({ where: { status: 'PUBLISHED' } }),
    prisma.comment.count({ where: { status: 'ACTIVE' } }),
  ])
  return { totalUsers, totalPosts, totalComments }
}
