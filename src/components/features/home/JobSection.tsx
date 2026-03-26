import Link from 'next/link'
import { formatSalary } from '@/lib/format'

export interface JobCardData {
  id: string
  title: string
  location: string
  salary: string
  tags: string[]
  highlight?: string
  isUrgent?: boolean
}

interface Props {
  jobs: JobCardData[]
}

export default function JobSection({ jobs }: Props) {
  if (jobs.length === 0) return null

  return (
    <section className="py-4 border-b-4 border-background lg:py-8 lg:border-b-0">
      <div className="flex items-center justify-between mb-4 px-4 lg:px-0">
        <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
          <span className="text-xl">💼</span>
          오늘의 추천 일자리
        </h2>
        <Link href="/jobs" className="text-[0.88rem] text-muted-foreground no-underline flex items-center gap-1 p-2 -m-2 min-h-[52px] min-w-[52px] hover:text-primary">
          전체보기 →
        </Link>
      </div>
      <div className="overflow-x-auto [-webkit-overflow-scrolling:touch] [scroll-snap-type:x_mandatory] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden px-4 flex gap-3 lg:overflow-x-visible lg:[scroll-snap-type:none] lg:px-0 lg:grid lg:grid-cols-4 lg:gap-4">
        {jobs.map((job) => (
          <Link
            href={`/jobs/${job.id}`}
            key={job.id}
            className="shrink-0 w-[220px] lg:w-auto bg-card rounded-xl p-4 lg:p-5 border border-border [scroll-snap-align:start] lg:[scroll-snap-align:none] cursor-pointer transition-shadow no-underline text-inherit block active:bg-background active:shadow-md lg:hover:shadow-md lg:hover:-translate-y-0.5 lg:hover:transition-all"
          >
            <div className="flex gap-1.5 flex-wrap mb-2.5">
              {job.isUrgent && (
                <span className="h-[26px] px-2.5 bg-destructive text-white rounded-md text-[0.88rem] font-semibold flex items-center whitespace-nowrap">긴급</span>
              )}
              {job.tags.slice(0, 2).map((tag) => (
                <span key={tag} className="h-[26px] px-2.5 bg-primary/10 text-primary rounded-md text-[0.88rem] font-semibold flex items-center whitespace-nowrap">
                  {tag}
                </span>
              ))}
            </div>
            <h3 className="text-base font-bold text-foreground mb-1.5 leading-[1.4] line-clamp-2">{job.title}</h3>
            <div className="text-[0.88rem] text-muted-foreground mb-2 flex items-center gap-1.5">
              <span>{job.location}</span>
              <span>·</span>
              <span className="text-primary font-bold">{formatSalary(job.salary)}</span>
            </div>
            {job.highlight && <p className="text-[0.88rem] text-muted-foreground leading-[1.4] whitespace-nowrap overflow-hidden text-ellipsis">{job.highlight}</p>}
          </Link>
        ))}
      </div>
    </section>
  )
}
