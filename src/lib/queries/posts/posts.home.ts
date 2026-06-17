import { unstable_cache } from 'next/cache'
import { prisma } from '@/lib/prisma'
import type { BoardType } from '@/generated/prisma/client'
import type { PostSummary } from '@/types/api'
import { homeListSelect, toPostSummary } from './posts.base'
import { EXCLUDE_GREETING } from '@/lib/greeting'

// 24시간 롤링 기준 + engagement gate (글 작성 시점부터 24시간 이내 우선)
// export: 뜨는이야기 쿼터 fetch(_getTrendingQuotaPosts)에서 uncached로 재사용
export async function getHomeBoardHotPostsRaw(boardType: BoardType, limit = 10): Promise<PostSummary[]> {
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000)
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)

  // 1차: 최근 24시간 이내 + engagement gate
  const rows1 = await prisma.post.findMany({
    where: {
      status: 'PUBLISHED',
      boardType,
      createdAt: { gte: since24h },
      OR: [{ likeCount: { gte: 1 } }, { commentCount: { gte: 1 } }],
      AND: [EXCLUDE_GREETING], // 가입인사 제외(STORY 호출 시 홈 stories/quota 오염 방지)
    },
    select: homeListSelect,
    orderBy: [{ trendingScore: 'desc' }, { createdAt: 'desc' }],
    take: limit,
  })
  if (rows1.length > 0) return rows1.map(toPostSummary)

  // 2차: 7일 fallback (engagement 무시)
  const rows2 = await prisma.post.findMany({
    where: {
      status: 'PUBLISHED',
      boardType,
      createdAt: { gte: sevenDaysAgo },
      AND: [EXCLUDE_GREETING], // 가입인사 제외
    },
    select: homeListSelect,
    orderBy: [{ trendingScore: 'desc' }, { createdAt: 'desc' }],
    take: limit,
  })
  return rows2.map(toPostSummary)
}
export const getHomeBoardHotPosts = unstable_cache(
  getHomeBoardHotPostsRaw,
  ['home-board-hot-posts'],
  { revalidate: 60, tags: ['home-stories', 'home-humor', 'home-board-hot'] },
)
