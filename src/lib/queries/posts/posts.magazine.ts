import { prisma } from '@/lib/prisma'
import type { PostSummary } from '@/types/api'
import { postSelect, toPostSummary, buildTextSearch, SearchField } from './posts.base'

/* ── 관련 매거진 (내부 링크용) ── */

export async function getRelatedMagazinePosts(
  category: string | null,
  excludeId: string,
  limit = 3,
  titleKeywords?: string[],  // 제목 키워드 (시리즈명, 주요 단어)
  seriesId?: string | null,  // 이미 알고 있으면 DB 조회 생략 (Q1 제거)
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
    const filteredCategory = categoryRows.filter(r => !seriesIdSet.has(r.id))
    const remainingLimit = limit - seriesRows.length
    return [...seriesRows, ...filteredCategory.slice(0, remainingLimit)].map(toPostSummary)
  }

  // 2순위: 제목 키워드 매칭 (같은 카테고리 내)
  if (titleKeywords && titleKeywords.length > 0) {
    const keywordRows = await prisma.post.findMany({
      where: {
        boardType: 'MAGAZINE',
        status: 'PUBLISHED',
        id: { not: excludeId },
        ...(category ? { category } : {}),
        OR: titleKeywords.slice(0, 3).map(kw => ({ title: { contains: kw } })),
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: postSelect,
    })
    if (keywordRows.length >= limit) return keywordRows.map(toPostSummary)

    // 키워드 매칭이 부족하면 같은 카테고리로 채움
    const remainingLimit = limit - keywordRows.length
    const categoryRows = await prisma.post.findMany({
      where: {
        boardType: 'MAGAZINE',
        status: 'PUBLISHED',
        id: { notIn: [excludeId, ...keywordRows.map(r => r.id)] },
        ...(category ? { category } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: remainingLimit,
      select: postSelect,
    })
    return [...keywordRows, ...categoryRows].map(toPostSummary)
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
    take: limit,
    select: postSelect,
  })
  return rows.map(toPostSummary)
}

/* ── 매거진 최신글 ── */

export async function getLatestMagazinePosts(limit = 4): Promise<PostSummary[]> {
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
