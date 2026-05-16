import { unstable_cache } from 'next/cache'
import { prisma } from '@/lib/prisma'
import type { BoardType, PromotionLevel } from '@/generated/prisma/client'
import type { PostSummary } from '@/types/api'
import { postSelect, toPostSummary, buildTextSearch, SearchField } from './posts.base'
import { getLastNoon } from '@/lib/utils/trending'

/* ── 인기 게시글 (Trending) ── */

async function _getTrendingPosts(limit = 5): Promise<PostSummary[]> {
  const noon = getLastNoon()
  const prevNoon = new Date(noon.getTime() - 24 * 60 * 60 * 1000)
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)

  // 1차: 현재 정오 사이클 + engagement gate
  const rows1 = await prisma.post.findMany({
    where: {
      status: 'PUBLISHED',
      createdAt: { gte: noon },
      OR: [{ likeCount: { gte: 1 } }, { commentCount: { gte: 1 } }],
    },
    select: postSelect,
    orderBy: [{ trendingScore: 'desc' }, { createdAt: 'desc' }],
    take: limit,
  })
  if (rows1.length >= limit) return rows1.map(toPostSummary)

  // 2차: 이전 정오 사이클까지 확장 + engagement gate
  const rows2 = await prisma.post.findMany({
    where: {
      status: 'PUBLISHED',
      createdAt: { gte: prevNoon },
      OR: [{ likeCount: { gte: 1 } }, { commentCount: { gte: 1 } }],
    },
    select: postSelect,
    orderBy: [{ trendingScore: 'desc' }, { createdAt: 'desc' }],
    take: limit,
  })
  if (rows2.length > 0) return rows2.map(toPostSummary)

  // 3차: 7일 + HOT/HALL_OF_FAME fallback
  const rows3 = await prisma.post.findMany({
    where: {
      status: 'PUBLISHED',
      createdAt: { gte: sevenDaysAgo },
      promotionLevel: { in: ['HOT', 'HALL_OF_FAME'] as PromotionLevel[] },
    },
    select: postSelect,
    orderBy: [{ trendingScore: 'desc' }, { createdAt: 'desc' }],
    take: limit,
  })
  if (rows3.length > 0) return rows3.map(toPostSummary)

  // 4차: fallback — engagement 무시, trendingScore desc
  const rows4 = await prisma.post.findMany({
    where: { status: 'PUBLISHED', createdAt: { gte: sevenDaysAgo } },
    select: postSelect,
    orderBy: [{ trendingScore: 'desc' }, { createdAt: 'desc' }],
    take: limit,
  })
  return rows4.map(toPostSummary)
}
export const getTrendingPosts = unstable_cache(
  _getTrendingPosts,
  ['trending-posts'],
  { revalidate: 60 },
)

/* ── 홈 커뮤니티 인기글 (STORY + HUMOR + LIFE2만) ── */

const COMMUNITY_BOARDS: BoardType[] = ['STORY', 'HUMOR', 'LIFE2']

async function _getTrendingCommunityPosts(limit = 5): Promise<PostSummary[]> {
  const noon = getLastNoon()
  const prevNoon = new Date(noon.getTime() - 24 * 60 * 60 * 1000)
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)

  // 1차: 오늘 정오 이후 + engagement gate (score=0이어도 오늘 글 우선)
  const rows1 = await prisma.post.findMany({
    where: {
      status: 'PUBLISHED',
      boardType: { in: COMMUNITY_BOARDS },
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
      boardType: { in: COMMUNITY_BOARDS },
      createdAt: { gte: prevNoon, lt: noon },
      OR: [{ likeCount: { gte: 1 } }, { commentCount: { gte: 1 } }],
    },
    select: postSelect,
    orderBy: [{ trendingScore: 'desc' }, { createdAt: 'desc' }],
    take: remaining,
  })
  const merged = [...rows1.map(toPostSummary), ...rows2.map(toPostSummary)]
  if (merged.length > 0) return merged

  // 3차: 7일 + HOT/HALL_OF_FAME fallback
  const rows3 = await prisma.post.findMany({
    where: {
      status: 'PUBLISHED',
      boardType: { in: COMMUNITY_BOARDS },
      createdAt: { gte: sevenDaysAgo },
      promotionLevel: { in: ['HOT', 'HALL_OF_FAME'] as PromotionLevel[] },
    },
    select: postSelect,
    orderBy: [{ trendingScore: 'desc' }, { createdAt: 'desc' }],
    take: limit,
  })
  if (rows3.length > 0) return rows3.map(toPostSummary)

  // 4차: fallback — engagement 무시, trendingScore desc
  const rows4 = await prisma.post.findMany({
    where: {
      status: 'PUBLISHED',
      boardType: { in: COMMUNITY_BOARDS },
      createdAt: { gte: sevenDaysAgo },
    },
    select: postSelect,
    orderBy: [{ trendingScore: 'desc' }, { createdAt: 'desc' }],
    take: limit,
  })
  return rows4.map(toPostSummary)
}

export const getTrendingCommunityPosts = unstable_cache(
  _getTrendingCommunityPosts,
  ['trending-community-posts'],
  { revalidate: 60 },
)

/* ── 일간 인기글 (Trending) ── */

export async function getDailyTrendingPosts(
  options?: { skip?: number; limit?: number; q?: string; sf?: SearchField },
): Promise<{ posts: PostSummary[]; total: number }> {
  const { skip = 0, limit = 12, q, sf } = options ?? {}
  const where = {
    status: 'PUBLISHED' as const,
    createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
    ...buildTextSearch(q, sf),
  }
  const [rows, total] = await Promise.all([
    prisma.post.findMany({ where, select: postSelect, orderBy: [{ trendingScore: 'desc' }], skip, take: limit }),
    prisma.post.count({ where }),
  ])
  return { posts: rows.map(toPostSummary), total }
}

/* ── 주간 인기글 (Trending) ── */

export async function getWeeklyTrendingPosts(
  options?: { skip?: number; limit?: number; q?: string; sf?: SearchField },
): Promise<{ posts: PostSummary[]; total: number }> {
  const MAX_WEEKLY = 60
  const { skip = 0, limit = 12, q, sf } = options ?? {}
  const effectiveSkip = Math.min(skip, MAX_WEEKLY)
  const effectiveTake = Math.max(0, Math.min(limit, MAX_WEEKLY - effectiveSkip))
  const where = {
    status: 'PUBLISHED' as const,
    createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
    ...buildTextSearch(q, sf),
  }
  const [rows, rawTotal] = await Promise.all([
    prisma.post.findMany({ where, select: postSelect, orderBy: [{ trendingScore: 'desc' }], skip: effectiveSkip, take: effectiveTake }),
    prisma.post.count({ where }),
  ])
  return { posts: rows.map(toPostSummary), total: Math.min(rawTotal, MAX_WEEKLY) }
}

/* ── 이달의 인기글 (월간 베스트) ── */

async function _getEditorsPicks(limit: number): Promise<PostSummary[]> {
  const now = new Date()
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
  const threeMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 3, 1)

  const [withThumb, allMonth, hotRecent] = await Promise.all([
    prisma.post.findMany({
      where: { status: 'PUBLISHED', createdAt: { gte: startOfMonth }, thumbnailUrl: { not: null } },
      select: postSelect,
      orderBy: [{ likeCount: 'desc' }, { createdAt: 'desc' }],
      take: limit,
    }),
    prisma.post.findMany({
      where: { status: 'PUBLISHED', createdAt: { gte: startOfMonth } },
      select: postSelect,
      orderBy: [{ likeCount: 'desc' }, { createdAt: 'desc' }],
      take: limit,
    }),
    prisma.post.findMany({
      where: {
        status: 'PUBLISHED',
        promotionLevel: { in: ['HOT', 'HALL_OF_FAME'] as PromotionLevel[] },
        createdAt: { gte: threeMonthsAgo },
      },
      select: postSelect,
      orderBy: [{ likeCount: 'desc' }, { createdAt: 'desc' }],
      take: limit,
    }),
  ])

  if (withThumb.length >= limit) return withThumb.map(toPostSummary)
  if (allMonth.length >= limit) return allMonth.map(toPostSummary)
  return hotRecent.map(toPostSummary)
}

export function getEditorsPicks(limit = 2): Promise<PostSummary[]> {
  return unstable_cache(
    () => _getEditorsPicks(limit),
    [`editors-picks-${limit}`],
    { revalidate: 300 },
  )()
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
  options?: { skip?: number; limit?: number; q?: string; sf?: SearchField },
): Promise<{ posts: PostSummary[]; total: number }> {
  const { skip = 0, limit = 12, q, sf } = options ?? {}
  const where = {
    status: 'PUBLISHED' as const,
    boardType: { in: ['STORY', 'HUMOR', 'LIFE2'] as BoardType[] },
    promotionLevel: 'HALL_OF_FAME' as PromotionLevel,
    ...buildTextSearch(q, sf),
  }
  const [rows, total] = await Promise.all([
    prisma.post.findMany({ where, select: postSelect, orderBy: [{ likeCount: 'desc' }, { createdAt: 'desc' }], skip, take: limit }),
    prisma.post.count({ where }),
  ])
  return { posts: rows.map(toPostSummary), total }
}

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

/* ── 누적 인기글 (뜨는 이야기 탭) ── */

// postSelect 공통 확장 금지 (21개 파일 영향 방지). 이 쿼리에만 로컬 확장.
const hotPostSelect = { ...postSelect, hotPromotedAt: true } as const

export async function getAccumulatedHotPosts(
  options?: { skip?: number; limit?: number; q?: string; sf?: SearchField },
): Promise<{ posts: PostSummary[]; total: number }> {
  const { skip = 0, limit = 12, q, sf } = options ?? {}
  const where = {
    status: 'PUBLISHED' as const,
    boardType: { in: ['STORY', 'HUMOR', 'LIFE2'] as BoardType[] },
    hotPromotedAt: { not: null },
    ...buildTextSearch(q, sf),
  }
  const [rows, total] = await Promise.all([
    prisma.post.findMany({
      where,
      select: hotPostSelect,
      orderBy: [{ hotPromotedAt: 'desc' }],
      skip,
      take: limit,
    }),
    prisma.post.count({ where }),
  ])
  return {
    posts: rows.map((r) => ({
      ...toPostSummary(r),
      hotPromotedAt: r.hotPromotedAt?.toISOString() ?? null,
    })),
    total,
  }
}
