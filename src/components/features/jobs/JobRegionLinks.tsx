import Link from 'next/link'
import { JOB_SIDO_LIST, type JobSido } from '@/lib/jobs-regions'
import { chipClassName } from '@/components/ui/Chip'

/**
 * JobRegionLinks — 시도별 일자리 페이지로 가는 내부 링크 행 (SEO 내부링크 + UX)
 * /jobs 및 각 지역 페이지에서 공용 사용. active 시도는 강조.
 */
export default function JobRegionLinks({ active }: { active?: JobSido }) {
  return (
    <nav aria-label="지역별 일자리" className="relative mb-4">
      <ul className="flex gap-2 list-none m-0 p-0 overflow-x-auto [-webkit-overflow-scrolling:touch] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden lg:flex-wrap lg:overflow-x-visible">
        {JOB_SIDO_LIST.map((sido) => {
          const isActive = sido === active
          return (
            <li key={sido} className="shrink-0">
              <Link
                href={`/jobs/region/${encodeURIComponent(sido)}`}
                aria-current={isActive ? 'page' : undefined}
                className={chipClassName({
                  active: isActive,
                  tone: 'solid',
                  className: isActive ? 'no-underline' : 'no-underline bg-muted',
                })}
              >
                {sido}
              </Link>
            </li>
          )
        })}
      </ul>
      {/* 모바일 가로 스크롤 힌트 — 데스크탑(줄바꿈)에서는 숨김 */}
      <div className="absolute right-0 top-0 h-full w-12 bg-gradient-to-l from-background to-transparent pointer-events-none lg:hidden" />
    </nav>
  )
}
