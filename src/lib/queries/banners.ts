import { prisma } from '@/lib/prisma'

export interface BannerSlide {
  id: string
  title: string
  description: string | null
  imageUrl: string
  linkUrl: string | null
}

/** 활성 히어로 배너 조회 (우선순위순) */
export async function getActiveBanners(): Promise<BannerSlide[]> {
  const now = new Date()

  const banners = await prisma.banner.findMany({
    where: {
      isActive: true,
      startDate: { lte: now },
      endDate: { gte: now },
    },
    orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }],
    take: 5,
    select: {
      id: true,
      title: true,
      description: true,
      imageUrl: true,
      linkUrl: true,
    },
  })

  return banners
}
