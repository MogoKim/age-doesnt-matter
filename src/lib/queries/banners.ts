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
  /** 시스템 텍스트(제목·부제·CTA·어두운 그라디언트)를 이미지 위에 겹칠지 */
  showOverlay: boolean
}

/** 활성 히어로 배너 조회 — 배너 수정 시 hero-banners 태그로 즉시 무효화 */
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
        showOverlay: true,
      },
    })

    return banners.map((banner) => ({
      ...banner,
      imageUrl: banner.imageUrl.trim().length > 0 ? banner.imageUrl : null,
    }))
  },
  ['hero-banners'],
  { revalidate: 300, tags: ['hero-banners'] },
)
