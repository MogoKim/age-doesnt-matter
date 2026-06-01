import type { Metadata } from 'next'
import { getContentList } from '@/lib/queries/admin'
import { getAllBoardConfigs } from '@/lib/queries/boards'
import type { ContentSortType, BotTypeFilter } from '@/lib/queries/admin/admin.content'
import type { BoardType, PostSource, PostStatus } from '@/generated/prisma/client'
import nextDynamic from 'next/dynamic'
import ExpireJobsButton from '@/components/admin/ExpireJobsButton'
import ContentNavTabs from '@/components/admin/ContentNavTabs'

const ContentTable = nextDynamic(() => import('@/components/admin/ContentTable'), {
  loading: () => <div className="h-64 animate-pulse rounded bg-zinc-100" />,
})

export const metadata: Metadata = { title: '콘텐츠 관리' }
export const dynamic = 'force-dynamic'

const VALID_SORTS: ContentSortType[] = ['latest', 'likes', 'comments', 'views']
function parseSort(s?: string): ContentSortType | undefined {
  return VALID_SORTS.includes(s as ContentSortType) ? (s as ContentSortType) : undefined
}

const VALID_BOT_TYPES: BotTypeFilter[] = ['user', 'seed', 'curate', 'sheet', 'admin']
function parseBotType(s?: string): BotTypeFilter | undefined {
  return VALID_BOT_TYPES.includes(s as BotTypeFilter) ? (s as BotTypeFilter) : undefined
}

interface Props {
  searchParams: Promise<{
    board?: string
    status?: string
    source?: string
    botType?: string
    search?: string
    cursor?: string
    sort?: string
  }>
}

export default async function AdminContentPage({ searchParams }: Props) {
  const params = await searchParams
  const [{ posts, hasMore }, boardConfigs] = await Promise.all([
    getContentList({
      boardType: params.board as BoardType | undefined,
      status: params.status as PostStatus | undefined,
      source: params.source as PostSource | undefined,
      botType: parseBotType(params.botType),
      search: params.search,
      cursor: params.cursor,
      sort: parseSort(params.sort),
    }),
    getAllBoardConfigs(),
  ])

  return (
    <div className="space-y-4">
      <ContentNavTabs />
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
          botType: params.botType,
          search: params.search,
          sort: params.sort,
        }}
        boardConfigs={boardConfigs.map((c) => ({ boardType: c.boardType, categories: c.categories }))}
      />
    </div>
  )
}
