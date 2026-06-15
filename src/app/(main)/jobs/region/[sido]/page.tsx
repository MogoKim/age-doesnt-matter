import { notFound } from 'next/navigation'
import Link from 'next/link'
import type { Metadata } from 'next'
import { getJobListPage, type JobCardItem } from '@/lib/queries/posts'
import JobCard from '@/components/features/jobs/JobCard'
import JobRegionLinks from '@/components/features/jobs/JobRegionLinks'
import { JOB_SIDO_LIST, isJobSido } from '@/lib/jobs-regions'
import { buildBreadcrumbJsonLd } from '@/lib/seo/breadcrumb'

interface PageProps {
  params: Promise<{ sido: string }>
}

export const revalidate = 120
export const dynamicParams = false // 화이트리스트 17개 시도만 허용, 나머지 404

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://age-doesnt-matter.com'
const CI_DUMMY_DB = process.env.CI === 'true' && process.env.DATABASE_URL?.includes('localhost:5432/dummy')

export function generateStaticParams() {
  return JOB_SIDO_LIST.map((sido) => ({ sido }))
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { sido } = await params
  const region = decodeURIComponent(sido)
  if (!isJobSido(region)) return {}

  const title = `${region} 50·60대 일자리·재취업 | 우리 나이가 어때서`
  const description = `${region} 지역 50·60대 맞춤 일자리. 나이 무관 채용공고를 매일 업데이트합니다. 경비·요양·사무·돌봄 등 우리 또래 일자리를 한눈에.`
  const url = `${BASE_URL}/jobs/region/${encodeURIComponent(region)}`

  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: { title, description, url, type: 'website', siteName: '우리 나이가 어때서', locale: 'ko_KR' },
  }
}

function ItemListJsonLd({ region, jobs }: { region: string; jobs: JobCardItem[] }) {
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: `${region} 50·60대 일자리`,
    itemListElement: jobs.map((job, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      url: `${BASE_URL}/jobs/${job.id}`,
      name: job.title,
    })),
  }
  return (
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
  )
}

async function getRegionJobs(region: string) {
  try {
    return await getJobListPage({ region, limit: 30 })
  } catch (error) {
    if (!CI_DUMMY_DB) throw error
    return { jobs: [], total: 0 }
  }
}

export default async function RegionJobsPage({ params }: PageProps) {
  const { sido } = await params
  const region = decodeURIComponent(sido)
  if (!isJobSido(region)) notFound()

  const { jobs, total } = await getRegionJobs(region)

  return (
    <div className="min-h-screen bg-background">
      <div className="px-4 py-6 max-w-[960px] mx-auto">
        {/* JSON-LD */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(buildBreadcrumbJsonLd([
              { name: '홈', path: '/' },
              { name: '내 일 찾기', path: '/jobs' },
              { name: region, path: `/jobs/region/${encodeURIComponent(region)}` },
            ])),
          }}
        />
        {jobs.length > 0 && <ItemListJsonLd region={region} jobs={jobs} />}

        {/* 뒤로가기 */}
        <Link
          href="/jobs"
          className="inline-flex items-center gap-1 text-[17px] font-medium text-muted-foreground no-underline min-h-[52px] mb-2 px-2 py-1 rounded-lg transition-colors hover:text-primary-text hover:bg-primary/5"
        >
          ← 내 일 찾기
        </Link>

        <h1 className="text-xl font-bold text-foreground m-0 mb-1 leading-[1.4]">
          {region} 50·60대 일자리
        </h1>
        <p className="text-body text-muted-foreground m-0 mb-4">
          {region} 지역 나이 무관 채용공고 {total}건
        </p>

        {/* 지역 내부링크 */}
        <JobRegionLinks active={region} />

        {/* 목록 (SSR — 크롤러 가시) */}
        {jobs.length > 0 ? (
          <ul className="space-y-3 list-none m-0 p-0">
            {jobs.map((job) => (
              <li key={job.id}>
                <JobCard job={job} />
              </li>
            ))}
          </ul>
        ) : (
          <div className="flex flex-col items-center justify-center p-8 gap-4 text-center bg-card rounded-2xl border-2 border-dashed border-border">
            <p className="text-body text-muted-foreground leading-relaxed">
              아직 {region} 지역 일자리가 없어요.<br />곧 새로운 일자리가 올라올 거예요!
            </p>
            <Link
              href="/jobs"
              className="inline-flex items-center justify-center h-[52px] px-6 bg-primary text-white rounded-xl text-body font-bold no-underline hover:bg-primary/90"
            >
              전체 일자리 보기
            </Link>
          </div>
        )}
      </div>
    </div>
  )
}
