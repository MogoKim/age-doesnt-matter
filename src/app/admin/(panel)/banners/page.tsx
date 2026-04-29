import type { Metadata } from 'next'
import type { AdSlot } from '@/generated/prisma/client'
import { getBannerList, getAdBannerList, getGuestPromoSettings, getMemberPromoSettings } from '@/lib/queries/admin'
import BannerManager from '@/components/admin/BannerManager'
import AdBannerTable from '@/components/admin/AdBannerTable'
import TopPromoBannerPanel from '@/components/admin/TopPromoBannerPanel'

export const metadata: Metadata = { title: '배너·광고 관리' }

interface Props {
  searchParams: Promise<{
    tab?: string
    slot?: string
    cursor?: string
  }>
}

export default async function AdminBannersPage({ searchParams }: Props) {
  const params = await searchParams
  const tab = params.tab || 'hero'

  if (tab === 'top-promo') {
    const [guestSettings, memberSettings] = await Promise.all([
      getGuestPromoSettings(),
      getMemberPromoSettings(),
    ])
    return (
      <div className="space-y-4">
        <BannerManager banners={[]} activeTab={tab} />
        <div className="rounded-xl border border-blue-100 bg-blue-50 p-4 text-sm text-blue-800 space-y-1.5">
          <p className="font-semibold">📋 최상단 띠 배너 운영 가이드</p>
          <ul className="space-y-1 list-none pl-0 text-blue-700">
            <li>• 태그: <strong>최대 4자</strong> (예: 가입, 공지, 이벤트)</li>
            <li>• 텍스트: <strong>최대 20자</strong> — 모바일(390px) 1줄 기준</li>
            <li>• 비회원/회원 배너는 <strong>독립적으로</strong> 운영됩니다 — 한쪽 저장이 다른 쪽에 영향 없음</li>
            <li>• 외부 URL은 클릭 시 새 탭으로 열립니다</li>
          </ul>
        </div>
        <TopPromoBannerPanel type="guest" settings={guestSettings} />
        <TopPromoBannerPanel type="member" settings={memberSettings} />
      </div>
    )
  }

  if (tab === 'hero') {
    const banners = await getBannerList()
    return (
      <div className="space-y-4">
        <BannerManager banners={banners} activeTab={tab} />
      </div>
    )
  }

  const { ads, hasMore } = await getAdBannerList({
    slot: params.slot as AdSlot | undefined,
    cursor: params.cursor,
  })

  return (
    <div className="space-y-4">
      <AdBannerTable
        ads={ads}
        hasMore={hasMore}
        activeTab={tab}
        currentSlot={params.slot}
      />
    </div>
  )
}
