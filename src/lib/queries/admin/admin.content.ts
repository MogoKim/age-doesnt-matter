import { prisma } from '@/lib/prisma'
import type { BoardType, PostSource, PostStatus } from '@/generated/prisma/client'

// ─── 콘텐츠 관리 ───

export type ContentSortType = 'latest' | 'likes' | 'comments' | 'views'
export type BotTypeFilter = 'user' | 'seed' | 'curate' | 'sheet' | 'admin'

export interface ContentListOptions {
  boardType?: BoardType
  status?: PostStatus
  source?: PostSource
  botType?: BotTypeFilter
  search?: string
  cursor?: string
  limit?: number
  sort?: ContentSortType
}

export async function getContentList(options: ContentListOptions = {}) {
  const { boardType, status, source, botType, search, cursor, limit = 20, sort } = options

  // sort가 없거나 'latest'면 기본 cursor 페이지네이션 모드
  const isDefaultSort = !sort || sort === 'latest'
  // 비기본 정렬은 cursor 페이지네이션 불가 → limit 100으로 한 번만 조회
  const effectiveLimit = isDefaultSort ? limit : 100

  // botType이 있으면 source를 세분화, 없으면 기존 source 필터
  const sourceFilter = (() => {
    if (!botType && source) return { source }
    switch (botType) {
      case 'user':   return { source: 'USER' as PostSource }
      case 'seed':   return { source: 'BOT' as PostSource, cafePostId: null }
      case 'curate': return { source: 'BOT' as PostSource, cafePostId: { not: null } }
      case 'sheet':  return { source: 'SHEET' as PostSource }
      case 'admin':  return { source: 'ADMIN' as PostSource }
      default:       return {}
    }
  })()

  const where = {
    ...(boardType && { boardType }),
    ...(status && { status }),
    ...sourceFilter,
    ...(search && {
      OR: [
        { title: { contains: search, mode: 'insensitive' as const } },
        { content: { contains: search, mode: 'insensitive' as const } },
        { author: { nickname: { contains: search, mode: 'insensitive' as const } } },
      ],
    }),
    // cursor는 기본 정렬(최신순)일 때만 유효
    ...(isDefaultSort && cursor ? { createdAt: { lt: new Date(cursor) } } : {}),
  }

  const orderBy =
    sort === 'likes'    ? { likeCount: 'desc' as const }    :
    sort === 'comments' ? { commentCount: 'desc' as const }  :
    sort === 'views'    ? { viewCount: 'desc' as const }     :
    { createdAt: 'desc' as const }

  const posts = await prisma.post.findMany({
    where,
    orderBy,
    take: effectiveLimit + 1,
    select: {
      id: true,
      boardType: true,
      category: true,
      title: true,
      status: true,
      source: true,
      promotionLevel: true,
      isPinned: true,
      isFeatured: true,
      viewCount: true,
      likeCount: true,
      commentCount: true,
      reportCount: true,
      createdAt: true,
      author: {
        select: { id: true, nickname: true },
      },
    },
  })

  // 비기본 정렬이면 더보기 없음 (cursor 페이지네이션 불가)
  const hasMore = isDefaultSort && posts.length > effectiveLimit
  if (posts.length > effectiveLimit) posts.pop()

  return { posts, hasMore }
}

export async function getAdminPostDetail(id: string) {
  return prisma.post.findUnique({
    where: { id },
    select: {
      id: true,
      boardType: true,
      category: true,
      title: true,
      content: true,
      status: true,
      source: true,
      createdAt: true,
      author: { select: { id: true, nickname: true } },
      comments: {
        where: { status: { not: 'DELETED' } },
        orderBy: { createdAt: 'asc' },
        select: {
          id: true,
          content: true,
          status: true,
          createdAt: true,
          parentId: true,
          author: { select: { nickname: true } },
          guestNickname: true,
        },
      },
    },
  })
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
