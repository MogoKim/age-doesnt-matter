import { prisma } from '@/lib/prisma'
import type { BoardType } from '@/generated/prisma/client'
import type { PostSummary } from '@/types/api'
import { postSelect, toPostSummary, buildTextSearch, SearchField } from './posts.base'

/* ── 게시판별 목록 ── */

export async function getPostsByBoard(
  boardType: BoardType,
  options?: { category?: string; cursor?: string; limit?: number; sort?: 'latest' | 'likes'; q?: string; sf?: SearchField },
): Promise<{ posts: PostSummary[]; hasMore: boolean }> {
  const limit = options?.limit ?? 20
  const sort = options?.sort ?? 'latest'

  const where = {
    boardType,
    status: 'PUBLISHED' as const,
    ...(options?.category && options.category !== '전체' ? { category: options.category } : {}),
    ...(options?.cursor ? { id: { lt: options.cursor } } : {}),
    ...buildTextSearch(options?.q, options?.sf),
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

/* ── 최신 커뮤니티 글 ── */

export async function getLatestCommunityPosts(limit = 5): Promise<PostSummary[]> {
  const rows = await prisma.post.findMany({
    where: {
      status: 'PUBLISHED',
      boardType: { in: ['STORY', 'HUMOR', 'LIFE2'] },
    },
    select: postSelect,
    orderBy: { createdAt: 'desc' },
    take: limit,
  })

  return rows.map(toPostSummary)
}

/* ── 2막 준비 최신글 ── */

export async function getLatestLife2Posts(limit = 5): Promise<PostSummary[]> {
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

/* ── 최근 활동 피드 (홈페이지용) ── */

export interface RecentActivity {
  type: 'comment' | 'like' | 'post'
  nickname: string
  postTitle: string
  postId: string
  boardType: string
  timeAgo: string
}

export async function getRecentActivities(limit = 8): Promise<RecentActivity[]> {
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

function formatTimeAgoFromMs(ms: number): string {
  const minutes = Math.floor(ms / 60000)
  if (minutes < 1) return '방금 전'
  if (minutes < 60) return `${minutes}분 전`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}시간 전`
  return `${Math.floor(hours / 24)}일 전`
}
