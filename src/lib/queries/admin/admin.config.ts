import { prisma } from '@/lib/prisma'

// ─── 게시판 설정 ───

export async function getBoardConfigList() {
  return prisma.boardConfig.findMany({
    orderBy: { createdAt: 'asc' },
  })
}

export async function getBoardConfigById(id: string) {
  return prisma.boardConfig.findUnique({ where: { id } })
}

// ─── 최상단 띠 배너 설정 ───

export async function getTopPromoSettings() {
  const rows = await prisma.setting.findMany({
    where: { key: { in: ['TOP_PROMO_ENABLED', 'TOP_PROMO_TAG', 'TOP_PROMO_TEXT', 'TOP_PROMO_HREF'] } },
  })
  const map: Record<string, string> = {}
  for (const row of rows) map[row.key] = row.value
  return {
    enabled: map['TOP_PROMO_ENABLED'] !== 'false',
    tag:     map['TOP_PROMO_TAG']  ?? '',
    text:    map['TOP_PROMO_TEXT'] ?? '',
    href:    map['TOP_PROMO_HREF'] ?? '/about',
  }
}
