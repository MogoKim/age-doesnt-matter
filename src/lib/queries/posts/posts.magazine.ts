import { unstable_cache } from 'next/cache'
import { prisma } from '@/lib/prisma'
import type { PostSummary } from '@/types/api'
import {
  getMagazineTopicTitleKeywords,
  sortMagazineRelatedPostsByTopic,
  type MagazineTopicHubId,
} from '@/lib/seo/magazine-topic-link'
import { postSelect, toPostSummary, buildTextSearch, SearchField } from './posts.base'

/* ── 관련 매거진 (내부 링크용) ── */

async function _getRelatedMagazinePosts(
  category: string | null,
  excludeId: string,
  limit = 3,
  titleKeywords?: string[],  // 제목 키워드 (시리즈명, 주요 단어)
  seriesId?: string | null,  // 이미 알고 있으면 DB 조회 생략 (Q1 제거)
  topicHubId?: MagazineTopicHubId | null,
): Promise<PostSummary[]> {
  // 1순위: 같은 시리즈 내 다른 편 (seriesId 기반)
  const resolvedSeriesId = seriesId !== undefined
    ? seriesId
    : (await prisma.post.findUnique({ where: { id: excludeId }, select: { seriesId: true } }))?.seriesId ?? null

  if (resolvedSeriesId) {
    // Q2 + Q3 병렬 실행 후 메모리 결합 (waterfall 제거)
    const [seriesRows, categoryRows] = await Promise.all([
      prisma.post.findMany({
        where: {
          boardType: 'MAGAZINE',
          status: 'PUBLISHED',
          id: { not: excludeId },
          seriesId: resolvedSeriesId,
        },
        orderBy: { seriesOrder: 'asc' },
        take: limit,
        select: postSelect,
      }),
      prisma.post.findMany({
        where: {
          boardType: 'MAGAZINE',
          status: 'PUBLISHED',
          id: { not: excludeId },
          ...(category ? { category } : {}),
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
        select: postSelect,
      }),
    ])
    if (seriesRows.length >= limit) return seriesRows.map(toPostSummary)

    const seriesIdSet = new Set(seriesRows.map(r => r.id))
    const filteredCategory = sortMagazineRelatedPostsByTopic(
      categoryRows.filter(r => !seriesIdSet.has(r.id)).map(toPostSummary),
      topicHubId,
    )
    const remainingLimit = limit - seriesRows.length
    return [...seriesRows.map(toPostSummary), ...filteredCategory.slice(0, remainingLimit)]
  }

  // 2순위: 제목 키워드 매칭 (같은 카테고리 내)
  const topicKeywords = getMagazineTopicTitleKeywords(topicHubId, 8)
  const keywordTerms = Array.from(new Set([...(titleKeywords ?? []).slice(0, 3), ...topicKeywords]))

  if (keywordTerms.length > 0) {
    const keywordRows = await prisma.post.findMany({
      where: {
        boardType: 'MAGAZINE',
        status: 'PUBLISHED',
        id: { not: excludeId },
        ...(category ? { category } : {}),
        OR: keywordTerms.map(kw => ({ title: { contains: kw } })),
      },
      orderBy: { createdAt: 'desc' },
      take: topicHubId ? limit * 2 : limit,
      select: postSelect,
    })
    const sortedKeywordRows = sortMagazineRelatedPostsByTopic(keywordRows.map(toPostSummary), topicHubId)
    if (sortedKeywordRows.length >= limit) return sortedKeywordRows.slice(0, limit)

    // 키워드 매칭이 부족하면 같은 카테고리로 채움
    const remainingLimit = limit - sortedKeywordRows.length
    const categoryRows = await prisma.post.findMany({
      where: {
        boardType: 'MAGAZINE',
        status: 'PUBLISHED',
        id: { notIn: [excludeId, ...sortedKeywordRows.map(r => r.id)] },
        ...(category ? { category } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: topicHubId ? remainingLimit * 2 : remainingLimit,
      select: postSelect,
    })
    const sortedCategoryRows = sortMagazineRelatedPostsByTopic(categoryRows.map(toPostSummary), topicHubId)
    return [...sortedKeywordRows, ...sortedCategoryRows.slice(0, remainingLimit)]
  }

  // 3순위: 카테고리 기반 (기존 방식)
  const rows = await prisma.post.findMany({
    where: {
      boardType: 'MAGAZINE',
      status: 'PUBLISHED',
      id: { not: excludeId },
      ...(category ? { category } : {}),
    },
    orderBy: { createdAt: 'desc' },
    take: topicHubId ? limit * 2 : limit,
    select: postSelect,
  })
  return sortMagazineRelatedPostsByTopic(rows.map(toPostSummary), topicHubId).slice(0, limit)
}
export const getRelatedMagazinePosts = unstable_cache(
  _getRelatedMagazinePosts,
  ['related-magazine-posts'],
  { revalidate: 300 },
)

/* ── 매거진 최신글 ── */

async function _getLatestMagazinePosts(limit = 4): Promise<PostSummary[]> {
  const rows = await prisma.post.findMany({
    where: {
      status: 'PUBLISHED',
      boardType: 'MAGAZINE',
    },
    select: postSelect,
    orderBy: { createdAt: 'desc' },
    take: limit,
  })

  return rows.map(toPostSummary)
}
export const getLatestMagazinePosts = unstable_cache(
  _getLatestMagazinePosts,
  ['latest-magazine-posts'],
  { revalidate: 60 },
)

/* ── 매거진 목록 (카테고리 필터) ── */

export async function getMagazineList(
  options?: { category?: string; cursor?: string; limit?: number; q?: string; sf?: SearchField },
): Promise<{ posts: PostSummary[]; hasMore: boolean }> {
  const limit = options?.limit ?? 10

  const where = {
    boardType: 'MAGAZINE' as const,
    status: 'PUBLISHED' as const,
    NOT: { content: '' },
    ...(options?.category && options.category !== '전체' ? { category: options.category } : {}),
    ...(options?.cursor ? { id: { lt: options.cursor } } : {}),
    ...buildTextSearch(options?.q, options?.sf),
  }

  const rows = await prisma.post.findMany({
    where,
    select: postSelect,
    orderBy: { createdAt: 'desc' },
    take: limit + 1,
  })

  const hasMore = rows.length > limit
  return { posts: rows.slice(0, limit).map(toPostSummary), hasMore }
}

/* ── 매거진 목록 (번호 페이지네이션) ── */

export async function getMagazineListPage(
  options?: { category?: string; skip?: number; limit?: number; q?: string; sf?: SearchField },
): Promise<{ posts: PostSummary[]; total: number }> {
  const limit = options?.limit ?? 12
  const skip = options?.skip ?? 0

  const where = {
    boardType: 'MAGAZINE' as const,
    status: 'PUBLISHED' as const,
    NOT: { content: '' },
    ...(options?.category && options.category !== '전체' ? { category: options.category } : {}),
    ...buildTextSearch(options?.q, options?.sf),
  }

  const [rows, total] = await Promise.all([
    prisma.post.findMany({ where, select: postSelect, orderBy: { createdAt: 'desc' }, skip, take: limit }),
    prisma.post.count({ where }),
  ])

  return { posts: rows.map(toPostSummary), total }
}

export const getCachedMagazinePage = unstable_cache(
  () => getMagazineListPage({ skip: 0, limit: 12 }),
  ['magazine-list-page1'],
  { revalidate: 60, tags: ['magazine-list'] },
)
