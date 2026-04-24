'use client'

import { useRouter } from 'next/navigation'
import BoardConfigPanel from './BoardConfigPanel'
import BannedWordPanel from './BannedWordPanel'

const TABS = [
  { value: 'boards', label: '게시판 설정' },
  { value: 'banned', label: '금지어 관리' },
]

interface BoardConfig {
  id: string
  boardType: string
  displayName: string
  description: string | null
  categories: string[]
  writeGrade: string
  isActive: boolean
  hotThreshold: number
  fameThreshold: number
}

interface BannedWord {
  id: string
  word: string
  category: string
  isActive: boolean
  createdAt: Date
}

interface SettingsTabsProps {
  activeTab: string
  boardConfigs: BoardConfig[]
  bannedWords: BannedWord[]
  bannedWordsHasMore: boolean
  bannedWordFilters: {
    category?: string
    search?: string
  }
}

export default function SettingsTabs({
  activeTab,
  boardConfigs,
  bannedWords,
  bannedWordsHasMore,
  bannedWordFilters,
}: SettingsTabsProps) {
  const router = useRouter()

  return (
    <>
      <div className="flex gap-2">
        {TABS.map((tab) => (
          <button
            key={tab.value}
            onClick={() => router.push(`/admin/settings?tab=${tab.value}`)}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === tab.value
                ? 'bg-zinc-900 text-white'
                : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'boards' && <BoardConfigPanel configs={boardConfigs} />}
      {activeTab === 'banned' && (
        <BannedWordPanel
          words={bannedWords}
          hasMore={bannedWordsHasMore}
          filters={bannedWordFilters}
        />
      )}
    </>
  )
}
