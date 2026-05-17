import { Suspense } from 'react'
import PaginationBar from '@/components/features/common/PaginationBar'
import CategorySearchBar from '@/components/features/community/CategorySearchBar'
import AdSenseUnit from '@/components/ad/AdSenseUnit'
import { ADSENSE } from '@/components/ad/ad-slots'

interface Props {
  total: number
  page: number
  pageSize: number
  buildHref: (page: number) => string
}

export default function BoardPaginationFooter({ total, page, pageSize, buildHref }: Props) {
  const totalPages = Math.ceil(total / pageSize)

  return (
    <div>
      <PaginationBar currentPage={page} totalPages={totalPages} buildHref={buildHref} />

      {/* 페이지네이션 하단 광고 — 모바일: 반응형 / 데스크탑: 728×90 */}
      <div className="block lg:hidden">
        <AdSenseUnit
          slotId={ADSENSE.LIST_PAGINATION_BOTTOM}
          format="auto"
          responsive={true}
          className="mt-1"
        />
      </div>
      <div className="hidden lg:flex justify-center">
        <AdSenseUnit
          slotId={ADSENSE.LIST_PAGINATION_BOTTOM}
          fixedWidth={728}
          fixedHeight={90}
          className="mt-1"
        />
      </div>

      <Suspense fallback={null}>
        <CategorySearchBar />
      </Suspense>
    </div>
  )
}
