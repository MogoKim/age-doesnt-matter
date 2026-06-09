import type { Metadata } from 'next'
import { Suspense } from 'react'
import nextDynamic from 'next/dynamic'
import { getCachedJobsPage } from '@/lib/queries/posts'
import JobFilterButton from '@/components/features/jobs/JobFilterButton'
import JobRegionButton from '@/components/features/jobs/JobRegionButton'
import BoardViewTracker from '@/components/features/community/BoardViewTracker'
import JobsContent from '@/components/features/jobs/JobsContent'

const JobQuickTags = nextDynamic(() => import('@/components/features/jobs/JobQuickTags'))
const JobSearchBar = nextDynamic(() => import('@/components/features/jobs/JobSearchBar'))

export const revalidate = 120

const CI_DUMMY_DB = process.env.CI === 'true' && process.env.DATABASE_URL?.includes('localhost:5432/dummy')

export const metadata: Metadata = {
  title: '내 일 찾기',
  description: '나이 걱정 없이 시작하는 신중년 여성 맞춤 일자리·채용 정보.',
  alternates: { canonical: `${process.env.NEXT_PUBLIC_APP_URL ?? 'https://age-doesnt-matter.com'}/jobs` },
}

async function getInitialJobsData() {
  try {
    return await getCachedJobsPage()
  } catch (error) {
    if (!CI_DUMMY_DB) throw error
    return { jobs: [], total: 0 }
  }
}

export default async function JobsPage() {
  const initialData = await getInitialJobsData()

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
          <JobsContent initialJobs={initialData.jobs} initialTotal={initialData.total} />
        </Suspense>
      </div>
    </div>
  )
}
