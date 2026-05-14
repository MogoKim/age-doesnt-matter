import Link from 'next/link'
import { getLatestJobs } from '@/lib/queries/posts'
import { formatSalary } from '@/lib/format'

interface Props {
  excludeJobId: string
}

export default async function JobListBottom({ excludeJobId }: Props) {
  const allJobs = await getLatestJobs(9)
  const jobs = allJobs.filter(j => j.id !== excludeJobId).slice(0, 8)

  if (jobs.length === 0) return null

  return (
    <section className="mt-2 mb-8">
      <div className="flex items-center justify-between mb-3 pb-2 border-b-2 border-foreground">
        <span className="text-base font-bold text-foreground">다른 일자리도 찾아보세요</span>
        <Link
          href="/jobs"
          className="text-caption text-primary no-underline min-h-[44px] flex items-center px-2 hover:underline"
          prefetch={false}
        >
          목록 →
        </Link>
      </div>
      <ol className="list-none m-0 p-0">
        {jobs.map((job, idx) => (
          <li key={job.id} className="border-b border-border last:border-b-0">
            <Link
              href={`/jobs/${job.id}`}
              className="flex items-start gap-3 py-3 no-underline text-inherit min-h-[52px] hover:bg-muted/40 transition-colors -mx-1 px-1 rounded-lg"
              prefetch={false}
            >
              <span className="text-caption font-bold text-muted-foreground w-5 shrink-0 pt-0.5 text-right">
                {idx + 1}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-body font-medium text-foreground m-0 mb-1 line-clamp-1 leading-[1.5]">
                  {job.title}
                </p>
                <div className="flex items-center gap-2 text-caption text-muted-foreground flex-wrap">
                  {job.tags.length > 0 && (
                    <span className="bg-background px-2 py-0.5 rounded text-caption text-muted-foreground shrink-0">
                      {job.tags[0]}
                    </span>
                  )}
                  {job.salary && <span>💰 {formatSalary(job.salary)}</span>}
                  {job.location && <span>📍 {job.location}</span>}
                </div>
              </div>
            </Link>
          </li>
        ))}
      </ol>
    </section>
  )
}
