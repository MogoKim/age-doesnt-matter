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
      },
    })

    // 히어로 배너 v2 정책은 이미지 없는 그라디언트 배너다.
    // 기존 DB 행에 남아 있는 legacy imageUrl이 색상 수정을 가리지 않도록 렌더 경로에서 차단한다.
    return banners.map((banner) => ({ ...banner, imageUrl: null }))
  },
  ['hero-banners'],
  { revalidate: 300, tags: ['hero-banners'] },
)
