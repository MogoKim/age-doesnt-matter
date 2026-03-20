import Link from 'next/link'

interface JobCard {
  id: string
  title: string
  location: string
  salary: string
  tags: string[]
  highlight?: string
  isUrgent?: boolean
}

const MOCK_JOBS: JobCard[] = [
  {
    id: '1',
    title: '도서관 사서 보조',
    location: '강남구',
    salary: '월 200만',
    tags: ['나이무관', '오전만'],
    highlight: '초보 환영, 오전만 근무',
  },
  {
    id: '2',
    title: '아파트 경비원',
    location: '서초구',
    salary: '월 220만',
    tags: ['60대 환영'],
    highlight: '주 5일, 교대 근무',
    isUrgent: true,
  },
  {
    id: '3',
    title: '카페 주방 보조',
    location: '마포구',
    salary: '시급 1.2만',
    tags: ['초보환영', '단기가능'],
    highlight: '주 3일 가능',
  },
  {
    id: '4',
    title: '학교 급식 보조',
    location: '송파구',
    salary: '월 180만',
    tags: ['나이무관'],
    highlight: '방학 중 휴무',
  },
  {
    id: '5',
    title: '주차장 관리원',
    location: '강동구',
    salary: '월 210만',
    tags: ['60대 환영', '야간없음'],
    highlight: '주간 근무만',
  },
]

export default function JobSection() {
  return (
    <section className="py-6 border-b-8 border-background lg:py-8 lg:border-b-0">
      <div className="flex items-center justify-between mb-4 px-4 lg:px-0">
        <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
          <span className="text-xl">💼</span>
          오늘의 추천 일자리
        </h2>
        <Link href="/jobs" className="text-[15px] text-muted-foreground no-underline flex items-center gap-1 p-2 -m-2 min-h-[44px] min-w-[44px] hover:text-primary">
          전체보기 →
        </Link>
      </div>
      <div className="overflow-x-auto [-webkit-overflow-scrolling:touch] [scroll-snap-type:x_mandatory] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden px-4 flex gap-3 lg:overflow-x-visible lg:[scroll-snap-type:none] lg:px-0 lg:grid lg:grid-cols-4 lg:gap-4">
        {MOCK_JOBS.map((job) => (
          <Link
            href={`/jobs/${job.id}`}
            key={job.id}
            className="shrink-0 w-[220px] lg:w-auto bg-card rounded-xl p-4 lg:p-5 border border-border [scroll-snap-align:start] lg:[scroll-snap-align:none] cursor-pointer transition-shadow no-underline text-inherit block active:bg-background active:shadow-md lg:hover:shadow-md lg:hover:-translate-y-0.5 lg:hover:transition-all"
          >
            <div className="flex gap-1.5 flex-wrap mb-2.5">
              {job.isUrgent && (
                <span className="h-[26px] px-2.5 bg-destructive text-white rounded-md text-[13px] font-semibold flex items-center whitespace-nowrap">긴급</span>
              )}
              {job.tags.map((tag) => (
                <span key={tag} className="h-[26px] px-2.5 bg-primary/10 text-primary rounded-md text-[13px] font-semibold flex items-center whitespace-nowrap">
                  {tag}
                </span>
              ))}
            </div>
            <h3 className="text-sm font-bold text-foreground mb-1.5 leading-[1.4] line-clamp-2">{job.title}</h3>
            <div className="text-[15px] text-muted-foreground mb-2 flex items-center gap-1.5">
              <span>{job.location}</span>
              <span>·</span>
              <span className="text-primary font-bold">{job.salary}</span>
            </div>
            {job.highlight && <p className="text-xs text-muted-foreground leading-[1.4] whitespace-nowrap overflow-hidden text-ellipsis">{job.highlight}</p>}
          </Link>
        ))}
      </div>
    </section>
  )
}
