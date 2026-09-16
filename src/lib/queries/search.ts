import { unstable_cache } from 'next/cache'
import { prisma } from '@/lib/prisma'
import type { BoardType } from '@/generated/prisma/client'
import { EXCLUDE_GREETING } from '@/lib/greeting'
import { EXCLUDE_EVENT } from '@/lib/event-category'
import type { PostSummary } from '@/types/api'
import { toUserSummaryBase, toPostSummaryCore } from './posts/posts.base'

/**
 * 검색 '게시글' 탭 대상 커뮤니티 게시판.
 * findMany와 count 두 곳에서 쓰므로 상수로 고정한다 — 한쪽만 바꾸면 목록과 건수가 어긋난다.
 * (MENOPAUSE 누락으로 갱년기톡 글이 검색에 안 잡히던 것을 2026-07-27 보강)
 */
const COMMUNITY_SEARCH_BOARDS: BoardType[] = ['STORY', 'HUMOR', 'LIFE2', 'MENOPAUSE']

/* ── 헬퍼 (posts.ts와 동일 패턴) ── */

/**
 * 공통 매핑을 그대로 쓴다.
 *
 * 🔴 글 목록의 `toUserSummary`(탈퇴 마스킹 포함)를 쓰지 않는다 — 여기는 저장된 값을
 *    그대로 보여주는 것이 **기존 표시 정책**이고, 리팩토링으로 바꾸지 않는다.
 */
export const toUserSummary = toUserSummaryBase

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
  trendingScore: true,
  createdAt: true,
  author: {
    select: { id: true, nickname: true, grade: true, profileImage: true, status: true },
  },
} as const

export function toPostSummary(post: {
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
  trendingScore: number
  createdAt: Date
  author: { id: string; nickname: string; grade: string; profileImage: string | null }
}): PostSummary {
  // 🔴 `slug`·`hotPromotedAt`·`isPinned` 를 넣지 않는다 — 검색 결과의 기존 payload 에 없던 키다.
  return toPostSummaryCore(
    post,
    toUserSummary(post.author),
    post.promotionLevel as PostSummary['promotionLevel'],
  )
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
            where: { ...textFilter, boardType: { in: COMMUNITY_SEARCH_BOARDS }, AND: [EXCLUDE_GREETING, EXCLUDE_EVENT] },
            select: postSelect,
            orderBy: { createdAt: 'desc' },
            take: tab === 'posts' ? 20 : limit,
          }),
          prisma.post.count({ where: { ...textFilter, boardType: { in: COMMUNITY_SEARCH_BOARDS }, AND: [EXCLUDE_GREETING, EXCLUDE_EVENT] } }),
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

async function _getPopularKeywords(limit = 10): Promise<string[]> {
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

export const getPopularKeywords = unstable_cache(
  _getPopularKeywords,
  ['popular-keywords'],
  { revalidate: 3600 },
)

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
