import { unstable_cache } from 'next/cache'
import { prisma } from '@/lib/prisma'
import type { BoardType } from '@/generated/prisma/client'
import type { PostSummary } from '@/types/api'
import { postSelect, toPostSummary } from './posts.base'
import { getLastNoon } from '@/lib/utils/trending'

// 정오 기준 + engagement gate → merge 전략 (오늘 글 항상 우선, 어제 글로 보충)
// export: 뜨는이야기 쿼터 fetch(_getTrendingQuotaPosts)에서 uncached로 재사용
export async function getHomeBoardHotPostsRaw(boardType: BoardType, limit = 10): Promise<PostSummary[]> {
  const noon = getLastNoon()
  const prevNoon = new Date(noon.getTime() - 24 * 60 * 60 * 1000)
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)

  // 1차: 오늘 정오 이후 + engagement gate (score=0이어도 오늘 글 우선)
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
  if (rows1.length >= limit) return rows1.map(toPostSummary)

  // 부족하면 어제 정오~오늘 정오에서 보충 (rows1과 시간대 중복 없음)
  const remaining = limit - rows1.length
  const rows2 = await prisma.post.findMany({
    where: {
      status: 'PUBLISHED',
      boardType,
      createdAt: { gte: prevNoon, lt: noon },
      OR: [{ likeCount: { gte: 1 } }, { commentCount: { gte: 1 } }],
    },
    select: postSelect,
    orderBy: [{ trendingScore: 'desc' }, { createdAt: 'desc' }],
    take: remaining,
  })
  const merged = [...rows1.map(toPostSummary), ...rows2.map(toPostSummary)]
  if (merged.length > 0) return merged

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
  getHomeBoardHotPostsRaw,
  ['home-board-hot-posts'],
  { revalidate: 60, tags: ['home-stories', 'home-humor', 'home-board-hot'] },
)
