import { prisma } from '@/lib/prisma'
import type { AdSlot } from '@/generated/prisma/client'

// ─── 히어로 배너 ───

export async function getBannerList() {
  return prisma.banner.findMany({
    orderBy: [{ priority: 'asc' }, { createdAt: 'desc' }],
  })
}

export async function getBannerById(id: string) {
  return prisma.banner.findUnique({ where: { id } })
}

// ─── 광고 배너 ───

export interface AdBannerListOptions {
  slot?: AdSlot
  cursor?: string
  limit?: number
}

export async function getAdBannerList(options: AdBannerListOptions = {}) {
  const { slot, cursor, limit = 20 } = options

  const where = {
    ...(slot && { slot }),
    ...(cursor && { createdAt: { lt: new Date(cursor) } }),
  }

  const ads = await prisma.adBanner.findMany({
    where,
    orderBy: [{ slot: 'asc' }, { priority: 'asc' }, { createdAt: 'desc' }],
    take: limit + 1,
  })

  const hasMore = ads.length > limit
  if (hasMore) ads.pop()

  return { ads, hasMore }
}
