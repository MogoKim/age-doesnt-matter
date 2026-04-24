import { unstable_cache } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { GRADE_INFO } from '@/lib/grade'
import type { PostSummary, NotificationItem, UserSummary, Grade } from '@/types/api'
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
  isPinned: true,
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
  isPinned?: boolean
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
    isPinned: post.isPinned ?? false,
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
    where: {
      userId,
      post: { status: 'PUBLISHED' },  // 삭제/숨김 글 제외
    },
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
  const posts = scraps.slice(0, limit)
    .filter((s) => s.post !== null)
    .map((s) => toPostSummary(s.post!))
  return { posts, hasMore }
}

/** 내 댓글 목록 */
export interface MyCommentItem {
  id: string
  content: string
  createdAt: string
  postId: string
  postTitle: string
  postBoardType: string
}

export async function getMyComments(
  userId: string,
  options?: { cursor?: string; limit?: number },
): Promise<{ comments: MyCommentItem[]; hasMore: boolean }> {
  const limit = options?.limit ?? 20

  const rows = await prisma.comment.findMany({
    where: {
      authorId: userId,
      status: 'ACTIVE',
    },
    select: {
      id: true,
      content: true,
      createdAt: true,
      post: {
        select: { id: true, title: true, boardType: true },
      },
    },
    orderBy: { createdAt: 'desc' },
    take: limit + 1,
    ...(options?.cursor ? { cursor: { id: options.cursor }, skip: 1 } : {}),
  })

  const hasMore = rows.length > limit
  const comments: MyCommentItem[] = rows.slice(0, limit).map((c) => ({
    id: c.id,
    content: c.content,
    createdAt: c.createdAt.toISOString(),
    postId: c.post.id,
    postTitle: c.post.title,
    postBoardType: c.post.boardType,
  }))

  return { comments, hasMore }
}

// BoardType → 서비스 URL 접두사 (알림 링크 생성용)
const BOARD_URL_PREFIX: Record<string, string> = {
  STORY: '/community/stories',
  HUMOR: '/community/humor',
  LIFE2: '/community/life2',
  WEEKLY: '/community/weekly',
  MAGAZINE: '/magazine',
  JOB: '/jobs',
}

/** 알림 목록 */
export async function getMyNotifications(
  userId: string,
  options?: { cursor?: string; limit?: number },
): Promise<{ notifications: NotificationItem[]; hasMore: boolean }> {
  const limit = options?.limit ?? 20

  const rows = await prisma.notification.findMany({
    where: { userId },
    select: {
      id: true,
      type: true,
      content: true,
      postId: true,
      isRead: true,
      createdAt: true,
      post: { select: { boardType: true } },  // boardType 기반 올바른 URL 생성
    },
    orderBy: { createdAt: 'desc' },
    take: limit + 1,
    ...(options?.cursor ? { cursor: { id: options.cursor }, skip: 1 } : {}),
  })

  const hasMore = rows.length > limit
  const notifications: NotificationItem[] = rows.slice(0, limit).map((n) => {
    let linkUrl = '/my/notifications'
    if (n.postId) {
      const prefix = n.post?.boardType ? BOARD_URL_PREFIX[n.post.boardType] : null
      linkUrl = prefix ? `${prefix}/${n.postId}` : `/community/stories/${n.postId}`
    }
    return {
      id: n.id,
      type: n.type as NotificationItem['type'],
      message: n.content,
      linkUrl,
      isRead: n.isRead,
      createdAt: n.createdAt.toISOString(),
    }
  })

  return { notifications, hasMore }
}

/** 사용자 글꼴 크기 (1시간 캐시 — 글꼴 변경 시 revalidateTag(`user-${userId}-font`) 필요) */
export function getUserFontSize(userId: string): Promise<string> {
  return unstable_cache(
    async () => {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { fontSize: true },
      })
      return user?.fontSize ?? 'NORMAL'
    },
    [`user-font-${userId}`],
    { revalidate: 3600, tags: [`user-${userId}-font`] },
  )()
}

/** 읽지 않은 알림 수 */
export async function getUnreadNotificationCount(userId: string): Promise<number> {
  return prisma.notification.count({
    where: { userId, isRead: false },
  })
}

/** 내 설정 정보 */
export async function getMySettings(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      nickname: true,
      fontSize: true,
      nicknameChangedAt: true,
      marketingOptIn: true,
      isGenderPublic: true,
      isRegionPublic: true,
    },
  })
  if (!user) return null

  const canChangeNickname = !user.nicknameChangedAt ||
    Date.now() - user.nicknameChangedAt.getTime() > 30 * 24 * 60 * 60 * 1000

  return {
    nickname: user.nickname,
    fontSize: user.fontSize,
    canChangeNickname,
    nicknameChangedAt: user.nicknameChangedAt?.toISOString() ?? null,
    marketingOptIn: user.marketingOptIn,
    isGenderPublic: user.isGenderPublic,
    isRegionPublic: user.isRegionPublic,
  }
}
