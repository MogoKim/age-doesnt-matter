import { notFound } from 'next/navigation'
import Link from 'next/link'
import type { Metadata } from 'next'
import { GUIDES, GUIDE_SLUGS } from '@/lib/guides'
import Breadcrumbs from '@/components/common/Breadcrumbs'
import { buildBreadcrumbJsonLd } from '@/lib/seo/breadcrumb'

interface PageProps {
  params: Promise<{ slug: string }>
}

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://age-doesnt-matter.com'

// 정적 생성 — 등록된 가이드 slug만. 그 외는 dynamicParams=false로 404.
export const dynamic = 'force-static'
export const dynamicParams = false
export function generateStaticParams() {
  return GUIDE_SLUGS.map((slug) => ({ slug }))
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params
  const guide = GUIDES[decodeURIComponent(slug)]
  if (!guide) return {}
  const url = `${BASE_URL}/guide/${guide.slug}`
  return {
    title: guide.title,
    description: guide.description,
    alternates: { canonical: url },
    robots: { index: true, follow: true },
    openGraph: {
      title: guide.title,
      description: guide.description,
      url,
      type: 'article',
      siteName: '우리 나이가 어때서',
      locale: 'ko_KR',
    },
    twitter: { card: 'summary_large_image', title: guide.title, description: guide.description },
  }
}

export default async function GuidePage({ params }: PageProps) {
  const { slug } = await params
  const guide = GUIDES[decodeURIComponent(slug)]
  if (!guide) notFound()

  const url = `${BASE_URL}/guide/${guide.slug}`

  // JSON-LD 3종 — Article / FAQPage / BreadcrumbList
  const articleLd = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: guide.title,
    description: guide.description,
    url,
    datePublished: guide.publishedAt,
    dateModified: guide.updatedAt,
    author: { '@type': 'Organization', name: '우리 나이가 어때서 편집' },
    publisher: { '@type': 'Organization', name: '우리 나이가 어때서', url: BASE_URL },
  }
  const faqLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: guide.faqs.map((f) => ({
      '@type': 'Question',
      name: f.q,
      acceptedAnswer: { '@type': 'Answer', text: f.a },
    })),
  }
  const breadcrumbLd = buildBreadcrumbJsonLd([
    { name: '홈', path: '/' },
    { name: '생활 가이드', path: '/guide' },
    { name: guide.breadcrumbLabel, path: `/guide/${guide.slug}` },
  ])

  return (
    <div className="max-w-[720px] mx-auto px-4 py-6 md:px-6 md:py-8 bg-[var(--surface-warm)] min-h-screen">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(articleLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd) }} />

      <Breadcrumbs items={[
        { label: '홈', href: '/' },
        { label: '생활 가이드', href: '/guide' },
        { label: guide.breadcrumbLabel },
      ]} />

      <article className="bg-card rounded-2xl border border-border shadow-sm p-5 mb-4 mt-2">
        <h1 className="text-xl font-bold text-foreground m-0 mb-4 leading-[1.4]">{guide.title}</h1>

        {/* 한눈 답변 */}
        <div className="rounded-xl border-l-4 border-primary bg-primary/5 p-4 mb-6">
          <p className="text-body text-foreground leading-[1.75] m-0">{guide.tldr}</p>
        </div>

        {/* 본문 섹션 */}
        <div className="text-body text-foreground leading-[1.85] break-keep">
          {guide.sections.map((s) => (
            <section key={s.heading} className="mb-7">
              <h2 className="text-body font-bold text-foreground m-0 mb-3">{s.heading}</h2>
              {s.paragraphs.map((p, i) => (
                <p key={i} className="mb-3">{p}</p>
              ))}
            </section>
          ))}
        </div>

        {/* 우리 또래 마늘 이야기 */}
        <section className="mt-8 rounded-2xl border border-primary/20 bg-primary/5 p-5">
          <h2 className="text-body font-bold text-primary-text m-0 mb-3">📖 우리 또래 이야기</h2>
          <ul className="list-none m-0 p-0 space-y-2">
            {guide.communityLinks.map((l) => (
              <li key={l.href}>
                <Link href={l.href} className="flex items-center gap-2 py-2.5 no-underline text-body font-medium text-foreground min-h-[52px] hover:text-primary-text transition-colors">
                  <span className="text-primary">→</span>{l.label}
                </Link>
              </li>
            ))}
          </ul>
        </section>

        {/* FAQ */}
        <section className="mt-8">
          <h2 className="text-lg font-bold text-foreground m-0 mb-4">자주 묻는 질문</h2>
          <dl className="m-0">
            {guide.faqs.map((f) => (
              <div key={f.q} className="border-t border-border py-4 first:border-t-0">
                <dt className="text-body font-bold text-foreground mb-2">Q. {f.q}</dt>
                <dd className="text-body text-muted-foreground leading-[1.75] m-0">{f.a}</dd>
              </div>
            ))}
          </dl>
        </section>

        {/* 관련 생활 글 */}
        <section className="mt-8 pt-6 border-t border-border">
          <h2 className="text-body font-bold text-foreground m-0 mb-3">관련 생활 이야기</h2>
          <ul className="list-none m-0 p-0 space-y-1">
            {guide.relatedLinks.map((l) => (
              <li key={l.href}>
                <Link href={l.href} className="flex items-center gap-2 py-2.5 no-underline text-body text-muted-foreground min-h-[52px] hover:text-primary-text transition-colors">
                  <span className="text-primary/60">·</span>{l.label}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      </article>
    </div>
  )
}
