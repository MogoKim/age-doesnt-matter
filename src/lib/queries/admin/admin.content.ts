import { prisma } from '@/lib/prisma'
import type { BoardType, PostSource, PostStatus } from '@/generated/prisma/client'

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
