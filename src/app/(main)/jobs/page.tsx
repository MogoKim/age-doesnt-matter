import type { Metadata } from 'next'
import { Suspense } from 'react'
import nextDynamic from 'next/dynamic'
import { getCachedJobsPage } from '@/lib/queries/posts'
import JobFilterButton from '@/components/features/jobs/JobFilterButton'
import BoardViewTracker from '@/components/features/community/BoardViewTracker'
import JobsContent from '@/components/features/jobs/JobsContent'

const JobQuickTags = nextDynamic(() => import('@/components/features/jobs/JobQuickTags'))
const JobSearchBar = nextDynamic(() => import('@/components/features/jobs/JobSearchBar'))

export const revalidate = 120

export const metadata: Metadata = {
  title: '내 일 찾기',
  description: '50·60대 맞춤 일자리 정보, 나이 무관 채용공고',
  alternates: { canonical: `${process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.age-doesnt-matter.com'}/jobs` },
}

export default async function JobsPage() {
  const initialData = await getCachedJobsPage()

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

        {/* 필터 버튼 + 퀵태그 한 행 — 필터▼ 좌측 고정, 태그만 스크롤 */}
        <div className="flex items-center gap-2 mb-4">
          <Suspense fallback={null}>
            <JobFilterButton />
          </Suspense>
          <div className="flex-1 min-w-0">
            <Suspense fallback={null}>
              <JobQuickTags />
            </Suspense>
          </div>
        </div>

        {/* 일자리 목록 */}
        <Suspense fallback={null}>
          <JobsContent initialJobs={initialData.jobs} initialTotal={initialData.total} />
        </Suspense>
      </div>
    </div>
  )
}
