import { prisma } from '@/lib/prisma'

export interface BannerSlide {
  id: string
  title: string
  subtitle: string | null
  themeColor: string
  themeColorMid: string | null
  themeColorEnd: string | null
  ctaText: string | null
  ctaUrl: string | null
}

/** 활성 히어로 배너 조회 — Phase 1 신규 스키마 기반 (그라디언트 전용, imageUrl 미사용) */
export async function getActiveBanners(): Promise<BannerSlide[]> {
  const now = new Date()

  const banners = await prisma.banner.findMany({
    where: {
      slot: 'HERO',
      isActive: true,
      OR: [
        { startsAt: null },
        { startsAt: { lte: now } },
      ],
      AND: [
        {
          OR: [
            { endsAt: null },
            { endsAt: { gte: now } },
          ],
        },
      ],
    },
    orderBy: { displayOrder: 'asc' },
    take: 5,
    select: {
      id: true,
      title: true,
      subtitle: true,
      themeColor: true,
      themeColorMid: true,
      themeColorEnd: true,
      ctaText: true,
      ctaUrl: true,
    },
  })

  return banners
}
