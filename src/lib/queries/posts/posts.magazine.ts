import { prisma } from '@/lib/prisma'
import type { PostSummary } from '@/types/api'
import { postSelect, toPostSummary, buildTextSearch, SearchField } from './posts.base'

/* ── 관련 매거진 (내부 링크용) ── */

export async function getRelatedMagazinePosts(
  category: string | null,
  excludeId: string,
  limit = 3,
): Promise<PostSummary[]> {
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
