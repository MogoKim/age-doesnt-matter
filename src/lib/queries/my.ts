import { prisma } from '@/lib/prisma'
import { GRADE_INFO } from '@/lib/grade'
import type { PostSummary, UserSummary, Grade } from '@/types/api'
import type { PromotionLevel, BoardType } from '@/generated/prisma/client'

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

function toPostSummary(post: {
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
}): PostSummary {
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
    promotionLevel: post.promotionLevel === 'HALL_OF_FAME' ? 'HALL_OF_FAME' : post.promotionLevel,
    createdAt: post.createdAt.toISOString(),
  }
}

/** 내 프로필 정보 */
export async function getMyProfile(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      nickname: true,
      grade: true,
      profileImage: true,
      postCount: true,
      commentCount: true,
      receivedLikes: true,
      createdAt: true,
    },
  })

  if (!user) return null

  const grade = user.grade as Grade
  return {
    ...toUserSummary(user),
    postCount: user.postCount,
    commentCount: user.commentCount,
    receivedLikes: user.receivedLikes,
    createdAt: user.createdAt.toISOString(),
  }
}

/** 내가 작성한 글 목록 */
export async function getMyPosts(
  userId: string,
  options?: { cursor?: string; limit?: number },
): Promise<{ posts: PostSummary[]; hasMore: boolean }> {
  const limit = options?.limit ?? 20

  const rows = await prisma.post.findMany({
    where: {
      authorId: userId,
      status: { in: ['PUBLISHED', 'DRAFT'] },
    },
    select: postSelect,
    orderBy: { createdAt: 'desc' },
    take: limit + 1,
    ...(options?.cursor ? { cursor: { id: options.cursor }, skip: 1 } : {}),
  })

  const hasMore = rows.length > limit
  const posts = rows.slice(0, limit).map(toPostSummary)
  return { posts, hasMore }
}

/** 내 스크랩 목록 */
export async function getMyScraps(
  userId: string,
  options?: { cursor?: string; limit?: number },
): Promise<{ posts: PostSummary[]; hasMore: boolean }> {
  const limit = options?.limit ?? 20

  const scraps = await prisma.scrap.findMany({
    where: { userId },
    select: {
      id: true,
      post: {
        select: postSelect,
      },
    },
    orderBy: { createdAt: 'desc' },
    take: limit + 1,
    ...(options?.cursor ? { cursor: { id: options.cursor }, skip: 1 } : {}),
  })

  const hasMore = scraps.length > limit
  const posts = scraps.slice(0, limit).map((s) => toPostSummary(s.post))
  return { posts, hasMore }
}
