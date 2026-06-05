import { prisma } from '@/lib/prisma'
import ListBannerClient from './ListBannerClient'

/**
 * 목록 페이지 상단 광고 띠배너 (GNB 아래).
 * 서버에서 LIST_HEADER 슬롯의 활성·기간내 배너를 최대 3개 조회 → 클라가 경로/타겟/회전 처리.
 * 노출 추적은 클라가 실제 표시 시 /api/ad-impression 으로 수행(전 페이지 공통 셸이라 서버 카운트는 부정확).
 */
export default async function ListBanner() {
  const now = new Date()
  const banners = await prisma.adBanner.findMany({
    where: {
      slot: 'LIST_HEADER',
      isActive: true,
      startDate: { lte: now },
      endDate: { gte: now },
    },
    orderBy: { priority: 'desc' },
    take: 3,
    select: {
      id: true,
      adType: true,
      title: true,
      imageUrl: true,
      htmlCode: true,
      clickUrl: true,
      targetPath: true,
    },
  })

  if (banners.length === 0) return null

  return <ListBannerClient banners={banners} />
}
