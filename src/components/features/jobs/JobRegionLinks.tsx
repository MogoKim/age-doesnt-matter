import Link from 'next/link'
import { JOB_SIDO_LIST, type JobSido } from '@/lib/jobs-regions'

/**
 * JobRegionLinks — 시도별 일자리 페이지로 가는 내부 링크 행 (SEO 내부링크 + UX)
 * /jobs 및 각 지역 페이지에서 공용 사용. active 시도는 강조.
 */
export default function JobRegionLinks({ active }: { active?: JobSido }) {
  return (
    <nav aria-label="지역별 일자리" className="mb-4">
      <ul className="flex flex-wrap gap-2 list-none m-0 p-0">
        {JOB_SIDO_LIST.map((sido) => {
          const isActive = sido === active
          return (
            <li key={sido}>
              <Link
                href={`/jobs/region/${encodeURIComponent(sido)}`}
                aria-current={isActive ? 'page' : undefined}
                className={
                  isActive
                    ? 'inline-flex items-center min-h-[40px] px-3 rounded-full text-caption font-bold bg-primary text-white no-underline'
                    : 'inline-flex items-center min-h-[40px] px-3 rounded-full text-caption font-medium bg-muted text-foreground no-underline transition-colors hover:bg-primary/10 hover:text-primary-text'
                }
              >
                {sido}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
