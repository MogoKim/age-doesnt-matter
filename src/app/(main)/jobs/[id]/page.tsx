import { notFound } from 'next/navigation'
import Link from 'next/link'
import type { Metadata } from 'next'

import { auth } from '@/lib/auth'
import { getJobDetail } from '@/lib/queries/posts'
import { getCommentsByPostId } from '@/lib/queries/comments'
import ActionBar from '@/components/features/community/ActionBar'
import CommentSection from '@/components/features/community/CommentSection'
import { sanitizeHtml } from '@/lib/sanitize'
import { formatSalary } from '@/lib/format'
import GTMEventOnMount from '@/components/common/GTMEventOnMount'
import AdSenseUnit from '@/components/ad/AdSenseUnit'
import CoupangSearchWidget from '@/components/ad/CoupangSearchWidget'
import { ADSENSE } from '@/components/ad/ad-slots'

interface PageProps {
  params: Promise<{ id: string }>
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params
  const job = await getJobDetail(id)
  if (!job) return {}
  return {
    title: `${job.title} — ${job.company}`,
    description: `${job.location} · ${formatSalary(job.salary)}`,
  }
}

/** JobPosting JSON-LD 구조화 데이터 (Google 검색 리치 스니펫) */
function JobPostingJsonLd({ job }: { job: NonNullable<Awaited<ReturnType<typeof getJobDetail>>> }) {
  const salaryText = formatSalary(job.salary)

  // 급여 파싱: "월 280만원" → baseSalary 객체
  let baseSalary: Record<string, unknown> | undefined
  const monthlyMatch = salaryText.match(/월\s*(\d+)(?:~(\d+))?만원/)
  if (monthlyMatch) {
    const low = parseInt(monthlyMatch[1]) * 10000
    const high = monthlyMatch[2] ? parseInt(monthlyMatch[2]) * 10000 : low
    baseSalary = {
      '@type': 'MonetaryAmount',
      currency: 'KRW',
      value: {
        '@type': 'QuantitativeValue',
        minValue: low,
        maxValue: high,
        unitText: 'MONTH',
      },
    }
  }

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'JobPosting',
    title: job.title,
    description: job.content.replace(/<[^>]+>/g, '').slice(0, 500),
    datePosted: job.createdAt,
    hiringOrganization: {
      '@type': 'Organization',
      name: job.company || '채용기업',
    },
    jobLocation: {
      '@type': 'Place',
      address: {
        '@type': 'PostalAddress',
        addressLocality: job.region,
        addressRegion: job.region,
        addressCountry: 'KR',
        streetAddress: job.location,
      },
    },
    ...(baseSalary && { baseSalary }),
    ...(job.applyUrl && { directApply: true }),
    employmentType: 'FULL_TIME',
  }

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
    />
  )
}

export default async function JobDetailPage({ params }: PageProps) {
  const { id } = await params
  const session = await auth()
  const userId = session?.user?.id

  const job = await getJobDetail(id, userId)
  if (!job) notFound()

  const comments = await getCommentsByPostId(id, userId)

  return (
    <div className="max-w-[720px] mx-auto px-4 py-6 md:px-6 md:py-8">
      {/* GA4 일자리 조회 이벤트 */}
      <GTMEventOnMount event="job_view" data={{ job_id: id, job_title: job.title }} />
      {/* JSON-LD 구조화 데이터 */}
      <JobPostingJsonLd job={job} />

      {/* 뒤로가기 */}
      <Link
        href="/jobs"
        className="inline-flex items-center gap-1 text-caption font-medium text-muted-foreground no-underline min-h-[52px] mb-4 px-2 py-1 rounded-lg transition-all hover:text-primary hover:bg-primary/5"
      >
        ← 내 일 찾기
      </Link>

      {/* 태그 */}
      {job.tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-3">
          {job.tags.map((tag) => (
            <span
              key={tag}
              className="inline-flex items-center px-2.5 py-0.5 rounded-full bg-primary/10 text-primary text-caption font-medium"
            >
              🏷{tag}
            </span>
          ))}
        </div>
      )}

      {/* 제목 */}
      <h1 className="text-xl font-bold text-foreground m-0 mb-6 leading-[1.4]">
        {job.title}
      </h1>

      {/* 정보 카드 */}
      <div className="bg-card rounded-xl border border-border p-5 mb-6 space-y-3">
        <InfoRow icon="📍" label="근무지" value={job.location} />
        <InfoRow icon="💰" label="급여" value={formatSalary(job.salary)} />
        {job.workHours && <InfoRow icon="⏰" label="근무시간" value={job.workHours} />}
        {job.workDays && <InfoRow icon="📅" label="근무일" value={job.workDays} />}
        <InfoRow icon="🏢" label="회사" value={job.company} />
      </div>

      {/* 포인트 */}
      {job.pickPoints.length > 0 && (
        <div className="bg-primary/5 rounded-xl p-5 mb-6 space-y-2">
          <h3 className="text-body font-bold text-foreground m-0 mb-3">이런 분을 찾아요</h3>
          {job.pickPoints.map((point, idx) => (
            <p key={idx} className="text-sm text-foreground m-0 flex items-start gap-2">
              <span>{point.icon || '✅'}</span>
              <span>{point.point}</span>
            </p>
          ))}
        </div>
      )}

      {/* 본문 */}
      <div
        className="text-sm text-foreground leading-[1.85] mb-8 break-keep bg-card p-6 rounded-xl shadow-sm [&_p]:mb-4"
        dangerouslySetInnerHTML={{ __html: sanitizeHtml(job.content) }}
      />

      {/* 지원 버튼 */}
      {job.applyUrl && (
        <div className="mb-8">
          <h3 className="text-body font-bold text-foreground mb-3">📞 지원 방법</h3>
          <a
            href={job.applyUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center w-full h-[52px] bg-primary text-white rounded-xl text-body font-bold no-underline transition-colors hover:bg-[#E85D50] lg:w-auto lg:h-12 lg:px-8"
          >
            지원하기
          </a>
        </div>
      )}

      {/* 광고 — 인아티클 + 검색위젯 */}
      <div className="mb-8 space-y-4">
        <AdSenseUnit slotId={ADSENSE.IN_ARTICLE} format="fluid" layout="in-article" className="rounded-2xl overflow-hidden" />
        <CoupangSearchWidget />
      </div>

      {/* 액션 바 */}
      <ActionBar
        postId={id}
        title={job.title}
        description={job.company ? `${job.company} — ${job.location}` : job.title}
        likeCount={job.likeCount}
        isLiked={job.isLiked}
        isScrapped={job.isScrapped}
      />

      {/* 댓글 */}
      <CommentSection postId={id} comments={comments} />
    </div>
  )
}

function InfoRow({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <div className="flex items-start gap-2 text-body">
      <span className="shrink-0">{icon}</span>
      <span className="text-muted-foreground min-w-[64px] shrink-0">{label}</span>
      <span className="text-foreground font-medium">{value}</span>
    </div>
  )
}
