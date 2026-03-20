import Link from 'next/link'
import { Suspense } from 'react'
import { getJobList, type JobCardItem } from '@/lib/queries/posts'
import { formatTimeAgo } from '@/components/features/community/utils'
import JobFilterButton from '@/components/features/jobs/JobFilterButton'
import JobQuickTags from '@/components/features/jobs/JobQuickTags'

interface PageProps {
  searchParams: Promise<{ region?: string; tags?: string }>
}

export default async function JobsPage({ searchParams }: PageProps) {
  const { region, tags: tagsParam } = await searchParams
  const tags = tagsParam?.split(',').filter(Boolean)

  const { jobs } = await getJobList({ region, tags, limit: 20 })

  const hasFilters = !!region || (tags && tags.length > 0)

  return (
    <div className="min-h-screen bg-background">
      <div className="px-4 py-6 max-w-[960px] mx-auto">
        {/* 헤더 */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
            내 일 찾기
          </h2>
          <Suspense fallback={null}>
            <JobFilterButton />
          </Suspense>
        </div>

        {/* 퀵 태그 */}
        <div className="mb-4">
          <Suspense fallback={null}>
            <JobQuickTags />
          </Suspense>
        </div>

        {/* 활성 필터 표시 */}
        {hasFilters && (
          <div className="flex items-center gap-2 mb-4 text-sm text-muted-foreground">
            <span>적용된 필터:</span>
            {region && (
              <span className="px-2.5 py-1 rounded-full bg-primary/10 text-primary text-[13px] font-medium">
                {region}
              </span>
            )}
            {tags?.map((tag) => (
              <span key={tag} className="px-2.5 py-1 rounded-full bg-primary/10 text-primary text-[13px] font-medium">
                {tag}
              </span>
            ))}
          </div>
        )}

        {/* 일자리 목록 */}
        {jobs.length > 0 ? (
          <div className="space-y-3">
            {jobs.map((job) => (
              <JobCard key={job.id} job={job} />
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center p-12 text-center bg-card rounded-2xl border-2 border-dashed border-border">
            <p className="text-base text-muted-foreground leading-relaxed">
              {hasFilters ? (
                <>조건에 맞는 일자리가 없어요.<br />필터를 변경해 보세요!</>
              ) : (
                <>아직 등록된 일자리가 없어요.<br />곧 새로운 일자리가 올라올 거예요!</>
              )}
            </p>
          </div>
        )}
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
      {/* 태그 */}
      {job.tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-2">
          {job.tags.map((tag) => (
            <span
              key={tag}
              className="inline-flex items-center px-2.5 py-0.5 rounded-full bg-primary/10 text-primary text-[13px] font-medium"
            >
              {tag}
            </span>
          ))}
        </div>
      )}

      {/* 제목 */}
      <h3 className="text-base font-bold text-foreground m-0 mb-1">
        {job.isUrgent && (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold bg-gradient-to-br from-[#FF6B6B] to-[#FF8E53] text-white mr-1.5">
            급구
          </span>
        )}
        [{job.region}] {job.title}
      </h3>

      {/* 급여 */}
      <p className="text-sm text-foreground m-0 mb-1 font-medium">
        {job.salary || '급여 협의'}
      </p>

      {/* 하이라이트 */}
      {job.highlight && (
        <p className="text-sm text-muted-foreground m-0 mb-2">
          {job.highlight}
        </p>
      )}

      {/* 메타 */}
      <div className="flex items-center gap-3 text-[13px] text-muted-foreground">
        <span>조회 {job.viewCount}</span>
        <span>댓글 {job.commentCount}</span>
        <span>{formatTimeAgo(job.createdAt)}</span>
      </div>
    </Link>
  )
}
