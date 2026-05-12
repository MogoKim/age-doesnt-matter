import { prisma } from '@/lib/prisma'
import type { BoardType } from '@/generated/prisma/client'
import type { PostSummary } from '@/types/api'
import { postSelect, toPostSummary } from './posts.base'

async function queryByBoard(boardType: BoardType, since: Date, limit: number): Promise<PostSummary[]> {
  const rows = await prisma.post.findMany({
    where: { status: 'PUBLISHED', boardType, createdAt: { gte: since } },
    select: postSelect,
    orderBy: [{ likeCount: 'desc' }, { createdAt: 'desc' }],
    take: limit,
  })
  return rows.map(toPostSummary)
}

// 24h top5 → 5개 미만이면 7일로 자동 확대
export async function getHomeBoardHotPosts(boardType: BoardType, limit = 10): Promise<PostSummary[]> {
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000)
  const since7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)

  const posts = await queryByBoard(boardType, since24h, limit)
  if (posts.length < 5) {
    return queryByBoard(boardType, since7d, limit)
  }
  return posts
}
