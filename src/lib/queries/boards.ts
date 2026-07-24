import { cache } from 'react'
import { unstable_cache } from 'next/cache'
import { prisma } from '@/lib/prisma'
import type { BoardType } from '@/generated/prisma/client'
import { BOARD_SLUG_MAP } from '@/types/api'
import { BOARD_TYPE_TO_SLUG_MAP } from '@/lib/board-registry'

export interface BoardConfigData {
  slug: string
  boardType: BoardType
  displayName: string
  description: string
  categories: string[]
}

/** URL slug → BoardType 변환 */
export function slugToBoardType(slug: string): BoardType | null {
  const mapped = BOARD_SLUG_MAP[slug]
  return (mapped as BoardType) ?? null
}

/** BoardConfig를 DB에서 조회 (요청 간 1시간 캐싱 + 요청 내 중복 제거) */
const _getBoardConfigCached = unstable_cache(
  async (slug: string): Promise<BoardConfigData | null> => {
    const boardType = slugToBoardType(slug)
    if (!boardType) return null

    const config = await prisma.boardConfig.findUnique({
      where: { boardType },
    })
    if (!config || !config.isActive) return null

    return {
      slug,
      boardType: config.boardType,
      displayName: config.displayName,
      description: config.description ?? '',
      categories: config.categories,
    }
  },
  ['board-config-v2'],
  { revalidate: 3600, tags: ['board-config'] },
)

export const getBoardConfig = cache((slug: string) => _getBoardConfigCached(slug))

/** 활성 BoardConfig 전체 조회 (5분 캐싱) */
export const getAllBoardConfigs = unstable_cache(
  async (): Promise<BoardConfigData[]> => {
    const configs = await prisma.boardConfig.findMany({
      where: { isActive: true },
    })

    // SSoT: board-registry (구 로컬 중복 정의 제거 — PR-1)
    const slugMap: Record<string, string> = BOARD_TYPE_TO_SLUG_MAP

    return configs.map((c) => ({
      slug: slugMap[c.boardType] ?? c.boardType.toLowerCase(),
      boardType: c.boardType,
      displayName: c.displayName,
      description: c.description ?? '',
      categories: c.categories,
    }))
  },
  ['all-board-configs'],
  { revalidate: 300 }
)
