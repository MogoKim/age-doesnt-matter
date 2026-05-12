import { Suspense } from 'react'
import PaginationBar from '@/components/features/common/PaginationBar'
import CategorySearchBar from '@/components/features/community/CategorySearchBar'

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
      <Suspense fallback={null}>
        <CategorySearchBar />
      </Suspense>
    </div>
  )
}
