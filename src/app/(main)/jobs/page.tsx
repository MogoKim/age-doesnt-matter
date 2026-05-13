import type { Metadata } from 'next'
import Link from 'next/link'
import { Suspense } from 'react'
import { unstable_cache } from 'next/cache'
import nextDynamic from 'next/dynamic'
import { getJobListPage, type JobCardItem } from '@/lib/queries/posts'
import { formatTimeAgo } from '@/components/features/community/utils'
import { formatSalary } from '@/lib/format'
import JobFilterButton from '@/components/features/jobs/JobFilterButton'
import PostListWithAds from '@/components/features/common/PostListWithAds'
import BoardPaginationFooter from '@/components/features/common/BoardPaginationFooter'
import BoardViewTracker from '@/components/features/community/BoardViewTracker'

const JobQuickTags = nextDynamic(() => import('@/components/features/jobs/JobQuickTags'))

export const dynamic = 'force-dynamic'

const LIMIT = 12

export const metadata: Metadata = {
  title: '내 일 찾기',
  description: '50·60대 맞춤 일자리 정보, 나이 무관 채용공고',
  alternates: { canonical: `${process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.age-doesnt-matter.com'}/jobs` },
}

interface PageProps {
  searchParams: Promise<{ region?: string; tags?: string; q?: string; sf?: string; page?: string }>
}

export default async function JobsPage({ searchParams }: PageProps) {
  const { region, tags: tagsParam, q: rawQ, sf: rawSf, page: rawPage } = await searchParams
  const tags = tagsParam?.split(',').filter(Boolean)
  const q = rawQ?.trim() || undefined
  const sf = rawSf === 'title' || rawSf === 'content' ? rawSf : ('both' as const)
  const page = Math.max(1, parseInt(rawPage ?? '1', 10) || 1)
  const skip = (page - 1) * LIMIT

  let jobs: JobCardItem[]
  let total: number

  if (q || region || (tags && tags.length > 0) || page > 1) {
    ;({ jobs, total } = await getJobListPage({ region, tags, skip, limit: LIMIT, q, sf }))
  } else {
    const getCached = unstable_cache(
      () => getJobListPage({ skip: 0, limit: LIMIT }),
      ['jobs-list-page1'],
      { revalidate: 120 },
    )
    ;({ jobs, total } = await getCached())
  }

  const hasFilters = !!region || (tags && tags.length > 0)
  const regionSuffix = region ? `&region=${encodeURIComponent(region)}` : ''
  const tagsSuffix = tags && tags.length > 0 ? `&tags=${encodeURIComponent(tags.join(','))}` : ''
  const qSuffix = q ? `&q=${encodeURIComponent(q)}&sf=${sf}` : ''

  return (
    <div className="min-h-screen bg-background">
      <BoardViewTracker boardType="JOB" boardSlug="jobs" />
      <div className="px-4 py-6 max-w-[960px] mx-auto">
        {/* sr-only h1 */}
        <h1 className="sr-only">내 일 찾기</h1>

        {/* 퀵태그 + 필터 버튼 한 행 — 태그만 스크롤, 필터▼ 우측 고정 */}
        <div className="flex items-center gap-2 mb-4">
          <div className="flex-1 min-w-0 overflow-x-auto [-webkit-overflow-scrolling:touch] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <Suspense fallback={null}>
              <JobQuickTags />
            </Suspense>
          </div>
          <Suspense fallback={null}>
            <JobFilterButton />
          </Suspense>
        </div>

        {/* 활성 필터 표시 */}
        {hasFilters && (
          <div className="flex items-center gap-2 mb-4 text-sm text-muted-foreground">
            <span>적용된 필터:</span>
            {region && (
              <span className="px-2.5 py-1 rounded-full bg-primary/10 text-foreground text-caption font-medium">
                {region}
              </span>
            )}
            {tags?.map((tag) => (
              <span key={tag} className="px-2.5 py-1 rounded-full bg-primary/10 text-foreground text-caption font-medium">
                {tag}
              </span>
            ))}
          </div>
        )}

        {/* 일자리 목록 */}
        {jobs.length > 0 ? (
          <PostListWithAds
            items={jobs}
            renderCard={(job) => <JobCard job={job} />}
            className="space-y-3"
          />
        ) : (
          <div className="flex flex-col items-center justify-center p-12 text-center bg-card rounded-2xl border-2 border-dashed border-border">
            <p className="text-body text-muted-foreground leading-relaxed">
              {q ? (
                <>&ldquo;{q}&rdquo; 검색 결과가 없어요.<br />다른 검색어를 입력해 보세요.</>
              ) : hasFilters ? (
                <>조건에 맞는 일자리가 없어요.<br />필터를 변경해 보세요!</>
              ) : (
                <>아직 등록된 일자리가 없어요.<br />곧 새로운 일자리가 올라올 거예요!</>
              )}
            </p>
          </div>
        )}

        <BoardPaginationFooter
          total={total}
          page={page}
          pageSize={LIMIT}
          buildHref={(p) => `/jobs?page=${p}${regionSuffix}${tagsSuffix}${qSuffix}`}
        />
      </div>
    </div>
  )
}

function JobCard({ job }: { job: JobCardItem }) {
  return (
    <Link
      href={`/jobs/${job.id}`}
      className="block p-4 bg-card rounded-xl border border-border no-underline transition-colors hover:border-primary/30"
    >
      {/* 태그 — 최대 3개 */}
      {job.tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-2">
          {job.isUrgent && (
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold bg-gradient-to-br from-[#FF6B6B] to-[#FF8E53] text-white">
              급구
            </span>
          )}
          {job.tags.slice(0, 2).map((tag) => (
            <span
              key={tag}
              className="inline-flex items-center px-2.5 py-0.5 rounded-full bg-primary/10 text-foreground text-caption font-medium"
            >
              {tag}
            </span>
          ))}
        </div>
      )}

      {/* 제목 */}
      <h3 className="text-body font-bold text-foreground m-0 mb-1">
        {job.title}
      </h3>

      {/* 급여 — 정규화된 형식 */}
      <p className="text-body text-foreground m-0 mb-1 font-medium">
        {formatSalary(job.salary)}
      </p>

      {/* 하이라이트 */}
      {job.highlight && (
        <p className="text-body text-muted-foreground m-0 mb-2">
          {job.highlight}
        </p>
      )}

      {/* 메타 */}
      <div className="flex items-center gap-3 text-caption text-muted-foreground">
        <span>조회 {job.viewCount}</span>
        <span>댓글 {job.commentCount}</span>
        <span>{formatTimeAgo(job.createdAt)}</span>
      </div>
    </Link>
  )
}
