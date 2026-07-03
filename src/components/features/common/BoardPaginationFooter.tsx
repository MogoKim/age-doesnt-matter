import { Suspense } from 'react'
import PaginationBar from '@/components/features/common/PaginationBar'
import CategorySearchBar from '@/components/features/community/CategorySearchBar'
import NativeAdSlot from '@/components/ad/NativeAdSlot'
import AdSenseUnit from '@/components/ad/AdSenseUnit'
import { ADSENSE } from '@/components/ad/ad-slots'

interface Props {
  total: number
  page: number
  pageSize: number
  buildHref: (page: number) => string
}

// 목록 하단 조작부 v1 — 순서: 검색 → 페이지 이동(B3 트레이) → 페이지 이동 직후 인접 광고 → 하단 여백(FAB 미겹침).
//  광고: 웹=AdSense(LIST_PAGINATION_BOTTOM, format=auto) / 앱=AdMob Native(NATIVE_INFEED 재사용, 230px).
//  배치: PaginationBar 트레이(py-[18px])는 건드리지 않고, 광고 wrapper를 -mt로 위로 당겨
//   페이지 이동 직후 인접 배치(버튼 하단 → 광고 상단 ≈ 7px). 버튼(52px) 터치 영역과는 겹치지 않는다.
export default function BoardPaginationFooter({ total, page, pageSize, buildHref }: Props) {
  const totalPages = Math.ceil(total / pageSize)

  return (
    <div>
      <Suspense fallback={null}>
        <CategorySearchBar />
      </Suspense>

      <PaginationBar currentPage={page} totalPages={totalPages} buildHref={buildHref} />

      {/* 페이지 이동 직후 인접 광고 — 트레이 하단 여백(18px) 안으로 -11px 당겨 버튼→광고 ≈ 7px.
          웹=AdSense responsive(광고 라벨 내장, unfilled 시 Coupang 폴백) / 앱=AdMob Native 230px(no-fill 시 접힘). */}
      <div className="-mt-[11px]">
        <NativeAdSlot
          slotId="list-pagination-bottom"
          minHeight={230}
          fallback={
            <AdSenseUnit
              slotId={ADSENSE.LIST_PAGINATION_BOTTOM}
              format="auto"
              className="rounded-2xl overflow-hidden"
            />
          }
        />
      </div>

      {/* FAB(글쓰기)와 겹치지 않도록 하단 여백 확보 */}
      <div className="h-20" aria-hidden="true" />
    </div>
  )
}
