import type { BoardType } from '@/generated/prisma/client'

export type HomeTrendingBoardType = Extract<BoardType, 'MENOPAUSE' | 'STORY' | 'LIFE2' | 'HUMOR'>

export interface HomeTrendingQuotaConfig {
  boardType: HomeTrendingBoardType
  quota: number
  fetchLimit: number
}

export interface ScoredHomeTrendingPost<T extends { id: string }> {
  post: T
  score: number
}

/**
 * 홈 "지금 뜨는 이야기" 운영 쿼터.
 * 갱년기톡을 핵심 탭으로 노출하되, 부족한 슬롯은 공급량이 가장 안정적인 사는이야기가 채운다.
 */
export const HOME_TRENDING_QUOTAS = [
  { boardType: 'MENOPAUSE', quota: 2, fetchLimit: 4 },
  { boardType: 'STORY', quota: 4, fetchLimit: 10 },
  { boardType: 'LIFE2', quota: 2, fetchLimit: 4 },
  { boardType: 'HUMOR', quota: 2, fetchLimit: 4 },
] as const satisfies readonly HomeTrendingQuotaConfig[]

export const HOME_TRENDING_FALLBACK_BOARD: HomeTrendingBoardType = 'STORY'

export const HOME_TRENDING_TOTAL = HOME_TRENDING_QUOTAS.reduce(
  (sum, item) => sum + item.quota,
  0,
)

function sortByScoreDesc<T extends { id: string }>(
  posts: readonly ScoredHomeTrendingPost<T>[],
): ScoredHomeTrendingPost<T>[] {
  return [...posts].sort((a, b) => b.score - a.score)
}

export function selectHomeTrendingPosts<T extends { id: string }>(
  pools: Partial<Record<HomeTrendingBoardType, readonly ScoredHomeTrendingPost<T>[]>>,
): T[] {
  const selected: ScoredHomeTrendingPost<T>[] = []
  const usedIds = new Set<string>()

  const takeFromBoard = (boardType: HomeTrendingBoardType, count: number) => {
    if (count <= 0) return

    let taken = 0
    for (const candidate of sortByScoreDesc(pools[boardType] ?? [])) {
      if (selected.length >= HOME_TRENDING_TOTAL) return
      if (usedIds.has(candidate.post.id)) continue

      selected.push(candidate)
      usedIds.add(candidate.post.id)

      taken += 1
      if (taken >= count) return
    }
  }

  for (const item of HOME_TRENDING_QUOTAS) {
    takeFromBoard(item.boardType, item.quota)
  }

  takeFromBoard(HOME_TRENDING_FALLBACK_BOARD, HOME_TRENDING_TOTAL - selected.length)

  return selected
    .sort((a, b) => b.score - a.score)
    .slice(0, HOME_TRENDING_TOTAL)
    .map(item => item.post)
}
