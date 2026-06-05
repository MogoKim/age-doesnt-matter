import type { Metadata } from 'next'
import type { AdSlot } from '@/generated/prisma/client'
import { getBannerList, getAdBannerList, getGuestPromoSettings, getMemberPromoSettings } from '@/lib/queries/admin'
import dynamic from 'next/dynamic'

const BannerManager = dynamic(() => import('@/components/admin/BannerManager'), {
  loading: () => <div className="h-64 animate-pulse rounded bg-zinc-100" />,
})
const AdBannerTable = dynamic(() => import('@/components/admin/AdBannerTable'), {
  loading: () => <div className="h-40 animate-pulse rounded bg-zinc-100" />,
})
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
          <p className="font-semibold">📋 최상단 띠 배너 운영 가이드 (담당자 필독)</p>
          <ul className="space-y-1 list-none pl-0 text-blue-700">
            <li>• <strong>비회원 배너 / 회원 배너</strong>는 따로 운영됩니다 — 각각 켜고 끄고 저장(한쪽이 다른 쪽에 영향 없음). 비회원=로그인 전 방문자, 회원=로그인한 사람.</li>
            <li>• <strong>태그</strong>: 본문 앞 강조 칩, 최대 4자(예: 가입·공지·이벤트). <strong>텍스트</strong>: 핵심 문구, 최대 20자(모바일 1줄 기준).</li>
            <li>• <strong>링크 유형 3가지</strong> — 배너를 눌렀을 때:</li>
            <li className="pl-4">– <strong>내부 경로</strong>: 사이트 안 페이지로 이동(<code>/login</code>, <code>/about</code> 등) · 같은 탭</li>
            <li className="pl-4">– <strong>외부 URL</strong>: 다른 사이트로 이동(<code>https://</code>) · 새 탭</li>
            <li className="pl-4">– <strong>카카오톡 공유</strong>: 친구에게 우나어를 공유(초대) · 입력값 없음(홈 고정) · 회원이 공유하면 누가 초대했는지 자동 추적</li>
            <li>• <strong>노출 조건</strong>: 활성 ON + 텍스트 있음 (꺼져 있거나 텍스트가 비면 배너 숨김). 저장 후 <strong>약 1분</strong> 내 사이트 반영.</li>
            <li>• 각 칸의 <strong>?</strong> 에 마우스를 올리면 자세한 설명이 나옵니다.</li>
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
