import { unstable_cache } from 'next/cache'
import { prisma } from '@/lib/prisma'
import type { BoardType } from '@/generated/prisma/client'
import type { PostSummary } from '@/types/api'
import { postSelect, toPostSummary, buildTextSearch, SearchField } from './posts.base'
import { EXCLUDE_GREETING } from '@/lib/greeting'

/* ── 게시판별 목록 ── */

export async function getPostsByBoard(
  boardType: BoardType,
  options?: { category?: string; cursor?: string; limit?: number; sort?: 'latest' | 'likes'; q?: string; sf?: SearchField },
): Promise<{ posts: PostSummary[]; hasMore: boolean }> {
  const limit = options?.limit ?? 20
  const sort = options?.sort ?? 'latest'

  // 가입인사 제외: 특정 카테고리 선택 시 그 카테고리만(가입인사 탭이면 가입인사 노출),
  // "전체"/무카테고리면 EXCLUDE_GREETING. 검색 OR과 OR 키 충돌 방지 위해 AND로 결합.
  const search = buildTextSearch(options?.q, options?.sf)
  const where = {
    boardType,
    status: 'PUBLISHED' as const,
    ...(options?.cursor ? { id: { lt: options.cursor } } : {}),
    AND: [
      options?.category && options.category !== '전체'
        ? { category: options.category }
        : EXCLUDE_GREETING,
      ...(search.OR ? [search] : []),
    ],
  }

  const orderBy = sort === 'likes'
    ? [{ isPinned: 'desc' as const }, { likeCount: 'desc' as const }, { createdAt: 'desc' as const }]
    : [{ isPinned: 'desc' as const }, { createdAt: 'desc' as const }]

  const rows = await prisma.post.findMany({
    where,
    select: postSelect,
    orderBy,
    take: limit + 1,
  })

  const hasMore = rows.length > limit
  const posts = rows.slice(0, limit).map(toPostSummary)

  return { posts, hasMore }
}

/* ── 게시판별 목록 (번호 페이지네이션) ── */

export async function getPostsByBoardPage(
  boardType: BoardType,
  options?: { category?: string; skip?: number; limit?: number; sort?: 'latest' | 'likes'; q?: string; sf?: SearchField },
): Promise<{ posts: PostSummary[]; total: number }> {
  const limit = options?.limit ?? 12
  const skip = options?.skip ?? 0
  const sort = options?.sort ?? 'latest'

  // 가입인사 제외(getPostsByBoard와 동일 규칙). 검색 OR과 충돌 방지 AND 결합.
  const search = buildTextSearch(options?.q, options?.sf)
  const where = {
    boardType,
    status: 'PUBLISHED' as const,
    AND: [
      options?.category && options.category !== '전체'
        ? { category: options.category }
        : EXCLUDE_GREETING,
      ...(search.OR ? [search] : []),
    ],
  }

  const orderBy = sort === 'likes'
    ? [{ isPinned: 'desc' as const }, { likeCount: 'desc' as const }, { createdAt: 'desc' as const }]
    : [{ isPinned: 'desc' as const }, { createdAt: 'desc' as const }]

  const [rows, total] = await Promise.all([
    prisma.post.findMany({ where, select: postSelect, orderBy, skip, take: limit }),
    prisma.post.count({ where }),
  ])

  return { posts: rows.map(toPostSummary), total }
}

/* ── 최신 커뮤니티 글 ── */

async function _getLatestCommunityPosts(limit = 5): Promise<PostSummary[]> {
  const rows = await prisma.post.findMany({
    where: {
      status: 'PUBLISHED',
      boardType: { in: ['STORY', 'HUMOR', 'LIFE2'] },
      ...EXCLUDE_GREETING, // 홈/최신글에 가입인사 섞임 방지
    },
    select: postSelect,
    orderBy: { createdAt: 'desc' },
    take: limit,
  })

  return rows.map(toPostSummary)
}
export const getLatestCommunityPosts = unstable_cache(
  _getLatestCommunityPosts,
  ['latest-community-posts'],
  { revalidate: 60 },
)

/* ── 2막 준비 최신글 ── */

async function _getLatestLife2Posts(limit = 5): Promise<PostSummary[]> {
  const rows = await prisma.post.findMany({
    where: {
      status: 'PUBLISHED',
      boardType: 'LIFE2',
    },
    select: postSelect,
    orderBy: { createdAt: 'desc' },
    take: limit,
  })
  return rows.map(toPostSummary)
}
export const getLatestLife2Posts = unstable_cache(
  _getLatestLife2Posts,
  ['latest-life2-posts'],
  { revalidate: 60 },
)

/* ── 최근 활동 피드 (홈페이지용) ── */

export interface RecentActivity {
  type: 'comment' | 'like' | 'post'
  nickname: string
  postTitle: string
  postId: string
  boardType: string
  timeAgo: string
}

async function _getRecentActivities(limit = 8): Promise<RecentActivity[]> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000)

  // 최근 댓글, 좋아요, 글을 병렬 조회
  const [recentComments, recentLikes, recentPosts] = await Promise.all([
    prisma.comment.findMany({
      where: { createdAt: { gte: since }, status: 'ACTIVE' },
      select: {
        createdAt: true,
        author: { select: { nickname: true } },
        post: { select: { id: true, title: true, boardType: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    }),
    prisma.like.findMany({
      where: { createdAt: { gte: since }, postId: { not: null } },
      select: {
        createdAt: true,
        user: { select: { nickname: true } },
        post: { select: { id: true, title: true, boardType: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    }),
    prisma.post.findMany({
      where: {
        createdAt: { gte: since },
        status: 'PUBLISHED',
        boardType: { in: ['STORY', 'HUMOR', 'LIFE2'] },
        ...EXCLUDE_GREETING, // 홈 최근활동 피드에 가입인사 글 노출 방지
      },
      select: {
        id: true,
        title: true,
        boardType: true,
        createdAt: true,
        author: { select: { nickname: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    }),
  ])

  const activities: Array<RecentActivity & { _sortTime: Date }> = []

  for (const c of recentComments) {
    if (!c.post || !c.author) continue
    activities.push({
      type: 'comment',
      nickname: c.author.nickname,
      postTitle: c.post.title,
      postId: c.post.id,
      boardType: c.post.boardType,
      timeAgo: '',
      _sortTime: c.createdAt,
    })
  }

  for (const l of recentLikes) {
    if (!l.post) continue
    activities.push({
      type: 'like',
      nickname: l.user.nickname,
      postTitle: l.post.title,
      postId: l.post.id,
      boardType: l.post.boardType,
      timeAgo: '',
      _sortTime: l.createdAt,
    })
  }

  for (const p of recentPosts) {
    activities.push({
      type: 'post',
      nickname: p.author?.nickname ?? '알 수 없음',
      postTitle: p.title,
      postId: p.id,
      boardType: p.boardType,
      timeAgo: '',
      _sortTime: p.createdAt,
    })
  }

  // 시간순 정렬 후 상위 N개
  activities.sort((a, b) => b._sortTime.getTime() - a._sortTime.getTime())

  const now = Date.now()
  return activities.slice(0, limit).map(({ _sortTime, ...rest }) => ({
    ...rest,
    timeAgo: formatTimeAgoFromMs(now - _sortTime.getTime()),
  }))
}
export const getRecentActivities = unstable_cache(
  _getRecentActivities,
  ['recent-activities'],
  { revalidate: 60 },
)

// 커뮤니티 게시판 1페이지 — 모듈 최상위 생성으로 함수 참조 안정 → 30s 캐시 실제 동작
export const getCachedBoardPage = unstable_cache(
  (boardType: BoardType, category: string, sort: string) =>
    getPostsByBoardPage(boardType, {
      category: category === 'all' ? undefined : category,
      sort: sort as 'latest' | 'likes',
      skip: 0,
      limit: 12,
    }),
  ['community-board-page'],
  { revalidate: 30, tags: ['community-board-page'] },
)

/* ── 관련글 (글 상세 본문끝·하단 내부 링크용) ──
 * 같은 게시판 + 같은 category 우선 → 부족하면 같은 게시판 fallback(중복 제거).
 * 정렬: trendingScore(인기) 우선 + createdAt 보조 — 시드/저품질 글이 상위에 뜨는 것 방지.
 * category가 빈값('')/null이면 매칭 생략하고 곧장 인기순(글쓰기 시 category 미선택 글 대응).
 * keyParts는 고유('related-community-posts') — getCachedBoardPage와 충돌 방지. tags만 공유. */
async function _getRelatedCommunityPosts(
  boardType: BoardType,
  category: string | null,
  excludeId: string,
  limit = 15,
): Promise<PostSummary[]> {
  // 1순위: 같은 게시판 + 같은 category
  const matched = category
    ? await prisma.post.findMany({
        where: { boardType, status: 'PUBLISHED', id: { not: excludeId }, category },
        orderBy: [{ trendingScore: 'desc' }, { createdAt: 'desc' }],
        take: limit,
        select: postSelect,
      })
    : []

  if (matched.length >= limit) return matched.map(toPostSummary)

  // 2순위: 같은 게시판 최신순으로 채움 (이미 뽑은 글 + 본문글 제외)
  const excludeIds = [excludeId, ...matched.map((r) => r.id)]
  const fill = await prisma.post.findMany({
    // 일반 글 관련글 fallback에 가입인사 섞임 방지(category 매칭은 호출 category 그대로라 안전)
    where: { boardType, status: 'PUBLISHED', id: { notIn: excludeIds }, ...EXCLUDE_GREETING },
    orderBy: [{ trendingScore: 'desc' }, { createdAt: 'desc' }],
    take: limit - matched.length,
    select: postSelect,
  })

  return [...matched, ...fill].map(toPostSummary)
}
export const getRelatedCommunityPosts = unstable_cache(
  _getRelatedCommunityPosts,
  ['related-community-posts'],
  { revalidate: 300, tags: ['community-board-page'] },
)

function formatTimeAgoFromMs(ms: number): string {
  const minutes = Math.floor(ms / 60000)
  if (minutes < 1) return '방금 전'
  if (minutes < 60) return `${minutes}분 전`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}시간 전`
  return `${Math.floor(hours / 24)}일 전`
}
