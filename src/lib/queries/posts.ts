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
