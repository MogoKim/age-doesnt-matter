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

export async function getGuestPromoSettings() {
  const rows = await prisma.setting.findMany({
    where: {
      key: {
        in: [
          'TOP_PROMO_GUEST_ENABLED',
          'TOP_PROMO_GUEST_TAG',
          'TOP_PROMO_GUEST_TEXT',
          'TOP_PROMO_GUEST_HREF',
        ],
      },
    },
  })
  const map: Record<string, string> = {}
  for (const row of rows) map[row.key] = row.value
  return {
    enabled: map['TOP_PROMO_GUEST_ENABLED'] !== 'false',
    tag:     map['TOP_PROMO_GUEST_TAG']  ?? '',
    text:    map['TOP_PROMO_GUEST_TEXT'] ?? '',
    href:    map['TOP_PROMO_GUEST_HREF'] ?? '/about',
  }
}

export async function getMemberPromoSettings() {
  const rows = await prisma.setting.findMany({
    where: {
      key: {
        in: [
          'TOP_PROMO_MEMBER_ENABLED',
          'TOP_PROMO_MEMBER_TAG',
          'TOP_PROMO_MEMBER_TEXT',
          'TOP_PROMO_MEMBER_HREF',
        ],
      },
    },
  })
  const map: Record<string, string> = {}
  for (const row of rows) map[row.key] = row.value
  return {
    enabled: map['TOP_PROMO_MEMBER_ENABLED'] !== 'false',
    tag:     map['TOP_PROMO_MEMBER_TAG']  ?? '',
    text:    map['TOP_PROMO_MEMBER_TEXT'] ?? '',
    href:    map['TOP_PROMO_MEMBER_HREF'] ?? '/',
  }
}
