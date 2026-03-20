import type { Metadata } from 'next'
import type { BannedWordCategory } from '@/generated/prisma/client'
import { getBannedWordList, getBoardConfigList } from '@/lib/queries/admin'
import SettingsTabs from '@/components/admin/SettingsTabs'

export const metadata: Metadata = { title: '설정' }

interface Props {
  searchParams: Promise<{
    tab?: string
    category?: string
    search?: string
    cursor?: string
  }>
}

export default async function AdminSettingsPage({ searchParams }: Props) {
  const params = await searchParams
  const tab = params.tab || 'boards'

  const [boardConfigs, bannedWordData] = await Promise.all([
    getBoardConfigList(),
    getBannedWordList({
      category: params.category as BannedWordCategory | undefined,
      search: params.search,
      cursor: params.cursor,
    }),
  ])

  return (
    <div className="space-y-4">
      <SettingsTabs
        activeTab={tab}
        boardConfigs={boardConfigs}
        bannedWords={bannedWordData.words}
        bannedWordsHasMore={bannedWordData.hasMore}
        bannedWordFilters={{
          category: params.category,
          search: params.search,
        }}
      />
    </div>
  )
}
