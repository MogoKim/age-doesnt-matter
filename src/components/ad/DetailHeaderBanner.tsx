import { prisma } from '@/lib/prisma'
import DetailHeaderBannerClient from './DetailHeaderBannerClient'
import type { DetailHeaderBannerItem } from './DetailHeaderBannerClient'

/**
 * 상세 글 상단 띠배너 (아이콘 메뉴 아래, 뒤로가기 위).
 *
 * 목록 띠배너(ListBanner, LIST_HEADER, 3:1)와 같은 자리처럼 보이지만 다른 구좌다.
 *   - 규격 5:1  (목록은 3:1)
 *   - 노출 경로 동적 상세  (목록은 고정 7경로)
 * 컴포넌트를 나눈 이유: 한 컴포넌트로 합치면 비율·경로·라벨이 뒤섞여
 * 광고주 소재가 잘리는 사고가 난다. 조회·링크·계측 규칙만 공유한다.
 *
 * 이 구좌는 기존 게시판 소개 배너(IdentityBanner)를 대체한다 — 둘은 공존하지 않는다.
 * 노출 추적은 클라가 실제 표시 시 /api/ad-impression 으로 한다
 * (전 페이지 공통 셸이라 서버에서 세면 안 보이는 화면까지 카운트된다).
 */
export default async function DetailHeaderBanner() {
  const now = new Date()

  let banners: DetailHeaderBannerItem[]
  try {
    banners = await prisma.adBanner.findMany({
      where: {
        slot: 'DETAIL_HEADER',
        isActive: true,
        startDate: { lte: now },
        endDate: { gte: now },
      },
      // priority 높은 것이 먼저 — 광고 슬롯 기존 규칙(홈 히어로의 displayOrder와 방향이 반대다).
      // 동점이면 먼저 등록한 것이 앞: 정렬이 흔들리면 롤링 순서가 매번 바뀐다.
      orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
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
  } catch (error) {
    if (process.env.CI !== 'true') {
      console.warn('[ads] DETAIL_HEADER 배너 조회 실패', error)
    }
    return null
  }

  if (banners.length === 0) return null

  return <DetailHeaderBannerClient banners={banners} />
}
