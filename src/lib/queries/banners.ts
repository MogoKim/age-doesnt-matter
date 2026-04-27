import { unstable_cache } from 'next/cache'
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
  imageUrl: string | null
}

/** 활성 히어로 배너 조회 — 60초 캐시 (배너 수정 후 최대 60초 내 반영) */
export const getActiveBanners = unstable_cache(
  async (): Promise<BannerSlide[]> => {
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
        imageUrl: true,
      },
    })

    return banners
  },
  ['hero-banners'],
  { revalidate: 60 },
)
