import { cache } from 'react'
import { prisma } from '@/lib/prisma'
import type { BoardType, PromotionLevel } from '@/generated/prisma/client'
import { GRADE_INFO } from '@/lib/grade'
import type { PostSummary, PostDetail, UserSummary, Grade } from '@/types/api'

/* ── 헬퍼 ── */

const DELETED_USER: UserSummary = {
  id: '',
  nickname: '탈퇴한 회원',
  grade: 'SEED' as Grade,
  gradeEmoji: '🌱',
  profileImage: null,
}

function toUserSummary(user: {
  id: string
  nickname: string
  grade: string
  profileImage: string | null
} | null): UserSummary {
  if (!user) return DELETED_USER
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
  isPinned: true,
  likeCount: true,
  commentCount: true,
  viewCount: true,
  promotionLevel: true,
  createdAt: true,
  slug: true,
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
    isPinned?: boolean
    likeCount: number
    commentCount: number
    viewCount: number
    promotionLevel: PromotionLevel
    createdAt: Date
    slug?: string | null
    author: { id: string; nickname: string; grade: string; profileImage: string | null } | null
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
    isPinned: post.isPinned ?? false,
    createdAt: post.createdAt.toISOString(),
    slug: post.slug ?? null,
  }
}

/* ── 게시판별 목록 ── */

export async function getPostsByBoard(
  boardType: BoardType,
  options?: { category?: string; cursor?: string; limit?: number; sort?: 'latest' | 'likes' },
): Promise<{ posts: PostSummary[]; hasMore: boolean }> {
  const limit = options?.limit ?? 20
  const sort = options?.sort ?? 'latest'

  const where = {
    boardType,
    status: 'PUBLISHED' as const,
    ...(options?.category && options.category !== '전체' ? { category: options.category } : {}),
    ...(options?.cursor ? { id: { lt: options.cursor } } : {}),
  }

  const orderBy = sort === 'likes'
    ? [{ isPinned: 'desc' as const }, { likeCount: 'desc' as const }, { createdAt: 'desc' as const }]
    : [{ isPinned: 'desc' as const }, { createdAt: 'desc' as const }]

  const rows = await prisma.post.findMany({
    where,
    select: postSelect,
    orderBy,
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
      createdAt: { gte: new Date(Date.now() - 48 * 60 * 60 * 1000) },
    },
    select: postSelect,
    orderBy: [{ trendingScore: 'desc' }, { createdAt: 'desc' }],
    take: limit,
  })

  return rows.map(toPostSummary)
}

/* ── 일간 인기글 (Trending) ── */

export async function getDailyTrendingPosts(limit = 10): Promise<PostSummary[]> {
  const rows = await prisma.post.findMany({
    where: {
      status: 'PUBLISHED',
      createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
    },
    select: postSelect,
    orderBy: [{ trendingScore: 'desc' }],
    take: limit,
  })
  return rows.map(toPostSummary)
}

/* ── 주간 인기글 (Trending) ── */

export async function getWeeklyTrendingPosts(limit = 10): Promise<PostSummary[]> {
  const rows = await prisma.post.findMany({
    where: {
      status: 'PUBLISHED',
      createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
    },
    select: postSelect,
    orderBy: [{ trendingScore: 'desc' }],
    take: limit,
  })
  return rows.map(toPostSummary)
}

/* ── 에디터스 픽 (HALL_OF_FAME) ── */

export async function getEditorsPicks(limit = 2): Promise<PostSummary[]> {
  let rows = await prisma.post.findMany({
    where: {
      status: 'PUBLISHED',
      promotionLevel: 'HALL_OF_FAME',
    },
    select: postSelect,
    orderBy: { createdAt: 'desc' },
    take: limit,
  })

  // HALL_OF_FAME 부족 시 HOT 글로 채우기
  if (rows.length < limit) {
    const hotFill = await prisma.post.findMany({
      where: {
        status: 'PUBLISHED',
        promotionLevel: 'HOT',
        id: { notIn: rows.map((r) => r.id) },
      },
      select: postSelect,
      orderBy: { likeCount: 'desc' },
      take: limit - rows.length,
    })
    rows = [...rows, ...hotFill]
  }

  return rows.map(toPostSummary)
}

/* ── 최신 커뮤니티 글 ── */

export async function getLatestCommunityPosts(limit = 5): Promise<PostSummary[]> {
  const rows = await prisma.post.findMany({
    where: {
      status: 'PUBLISHED',
      boardType: { in: ['STORY', 'HUMOR', 'LIFE2'] },
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
      boardType: { in: ['STORY', 'HUMOR', 'LIFE2'] as BoardType[] },
      OR: [
        { promotionLevel: 'HALL_OF_FAME' as PromotionLevel },
        { promotionLevel: 'HOT' as PromotionLevel, createdAt: { gte: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000) } },
      ],
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
      boardType: { in: ['STORY', 'HUMOR', 'LIFE2'] as BoardType[] },
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

export const getJobDetail = cache(async function getJobDetail(
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
})

/* ── 2막 준비 최신글 ── */

export async function getLatestLife2Posts(limit = 5): Promise<PostSummary[]> {
  const rows = await prisma.post.findMany({
    where: {
      status: 'PUBLISHED',
      boardType: 'LIFE2',
    },
    select: postSelect,
    orderBy: { createdAt: 'desc' },
    take: limit,
  })
  return rows.map(toPostSummary)
}

/* ── 매거진 목록 (카테고리 필터) ── */

export async function getMagazineList(
  options?: { category?: string; cursor?: string; limit?: number },
): Promise<{ posts: PostSummary[]; hasMore: boolean }> {
  const limit = options?.limit ?? 10

  const where = {
    boardType: 'MAGAZINE' as const,
    status: 'PUBLISHED' as const,
    NOT: { content: '' },
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

/* ── 최근 활동 피드 (홈페이지용) ── */

export interface RecentActivity {
  type: 'comment' | 'like' | 'post'
  nickname: string
  postTitle: string
  postId: string
  boardType: string
  timeAgo: string
}

export async function getRecentActivities(limit = 8): Promise<RecentActivity[]> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000)

  // 최근 댓글, 좋아요, 글을 병렬 조회
  const [recentComments, recentLikes, recentPosts] = await Promise.all([
    prisma.comment.findMany({
      where: { createdAt: { gte: since }, status: 'ACTIVE' },
      select: {
        createdAt: true,
        author: { select: { nickname: true } },
        post: { select: { id: true, title: true, boardType: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    }),
    prisma.like.findMany({
      where: { createdAt: { gte: since }, postId: { not: null } },
      select: {
        createdAt: true,
        user: { select: { nickname: true } },
        post: { select: { id: true, title: true, boardType: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    }),
    prisma.post.findMany({
      where: {
        createdAt: { gte: since },
        status: 'PUBLISHED',
        boardType: { in: ['STORY', 'HUMOR', 'LIFE2'] },
      },
      select: {
        id: true,
        title: true,
        boardType: true,
        createdAt: true,
        author: { select: { nickname: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    }),
  ])

  const activities: Array<RecentActivity & { _sortTime: Date }> = []

  for (const c of recentComments) {
    if (!c.post) continue
    activities.push({
      type: 'comment',
      nickname: c.author.nickname,
      postTitle: c.post.title,
      postId: c.post.id,
      boardType: c.post.boardType,
      timeAgo: '',
      _sortTime: c.createdAt,
    })
  }

  for (const l of recentLikes) {
    if (!l.post) continue
    activities.push({
      type: 'like',
      nickname: l.user.nickname,
      postTitle: l.post.title,
      postId: l.post.id,
      boardType: l.post.boardType,
      timeAgo: '',
      _sortTime: l.createdAt,
    })
  }

  for (const p of recentPosts) {
    activities.push({
      type: 'post',
      nickname: p.author?.nickname ?? '알 수 없음',
      postTitle: p.title,
      postId: p.id,
      boardType: p.boardType,
      timeAgo: '',
      _sortTime: p.createdAt,
    })
  }

  // 시간순 정렬 후 상위 N개
  activities.sort((a, b) => b._sortTime.getTime() - a._sortTime.getTime())

  const now = Date.now()
  return activities.slice(0, limit).map(({ _sortTime, ...rest }) => ({
    ...rest,
    timeAgo: formatTimeAgoFromMs(now - _sortTime.getTime()),
  }))
}

function formatTimeAgoFromMs(ms: number): string {
  const minutes = Math.floor(ms / 60000)
  if (minutes < 1) return '방금 전'
  if (minutes < 60) return `${minutes}분 전`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}시간 전`
  return `${Math.floor(hours / 24)}일 전`
}

/* ── 게시글 상세 ── */

export const getPostDetail = cache(async function getPostDetail(
  postId: string,
  userId?: string,
): Promise<PostDetail | null> {
  // CUID로 먼저 조회, 없으면 slug로 재조회
  let post = await prisma.post.findUnique({
    where: { id: postId, status: { in: ['PUBLISHED', 'SEO_ONLY'] } },
    select: {
      ...postSelect,
      content: true,
      updatedAt: true,
      slug: true,
    },
  })

  if (!post) {
    post = await prisma.post.findUnique({
      where: { slug: postId, status: { in: ['PUBLISHED', 'SEO_ONLY'] } },
      select: {
        ...postSelect,
        content: true,
        updatedAt: true,
        slug: true,
      },
    })
  }

  if (!post) return null

  // slug로 조회됐을 수 있으므로 실제 DB id 사용
  const resolvedPostId = post.id

  // 조회수 증가 (fire-and-forget)
  prisma.post.update({
    where: { id: resolvedPostId },
    data: { viewCount: { increment: 1 } },
  }).catch(() => {})

  // 좋아요/스크랩 상태 조회
  let isLiked = false
  let isScrapped = false

  if (userId) {
    const [like, scrap] = await Promise.all([
      prisma.like.findUnique({ where: { userId_postId: { userId, postId: resolvedPostId } } }),
      prisma.scrap.findUnique({ where: { userId_postId: { userId, postId: resolvedPostId } } }),
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
    slug: post.slug ?? null,
  }
})

// ── 관심사 기반 추천글 (온보딩 완료 후 표시) ──

const INTEREST_TO_BOARD: Record<string, BoardType[]> = {
  health:   ['STORY', 'MAGAZINE'],
  exercise: ['STORY', 'HUMOR'],
  travel:   ['STORY', 'HUMOR'],
  cooking:  ['STORY', 'HUMOR'],
  family:   ['STORY'],
  money:    ['MAGAZINE', 'LIFE2'],
  life2:    ['LIFE2'],
  hobby:    ['STORY', 'HUMOR'],
  job:      ['JOB', 'LIFE2'],
}

export interface RecommendedPost {
  id: string
  title: string
  boardType: string
  likeCount: number
  commentCount: number
  authorNickname: string
}

export async function getInterestBasedPosts(
  interests: string[],
  limit = 3,
): Promise<RecommendedPost[]> {
  const boardTypes = [
    ...new Set(interests.flatMap((i) => INTEREST_TO_BOARD[i] ?? [])),
  ] as BoardType[]

  const where = {
    status: 'PUBLISHED' as const,
    ...(boardTypes.length > 0 && { boardType: { in: boardTypes } }),
  }

  const posts = await prisma.post.findMany({
    where,
    select: {
      id: true,
      title: true,
      boardType: true,
      likeCount: true,
      commentCount: true,
      author: { select: { nickname: true } },
    },
    orderBy: { likeCount: 'desc' },
    take: limit,
  })

  return posts.map((p) => ({
    id: p.id,
    title: p.title,
    boardType: p.boardType,
    likeCount: p.likeCount,
    commentCount: p.commentCount,
    authorNickname: p.author?.nickname ?? '탈퇴한 회원',
  }))
}
