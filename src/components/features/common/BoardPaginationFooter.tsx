import { Suspense } from 'react'
import PaginationBar from '@/components/features/common/PaginationBar'
import CategorySearchBar from '@/components/features/community/CategorySearchBar'

interface Props {
  total: number
  page: number
  pageSize: number
  buildHref: (page: number) => string
}

// 목록 하단 조작부 v1 — 순서: 페이지 이동 → 검색 → 하단 여백(FAB 미겹침).
//  광고는 이번 범위 미구현. 과거 LIST_PAGINATION_BOTTOM AdSenseUnit(슬롯 미발급 REPLACE_WITH_SLOT_ID)은
//  페이지 버튼 바로 아래 붙어 오클릭 유도 우려 + 정책 리스크가 있어 제거. (향후 광고는 별도 단계에서 분리된 위치로 검토)
export default function BoardPaginationFooter({ total, page, pageSize, buildHref }: Props) {
  const totalPages = Math.ceil(total / pageSize)

  return (
    <div>
      <PaginationBar currentPage={page} totalPages={totalPages} buildHref={buildHref} />

      <Suspense fallback={null}>
        <CategorySearchBar />
      </Suspense>

      {/* FAB(글쓰기)와 겹치지 않도록 하단 여백 확보 */}
      <div className="h-20" aria-hidden="true" />
    </div>
  )
}
