import type { Metadata } from 'next'
import { Suspense } from 'react'
import nextDynamic from 'next/dynamic'
import { getCachedJobsPageAt } from '@/lib/queries/posts'
import { parseListQuery } from '@/lib/list-query'
import JobFilterButton from '@/components/features/jobs/JobFilterButton'
import JobRegionButton from '@/components/features/jobs/JobRegionButton'
import BoardViewTracker from '@/components/features/community/BoardViewTracker'
import JobsContent from '@/components/features/jobs/JobsContent'

const JobQuickTags = nextDynamic(() => import('@/components/features/jobs/JobQuickTags'))
const JobSearchBar = nextDynamic(() => import('@/components/features/jobs/JobSearchBar'))

/**
 * ⚠️ `searchParams` 를 읽으므로 **동적 렌더**가 된다(전체 페이지 ISR 은 쓰지 않는다).
 * DB 부하는 그대로다 — 목록 데이터는 `getCached*PageAt` 의 `unstable_cache` 가
 * page 조합마다 같은 revalidate 창으로 잡는다. `revalidate` 상수는 그 의도를 나타낸다.
 * 정적 렌더로 두면 `?page=2` 가 1페이지 HTML 을 돌려줘 수집기가 같은 링크만 다시 본다.
 */
export const revalidate = 120

const CI_DUMMY_DB = process.env.CI === 'true' && process.env.DATABASE_URL?.includes('localhost:5432/dummy')

export const metadata: Metadata = {
  title: '50대 60대 일자리·재취업',
  description: '경비·요양·돌봄·사무까지 — 나이 걱정 없는 40대 50대 60대 여성 맞춤 일자리·재취업을 매일 업데이트.',
  alternates: { canonical: `${process.env.NEXT_PUBLIC_APP_URL ?? 'https://age-doesnt-matter.com'}/jobs` },
}

async function getInitialJobsData(page: number) {
  try {
    return await getCachedJobsPageAt(page)
  } catch (error) {
    if (!CI_DUMMY_DB) throw error
    return { jobs: [], total: 0 }
  }
}

export default async function JobsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { page, query } = parseListQuery(await searchParams)
  const initialData = await getInitialJobsData(page)

  return (
    <div className="min-h-screen bg-background">
      <BoardViewTracker boardType="JOB" boardSlug="jobs" />
      <div className="px-4 py-6 max-w-[960px] mx-auto">
        {/* sr-only h1 */}
        <h1 className="sr-only">내 일 찾기</h1>

        {/* 검색 바 */}
        <Suspense fallback={null}>
          <JobSearchBar />
        </Suspense>

        {/* 필터·지역 버튼 + 퀵태그 한 행 — 필터▼·지역▼ 좌측 고정, 태그만 스크롤 */}
        <div className="flex items-center gap-2 mb-4">
          <Suspense fallback={null}>
            <JobFilterButton />
          </Suspense>
          <Suspense fallback={null}>
            <JobRegionButton />
          </Suspense>
          <div className="flex-1 min-w-0">
            <Suspense fallback={null}>
              <JobQuickTags />
            </Suspense>
          </div>
        </div>

        {/* 일자리 목록 */}
        <Suspense fallback={null}>
          <JobsContent initialJobs={initialData.jobs} initialTotal={initialData.total} initialQuery={query} />
        </Suspense>
      </div>
    </div>
  )
}
