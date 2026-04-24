import type { Metadata } from 'next'
import { getContentList } from '@/lib/queries/admin'
import type { BoardType, PostSource, PostStatus } from '@/generated/prisma/client'
import ContentTable from '@/components/admin/ContentTable'
import ExpireJobsButton from '@/components/admin/ExpireJobsButton'

export const metadata: Metadata = { title: '콘텐츠 관리' }
export const dynamic = 'force-dynamic'

interface Props {
  searchParams: Promise<{
    board?: string
    status?: string
    source?: string
    search?: string
    cursor?: string
  }>
}

export default async function AdminContentPage({ searchParams }: Props) {
  const params = await searchParams
  const { posts, hasMore } = await getContentList({
    boardType: params.board as BoardType | undefined,
    status: params.status as PostStatus | undefined,
    source: params.source as PostSource | undefined,
    search: params.search,
    cursor: params.cursor,
  })

  return (
    <div className="space-y-4">
      {/* 일자리 탭 선택 시 만료 처리 버튼 노출 */}
      {params.board === 'JOB' && (
        <div className="flex items-center justify-between rounded-xl border border-yellow-200 bg-yellow-50 px-5 py-3">
          <p className="text-sm text-yellow-800">
            만료된 일자리 공고(expiresAt 경과)를 일괄 숨김 처리할 수 있습니다.
          </p>
          <ExpireJobsButton />
        </div>
      )}
      <ContentTable
        posts={posts}
        hasMore={hasMore}
        filters={{
          board: params.board,
          status: params.status,
          source: params.source,
          search: params.search,
        }}
      />
    </div>
  )
}
