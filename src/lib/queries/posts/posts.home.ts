import { unstable_cache } from 'next/cache'
import { prisma } from '@/lib/prisma'
import type { BoardType } from '@/generated/prisma/client'
import type { PostSummary } from '@/types/api'
import { postSelect, toPostSummary } from './posts.base'
import { getLastNoon } from '@/lib/utils/trending'

// 정오 기준 + engagement gate → 3단계 fallback (빈 섹션 방지)
async function _getHomeBoardHotPosts(boardType: BoardType, limit = 10): Promise<PostSummary[]> {
  const noon = getLastNoon()
  const prevNoon = new Date(noon.getTime() - 24 * 60 * 60 * 1000)
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)

  // 1차: 현재 정오 사이클 + engagement gate
  const rows1 = await prisma.post.findMany({
    where: {
      status: 'PUBLISHED',
      boardType,
      createdAt: { gte: noon },
      OR: [{ likeCount: { gte: 1 } }, { commentCount: { gte: 1 } }],
    },
    select: postSelect,
    orderBy: [{ trendingScore: 'desc' }, { createdAt: 'desc' }],
    take: limit,
  })
  if (rows1.length >= 5) return rows1.map(toPostSummary)

  // 2차: 이전 정오 사이클까지 확장 + engagement gate
  const rows2 = await prisma.post.findMany({
    where: {
      status: 'PUBLISHED',
      boardType,
      createdAt: { gte: prevNoon },
      OR: [{ likeCount: { gte: 1 } }, { commentCount: { gte: 1 } }],
    },
    select: postSelect,
    orderBy: [{ trendingScore: 'desc' }, { createdAt: 'desc' }],
    take: limit,
  })
  if (rows2.length > 0) return rows2.map(toPostSummary)

  // 3차: 7일 fallback (engagement 무시)
  const rows3 = await prisma.post.findMany({
    where: {
      status: 'PUBLISHED',
      boardType,
      createdAt: { gte: sevenDaysAgo },
    },
    select: postSelect,
    orderBy: [{ trendingScore: 'desc' }, { createdAt: 'desc' }],
    take: limit,
  })
  return rows3.map(toPostSummary)
}
export const getHomeBoardHotPosts = unstable_cache(
  _getHomeBoardHotPosts,
  ['home-board-hot-posts'],
  { revalidate: 60 },
)
