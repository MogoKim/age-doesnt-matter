import { prisma } from '@/lib/prisma'
import type { BoardType, PromotionLevel } from '@/generated/prisma/client'
import type { PostSummary } from '@/types/api'
import { postSelect, toPostSummary, buildTextSearch, SearchField } from './posts.base'

/* ── 인기 게시글 (Trending) ── */

export async function getTrendingPosts(limit = 5): Promise<PostSummary[]> {
  const rows = await prisma.post.findMany({
    where: {
      status: 'PUBLISHED',
      createdAt: { gte: new Date(Date.now() - 48 * 60 * 60 * 1000) },
    },
    select: postSelect,
    orderBy: [{ trendingScore: 'desc' }, { createdAt: 'desc' }],
    take: limit,
  })

  return rows.map(toPostSummary)
}

/* ── 일간 인기글 (Trending) ── */

export async function getDailyTrendingPosts(limit = 10, q?: string, sf?: SearchField): Promise<PostSummary[]> {
  const rows = await prisma.post.findMany({
    where: {
      status: 'PUBLISHED',
      createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
      ...buildTextSearch(q, sf),
    },
    select: postSelect,
    orderBy: [{ trendingScore: 'desc' }],
    take: limit,
  })
  return rows.map(toPostSummary)
}

/* ── 주간 인기글 (Trending) ── */

export async function getWeeklyTrendingPosts(limit = 10, q?: string, sf?: SearchField): Promise<PostSummary[]> {
  const rows = await prisma.post.findMany({
    where: {
      status: 'PUBLISHED',
      createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
      ...buildTextSearch(q, sf),
    },
    select: postSelect,
    orderBy: [{ trendingScore: 'desc' }],
    take: limit,
  })
  return rows.map(toPostSummary)
}

/* ── 이달의 인기글 (월간 베스트) ── */

export async function getEditorsPicks(limit = 2): Promise<PostSummary[]> {
  const now = new Date()
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)

  // 1순위: 이번 달 게시글 중 thumbnailUrl 있는 것, likeCount 기준 상위
  const thisMonthWithThumb = await prisma.post.findMany({
    where: {
      status: 'PUBLISHED',
      createdAt: { gte: startOfMonth },
      thumbnailUrl: { not: null },
    },
    select: postSelect,
    orderBy: [{ likeCount: 'desc' }, { createdAt: 'desc' }],
    take: limit,
  })
  if (thisMonthWithThumb.length >= limit) return thisMonthWithThumb.map(toPostSummary)

  // 2순위: 이번 달 전체 (썸네일 없는 것 포함)
  const thisMonthAll = await prisma.post.findMany({
    where: { status: 'PUBLISHED', createdAt: { gte: startOfMonth } },
    select: postSelect,
    orderBy: [{ likeCount: 'desc' }, { createdAt: 'desc' }],
    take: limit,
  })
  if (thisMonthAll.length >= limit) return thisMonthAll.map(toPostSummary)

  // 3순위 fallback: 지난 3개월 HOT 이상
  const threeMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 3, 1)
  const recent = await prisma.post.findMany({
    where: {
      status: 'PUBLISHED',
      promotionLevel: { in: ['HOT', 'HALL_OF_FAME'] },
      createdAt: { gte: threeMonthsAgo },
    },
    select: postSelect,
    orderBy: [{ likeCount: 'desc' }, { createdAt: 'desc' }],
    take: limit,
  })
  return recent.map(toPostSummary)
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
  options?: { cursor?: string; limit?: number; q?: string; sf?: SearchField },
): Promise<{ posts: PostSummary[]; hasMore: boolean }> {
  const limit = options?.limit ?? 10

  const rows = await prisma.post.findMany({
    where: {
      status: 'PUBLISHED',
      boardType: { in: ['STORY', 'HUMOR', 'LIFE2'] as BoardType[] },
      promotionLevel: 'HALL_OF_FAME',
      ...(options?.cursor ? { id: { lt: options.cursor } } : {}),
      ...buildTextSearch(options?.q, options?.sf),
    },
    select: postSelect,
    orderBy: [{ likeCount: 'desc' }, { createdAt: 'desc' }],
    take: limit + 1,
  })

  const hasMore = rows.length > limit
  return { posts: rows.slice(0, limit).map(toPostSummary), hasMore }
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
