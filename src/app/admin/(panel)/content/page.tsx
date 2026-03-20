import type { Metadata } from 'next'
import { getContentList } from '@/lib/queries/admin'
import type { BoardType, PostSource, PostStatus } from '@/generated/prisma/client'
import ContentTable from '@/components/admin/ContentTable'

export const metadata: Metadata = { title: '콘텐츠 관리' }

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
