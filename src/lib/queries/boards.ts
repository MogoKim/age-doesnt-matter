import { prisma } from '@/lib/prisma'
import type { BoardType } from '@/generated/prisma/client'
import { BOARD_SLUG_MAP } from '@/types/api'

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

/** BoardConfig를 DB에서 조회 (slug 기반) */
export async function getBoardConfig(slug: string): Promise<BoardConfigData | null> {
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
}

/** 활성 BoardConfig 전체 조회 */
export async function getAllBoardConfigs(): Promise<BoardConfigData[]> {
  const configs = await prisma.boardConfig.findMany({
    where: { isActive: true },
  })

  const slugMap: Record<string, string> = {
    STORY: 'stories',
    HUMOR: 'humor',
    MAGAZINE: 'magazine',
    JOB: 'jobs',
    WEEKLY: 'weekly',
  }

  return configs.map((c) => ({
    slug: slugMap[c.boardType] ?? c.boardType.toLowerCase(),
    boardType: c.boardType,
    displayName: c.displayName,
    description: c.description ?? '',
    categories: c.categories,
  }))
}
