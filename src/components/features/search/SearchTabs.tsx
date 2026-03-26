'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { cn } from '@/lib/utils'
import type { SearchTab } from '@/lib/queries/search'

const TABS: { key: SearchTab; label: string }[] = [
  { key: 'all', label: '전체' },
  { key: 'jobs', label: '일자리' },
  { key: 'posts', label: '게시글' },
  { key: 'magazine', label: '매거진' },
]

interface SearchTabsProps {
  activeTab: SearchTab
  query: string
}

export default function SearchTabs({ activeTab, query }: SearchTabsProps) {
  const router = useRouter()
  const searchParams = useSearchParams()

  function handleTabClick(tab: SearchTab) {
    const params = new URLSearchParams(searchParams.toString())
    if (tab === 'all') {
      params.delete('tab')
    } else {
      params.set('tab', tab)
    }
    params.set('q', query)
    router.push(`/search?${params.toString()}`)
  }

  return (
    <div className="flex border-b border-border bg-card overflow-x-auto">
      {TABS.map((tab) => (
        <button
          key={tab.key}
          type="button"
          onClick={() => handleTabClick(tab.key)}
          className={cn(
            'flex-1 min-w-fit px-4 py-3 min-h-[52px] text-body font-medium whitespace-nowrap transition-colors',
            activeTab === tab.key
              ? 'text-primary border-b-2 border-primary'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {tab.label}
        </button>
      ))}
    </div>
  )
}
