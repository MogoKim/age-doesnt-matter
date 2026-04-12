import type { Metadata } from 'next'
import { Suspense } from 'react'

export const metadata: Metadata = {
  title: '검색',
  description: '우나어에서 일자리, 커뮤니티 글, 매거진을 검색하세요.',
  alternates: { canonical: 'https://age-doesnt-matter.com/search' },
}
import { searchAll, getPopularKeywords, logSearchEvent, type SearchTab } from '@/lib/queries/search'
import { auth } from '@/lib/auth'
import SearchForm from '@/components/features/search/SearchForm'
import SearchTabs from '@/components/features/search/SearchTabs'
import SearchResults from '@/components/features/search/SearchResults'
import FeedAd from '@/components/ad/FeedAd'

interface SearchPageProps {
  searchParams: Promise<{ q?: string; tab?: string }>
}

export const dynamic = 'force-dynamic'

export default async function SearchPage({ searchParams }: SearchPageProps) {
  const params = await searchParams
  const query = params.q?.trim() ?? ''
  const tab = (['all', 'jobs', 'posts', 'magazine'].includes(params.tab ?? '')
    ? params.tab
    : 'all') as SearchTab

  // 쿼리 없으면 초기 화면 (최근검색어 + 인기검색어)
  if (!query) {
    const popularKeywords = await getPopularKeywords()
    return (
      <div className="min-h-screen bg-background overflow-x-hidden">
        <SearchForm popularKeywords={popularKeywords} />
      </div>
    )
  }

  // 검색 실행 + 이벤트 로깅
  const session = await auth()
  const [result] = await Promise.all([
    searchAll(query, { tab }),
    logSearchEvent(query, session?.user?.id),
  ])

  const popularKeywords = await getPopularKeywords()

  return (
    <div className="min-h-screen bg-background overflow-x-hidden">
      <SearchForm initialQuery={query} popularKeywords={popularKeywords} />

      <Suspense>
        <SearchTabs activeTab={tab} query={query} />
      </Suspense>

      <SearchResults result={result} query={query} tab={tab} />

      {/* 검색 결과 하단 광고 */}
      <div className="px-4 pb-6">
        <FeedAd />
      </div>
    </div>
  )
}
