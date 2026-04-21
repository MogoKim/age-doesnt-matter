import { prisma } from '@/lib/prisma'
import type { BoardType } from '@/generated/prisma/client'
import { GRADE_INFO } from '@/lib/grade'
import type { PostSummary, UserSummary, Grade } from '@/types/api'

/* ── 헬퍼 (posts.ts와 동일 패턴) ── */

function toUserSummary(user: {
  id: string
  nickname: string
  grade: string
  profileImage: string | null
}): UserSummary {
  const grade = user.grade as Grade
  return {
    id: user.id,
    nickname: user.nickname,
    grade,
    gradeEmoji: GRADE_INFO[grade]?.emoji ?? '🌱',
    profileImage: user.profileImage,
  }
}

const postSelect = {
  id: true,
  boardType: true,
  category: true,
  title: true,
  summary: true,
  thumbnailUrl: true,
  likeCount: true,
  commentCount: true,
  viewCount: true,
  promotionLevel: true,
  createdAt: true,
  author: {
    select: { id: true, nickname: true, grade: true, profileImage: true },
  },
} as const

function toPostSummary(post: {
  id: string
  boardType: BoardType
  category: string | null
  title: string
  summary: string | null
  thumbnailUrl: string | null
  likeCount: number
  commentCount: number
  viewCount: number
  promotionLevel: string
  createdAt: Date
  author: { id: string; nickname: string; grade: string; profileImage: string | null }
}): PostSummary {
  return {
    id: post.id,
    boardType: post.boardType,
    category: post.category ?? '',
    title: post.title,
    preview: post.summary ?? '',
    thumbnailUrl: post.thumbnailUrl,
    author: toUserSummary(post.author),
    likeCount: post.likeCount,
    commentCount: post.commentCount,
    viewCount: post.viewCount,
    promotionLevel: post.promotionLevel as PostSummary['promotionLevel'],
    createdAt: post.createdAt.toISOString(),
  }
}

/* ── 검색 타입 ── */

export type SearchTab = 'all' | 'jobs' | 'posts' | 'magazine'

export interface SearchResult {
  jobs: { items: PostSummary[]; total: number }
  posts: { items: PostSummary[]; total: number }
  magazine: { items: PostSummary[]; total: number }
  totalCount: number
}

export interface JobSearchItem {
  id: string
  title: string
  location: string
  salary: string
  tags: string[]
}

/* ── 통합검색 ── */

export async function searchAll(
  query: string,
  options?: { tab?: SearchTab; limit?: number },
): Promise<SearchResult> {
  const limit = options?.limit ?? 5
  const tab = options?.tab ?? 'all'

  const textFilter = {
    OR: [
      { title: { contains: query, mode: 'insensitive' as const } },
      { content: { contains: query, mode: 'insensitive' as const } },
    ],
    status: 'PUBLISHED' as const,
  }

  // findMany + count를 단일 Promise.all로 병렬 실행 (Waterfall 제거)
  const [[jobs, jobCount], [posts, postCount], [magazine, magazineCount]] = await Promise.all([
    tab === 'all' || tab === 'jobs'
      ? Promise.all([
          prisma.post.findMany({
            where: { ...textFilter, boardType: 'JOB' },
            select: postSelect,
            orderBy: { createdAt: 'desc' },
            take: tab === 'jobs' ? 20 : limit,
          }),
          prisma.post.count({ where: { ...textFilter, boardType: 'JOB' } }),
        ])
      : Promise.resolve([[], 0] as const),

    tab === 'all' || tab === 'posts'
      ? Promise.all([
          prisma.post.findMany({
            where: { ...textFilter, boardType: { in: ['STORY', 'HUMOR', 'LIFE2'] } },
            select: postSelect,
            orderBy: { createdAt: 'desc' },
            take: tab === 'posts' ? 20 : limit,
          }),
          prisma.post.count({ where: { ...textFilter, boardType: { in: ['STORY', 'HUMOR', 'LIFE2'] } } }),
        ])
      : Promise.resolve([[], 0] as const),

    tab === 'all' || tab === 'magazine'
      ? Promise.all([
          prisma.post.findMany({
            where: { ...textFilter, boardType: 'MAGAZINE' },
            select: postSelect,
            orderBy: { createdAt: 'desc' },
            take: tab === 'magazine' ? 20 : limit,
          }),
          prisma.post.count({ where: { ...textFilter, boardType: 'MAGAZINE' } }),
        ])
      : Promise.resolve([[], 0] as const),
  ])

  return {
    jobs: { items: jobs.map(toPostSummary), total: jobCount },
    posts: { items: posts.map(toPostSummary), total: postCount },
    magazine: { items: magazine.map(toPostSummary), total: magazineCount },
    totalCount: jobCount + postCount + magazineCount,
  }
}

/* ── 인기 검색어 (최근 7일 기준 EventLog 집계) ── */

export async function getPopularKeywords(limit = 10): Promise<string[]> {
  const rows = await prisma.eventLog.groupBy({
    by: ['properties'],
    where: {
      eventName: 'search',
      createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
    },
    _count: { id: true },
    orderBy: { _count: { id: 'desc' } },
    take: limit,
  })

  return rows
    .map((r) => {
      const props = r.properties as Record<string, unknown> | null
      return typeof props?.query === 'string' ? props.query : null
    })
    .filter((v): v is string => v !== null)
}

/* ── 검색 이벤트 로깅 ── */

export async function logSearchEvent(query: string, userId?: string): Promise<void> {
  await prisma.eventLog.create({
    data: {
      eventName: 'search',
      userId: userId ?? null,
      properties: { query },
    },
  }).catch(() => {})
}
