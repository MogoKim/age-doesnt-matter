import Link from 'next/link'
import { getJobList, type JobCardItem } from '@/lib/queries/posts'
import { formatTimeAgo } from '@/components/features/community/utils'

export default async function JobsPage() {
  const { jobs } = await getJobList({ limit: 20 })

  return (
    <div className="min-h-screen bg-background">
      <div className="px-4 py-6">
        <h2 className="text-xl font-bold text-foreground mb-6 flex items-center gap-2">
          💼 내 일 찾기
        </h2>

        {jobs.length > 0 ? (
          <div className="space-y-3">
            {jobs.map((job) => (
              <JobCard key={job.id} job={job} />
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center p-12 text-center bg-card rounded-2xl border-2 border-dashed border-border">
            <p className="text-base text-muted-foreground leading-relaxed">
              아직 등록된 일자리가 없어요.
              <br />
              곧 새로운 일자리가 올라올 거예요!
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
              🏷{tag}
            </span>
          ))}
        </div>
      )}

      {/* 제목 (지역 + 직종) */}
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
        💰 {job.salary || '협의'}
      </p>

      {/* 하이라이트 */}
      {job.highlight && (
        <p className="text-sm text-muted-foreground m-0 mb-2">
          📌 {job.highlight}
        </p>
      )}

      {/* 메타 */}
      <div className="flex items-center gap-3 text-[13px] text-muted-foreground">
        <span>👁 {job.viewCount}</span>
        <span>💬 {job.commentCount}</span>
        <span>{formatTimeAgo(job.createdAt)}</span>
      </div>
    </Link>
  )
}
