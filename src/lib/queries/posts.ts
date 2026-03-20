import { prisma } from '@/lib/prisma'
import type { BoardType, PromotionLevel } from '@/generated/prisma/client'
import { GRADE_INFO } from '@/lib/grade'
import type { PostSummary, PostDetail, UserSummary, Grade } from '@/types/api'

/* ── 헬퍼 ── */

function toUserSummary(user: {
  id: string
  nickname: string
  grade: string
  profileImage: string | null
}): UserSummary {
  const grade = user.grade as Grade
  return {
    id: user.id,
    nickname: user.nickname,
    grade,
    gradeEmoji: GRADE_INFO[grade]?.emoji ?? '🌱',
    profileImage: user.profileImage,
  }
}

function toPromotionLevel(level: PromotionLevel): PostSummary['promotionLevel'] {
  if (level === 'HALL_OF_FAME') return 'HALL_OF_FAME'
  return level
}

const postSelect = {
  id: true,
  boardType: true,
  category: true,
  title: true,
  summary: true,
  thumbnailUrl: true,
  likeCount: true,
  commentCount: true,
  viewCount: true,
  promotionLevel: true,
  createdAt: true,
  author: {
    select: { id: true, nickname: true, grade: true, profileImage: true },
  },
} as const

function toPostSummary(
  post: {
    id: string
    boardType: BoardType
    category: string | null
    title: string
    summary: string | null
    thumbnailUrl: string | null
    likeCount: number
    commentCount: number
    viewCount: number
    promotionLevel: PromotionLevel
    createdAt: Date
    author: { id: string; nickname: string; grade: string; profileImage: string | null }
  },
): PostSummary {
  return {
    id: post.id,
    boardType: post.boardType,
    category: post.category ?? '',
    title: post.title,
    preview: post.summary ?? '',
    thumbnailUrl: post.thumbnailUrl,
    author: toUserSummary(post.author),
    likeCount: post.likeCount,
    commentCount: post.commentCount,
    viewCount: post.viewCount,
    promotionLevel: toPromotionLevel(post.promotionLevel),
    createdAt: post.createdAt.toISOString(),
  }
}

/* ── 게시판별 목록 ── */

export async function getPostsByBoard(
  boardType: BoardType,
  options?: { category?: string; cursor?: string; limit?: number },
): Promise<{ posts: PostSummary[]; hasMore: boolean }> {
  const limit = options?.limit ?? 20

  const where = {
    boardType,
    status: 'PUBLISHED' as const,
    ...(options?.category && options.category !== '전체' ? { category: options.category } : {}),
    ...(options?.cursor ? { id: { lt: options.cursor } } : {}),
  }

  const rows = await prisma.post.findMany({
    where,
    select: postSelect,
    orderBy: [{ isPinned: 'desc' }, { createdAt: 'desc' }],
    take: limit + 1,
  })

  const hasMore = rows.length > limit
  const posts = rows.slice(0, limit).map(toPostSummary)

  return { posts, hasMore }
}

/* ── 인기 게시글 (Trending) ── */

export async function getTrendingPosts(limit = 5): Promise<PostSummary[]> {
  const rows = await prisma.post.findMany({
    where: {
      status: 'PUBLISHED',
      createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
    },
    select: postSelect,
    orderBy: [{ likeCount: 'desc' }, { commentCount: 'desc' }],
    take: limit,
  })

  return rows.map(toPostSummary)
}

/* ── 에디터스 픽 (HALL_OF_FAME) ── */

export async function getEditorsPicks(limit = 2): Promise<PostSummary[]> {
  const rows = await prisma.post.findMany({
    where: {
      status: 'PUBLISHED',
      promotionLevel: 'HALL_OF_FAME',
    },
    select: postSelect,
    orderBy: { createdAt: 'desc' },
    take: limit,
  })

  return rows.map(toPostSummary)
}

/* ── 최신 커뮤니티 글 ── */

export async function getLatestCommunityPosts(limit = 5): Promise<PostSummary[]> {
  const rows = await prisma.post.findMany({
    where: {
      status: 'PUBLISHED',
      boardType: { in: ['STORY', 'HUMOR', 'WEEKLY'] },
    },
    select: postSelect,
    orderBy: { createdAt: 'desc' },
    take: limit,
  })

  return rows.map(toPostSummary)
}

/* ── 매거진 ── */

export async function getLatestMagazinePosts(limit = 4): Promise<PostSummary[]> {
  const rows = await prisma.post.findMany({
    where: {
      status: 'PUBLISHED',
      boardType: 'MAGAZINE',
    },
    select: postSelect,
    orderBy: { createdAt: 'desc' },
    take: limit,
  })

  return rows.map(toPostSummary)
}

/* ── 일자리 ── */

export async function getLatestJobs(limit = 5) {
  const rows = await prisma.post.findMany({
    where: {
      status: 'PUBLISHED',
      boardType: 'JOB',
    },
    select: {
      ...postSelect,
      jobDetail: {
        select: {
          company: true,
          salary: true,
          location: true,
          region: true,
          quickTags: true,
        },
      },
    },
    orderBy: { createdAt: 'desc' },
    take: limit,
  })

  return rows.map((post) => ({
    id: post.id,
    title: post.title,
    location: post.jobDetail?.location ?? '',
    salary: post.jobDetail?.salary ?? '',
    tags: post.jobDetail?.quickTags ?? [],
    highlight: post.summary ?? '',
    isUrgent: post.promotionLevel === 'HOT',
  }))
}

/* ── 베스트: 실시간 인기글 (공감 10+) ── */

export async function getHotPosts(
  options?: { sort?: 'recent' | 'likes'; cursor?: string; limit?: number },
): Promise<{ posts: PostSummary[]; hasMore: boolean }> {
  const limit = options?.limit ?? 10
  const sort = options?.sort ?? 'recent'

  const rows = await prisma.post.findMany({
    where: {
      status: 'PUBLISHED',
      boardType: { in: ['STORY', 'HUMOR'] as BoardType[] },
      promotionLevel: { in: ['HOT', 'HALL_OF_FAME'] as PromotionLevel[] },
      ...(options?.cursor ? { id: { lt: options.cursor } } : {}),
    },
    select: postSelect,
    orderBy: sort === 'likes'
      ? [{ likeCount: 'desc' }, { createdAt: 'desc' }]
      : [{ createdAt: 'desc' }],
    take: limit + 1,
  })

  const hasMore = rows.length > limit
  return { posts: rows.slice(0, limit).map(toPostSummary), hasMore }
}

/* ── 베스트: 명예의 전당 (공감 50+) ── */

export async function getHallOfFamePosts(
  options?: { cursor?: string; limit?: number },
): Promise<{ posts: PostSummary[]; hasMore: boolean }> {
  const limit = options?.limit ?? 10

  const rows = await prisma.post.findMany({
    where: {
      status: 'PUBLISHED',
      boardType: { in: ['STORY', 'HUMOR'] as BoardType[] },
      promotionLevel: 'HALL_OF_FAME',
      ...(options?.cursor ? { id: { lt: options.cursor } } : {}),
    },
    select: postSelect,
    orderBy: [{ likeCount: 'desc' }, { createdAt: 'desc' }],
    take: limit + 1,
  })

  const hasMore = rows.length > limit
  return { posts: rows.slice(0, limit).map(toPostSummary), hasMore }
}

/* ── 일자리 목록 (필터 지원) ── */

export interface JobListOptions {
  region?: string
  tags?: string[]
  cursor?: string
  limit?: number
}

export interface JobCardItem {
  id: string
  title: string
  company: string
  location: string
  region: string
  salary: string
  workHours: string | null
  workDays: string | null
  tags: string[]
  highlight: string
  isUrgent: boolean
  viewCount: number
  commentCount: number
  createdAt: string
}

export async function getJobList(
  options?: JobListOptions,
): Promise<{ jobs: JobCardItem[]; hasMore: boolean }> {
  const limit = options?.limit ?? 10

  const rows = await prisma.post.findMany({
    where: {
      status: 'PUBLISHED',
      boardType: 'JOB',
      ...(options?.cursor ? { id: { lt: options.cursor } } : {}),
      ...(options?.region
        ? { jobDetail: { region: { contains: options.region, mode: 'insensitive' } } }
        : {}),
      ...(options?.tags && options.tags.length > 0
        ? { jobDetail: { quickTags: { hasSome: options.tags } } }
        : {}),
    },
    select: {
      ...postSelect,
      jobDetail: {
        select: {
          company: true,
          salary: true,
          workHours: true,
          workDays: true,
          location: true,
          region: true,
          quickTags: true,
        },
      },
    },
    orderBy: [{ isPinned: 'desc' }, { createdAt: 'desc' }],
    take: limit + 1,
  })

  const hasMore = rows.length > limit

  const jobs: JobCardItem[] = rows.slice(0, limit).map((post) => ({
    id: post.id,
    title: post.title,
    company: post.jobDetail?.company ?? '',
    location: post.jobDetail?.location ?? '',
    region: post.jobDetail?.region ?? '',
    salary: post.jobDetail?.salary ?? '',
    workHours: post.jobDetail?.workHours ?? null,
    workDays: post.jobDetail?.workDays ?? null,
    tags: post.jobDetail?.quickTags ?? [],
    highlight: post.summary ?? '',
    isUrgent: post.promotionLevel === 'HOT',
    viewCount: post.viewCount,
    commentCount: post.commentCount,
    createdAt: post.createdAt.toISOString(),
  }))

  return { jobs, hasMore }
}

/* ── 일자리 상세 ── */

export interface JobDetailItem {
  id: string
  title: string
  content: string
  company: string
  location: string
  region: string
  salary: string
  workHours: string | null
  workDays: string | null
  tags: string[]
  applyUrl: string | null
  pickPoints: Array<{ point: string; icon: string }>
  viewCount: number
  likeCount: number
  commentCount: number
  isLiked: boolean
  isScrapped: boolean
  createdAt: string
}

export async function getJobDetail(
  postId: string,
  userId?: string,
): Promise<JobDetailItem | null> {
  const post = await prisma.post.findUnique({
    where: { id: postId, status: 'PUBLISHED', boardType: 'JOB' },
    select: {
      id: true,
      title: true,
      content: true,
      viewCount: true,
      likeCount: true,
      commentCount: true,
      createdAt: true,
      jobDetail: {
        select: {
          company: true,
          salary: true,
          workHours: true,
          workDays: true,
          location: true,
          region: true,
          quickTags: true,
          applyUrl: true,
          pickPoints: true,
        },
      },
    },
  })

  if (!post) return null

  // 조회수 증가
  prisma.post.update({
    where: { id: postId },
    data: { viewCount: { increment: 1 } },
  }).catch(() => {})

  let isLiked = false
  let isScrapped = false

  if (userId) {
    const [like, scrap] = await Promise.all([
      prisma.like.findUnique({ where: { userId_postId: { userId, postId } } }),
      prisma.scrap.findUnique({ where: { userId_postId: { userId, postId } } }),
    ])
    isLiked = !!like
    isScrapped = !!scrap
  }

  const pickPoints = Array.isArray(post.jobDetail?.pickPoints)
    ? (post.jobDetail.pickPoints as Array<{ point: string; icon: string }>)
    : []

  return {
    id: post.id,
    title: post.title,
    content: post.content,
    company: post.jobDetail?.company ?? '',
    location: post.jobDetail?.location ?? '',
    region: post.jobDetail?.region ?? '',
    salary: post.jobDetail?.salary ?? '',
    workHours: post.jobDetail?.workHours ?? null,
    workDays: post.jobDetail?.workDays ?? null,
    tags: post.jobDetail?.quickTags ?? [],
    applyUrl: post.jobDetail?.applyUrl ?? null,
    pickPoints,
    viewCount: post.viewCount,
    likeCount: post.likeCount,
    commentCount: post.commentCount,
    isLiked,
    isScrapped,
    createdAt: post.createdAt.toISOString(),
  }
}

/* ── 매거진 목록 (카테고리 필터) ── */

export async function getMagazineList(
  options?: { category?: string; cursor?: string; limit?: number },
): Promise<{ posts: PostSummary[]; hasMore: boolean }> {
  const limit = options?.limit ?? 10

  const where = {
    boardType: 'MAGAZINE' as const,
    status: 'PUBLISHED' as const,
    ...(options?.category && options.category !== '전체' ? { category: options.category } : {}),
    ...(options?.cursor ? { id: { lt: options.cursor } } : {}),
  }

  const rows = await prisma.post.findMany({
    where,
    select: postSelect,
    orderBy: { createdAt: 'desc' },
    take: limit + 1,
  })

  const hasMore = rows.length > limit
  return { posts: rows.slice(0, limit).map(toPostSummary), hasMore }
}

/* ── 게시글 상세 ── */

export async function getPostDetail(
  postId: string,
  userId?: string,
): Promise<PostDetail | null> {
  const post = await prisma.post.findUnique({
    where: { id: postId, status: 'PUBLISHED' },
    select: {
      ...postSelect,
      content: true,
      updatedAt: true,
    },
  })

  if (!post) return null

  // 조회수 증가 (fire-and-forget)
  prisma.post.update({
    where: { id: postId },
    data: { viewCount: { increment: 1 } },
  }).catch(() => {})

  // 좋아요/스크랩 상태 조회
  let isLiked = false
  let isScrapped = false

  if (userId) {
    const [like, scrap] = await Promise.all([
      prisma.like.findUnique({ where: { userId_postId: { userId, postId } } }),
      prisma.scrap.findUnique({ where: { userId_postId: { userId, postId } } }),
    ])
    isLiked = !!like
    isScrapped = !!scrap
  }

  return {
    ...toPostSummary(post),
    content: post.content,
    imageUrls: [],
    youtubeUrl: null,
    isLiked,
    isScrapped,
    updatedAt: post.updatedAt.toISOString(),
  }
}
