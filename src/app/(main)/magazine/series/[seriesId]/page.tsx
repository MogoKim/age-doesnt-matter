import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { prisma } from '@/lib/prisma'
import { buildBreadcrumbJsonLd } from '@/lib/seo/breadcrumb'
import { formatTimeAgo } from '@/components/features/community/utils'

/**
 * 매거진 시리즈 허브 (토픽 클러스터 1단계) — 2026-07-21
 *
 * 기존 seriesId 데이터를 묶는 랜딩. 새 DB 필드 없음, 기존 글 무변경.
 *  - 3편 이상 시리즈: 색인 허용 + sitemap 포함(sitemap.ts에서 처리)
 *  - 1~2편 시리즈: 라우트는 200(내부 네비 유지)이나 noindex + sitemap 제외 → thin page 색인 방지
 *  - 소개문 + 글 목록 + breadcrumb + CollectionPage/ItemList JSON-LD로 얇은 페이지 회피
 */

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://age-doesnt-matter.com'
const INDEX_MIN_POSTS = 3 // 색인·sitemap 최소 편수

interface SeriesPost {
  id: string
  title: string
  slug: string | null
  seriesOrder: number | null
  summary: string | null
  category: string | null
  publishedAt: Date | null
}

async function getSeriesPosts(seriesId: string): Promise<SeriesPost[]> {
  return prisma.post.findMany({
    where: { boardType: 'MAGAZINE', status: 'PUBLISHED', seriesId },
    select: { id: true, title: true, slug: true, seriesOrder: true, summary: true, category: true, publishedAt: true },
    orderBy: { seriesOrder: 'asc' },
  })
}

async function getSeriesTitle(seriesId: string): Promise<string | null> {
  const p = await prisma.post.findFirst({
    where: { boardType: 'MAGAZINE', status: 'PUBLISHED', seriesId, seriesTitle: { not: null } },
    select: { seriesTitle: true },
  })
  return p?.seriesTitle ?? null
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ seriesId: string }>
}): Promise<Metadata> {
  const { seriesId } = await params
  const [posts, seriesTitle] = await Promise.all([getSeriesPosts(seriesId), getSeriesTitle(seriesId)])
  if (posts.length === 0 || !seriesTitle) return {}

  const url = `${BASE_URL}/magazine/series/${seriesId}`
  const indexable = posts.length >= INDEX_MIN_POSTS
  return {
    title: `${seriesTitle} — 우나어 매거진 연재 ${posts.length}편`,
    description: `${seriesTitle} 연재 ${posts.length}편을 한자리에 모았습니다. 40대·50대·60대 또래의 눈높이로 정리한 시리즈를 순서대로 읽어보세요.`,
    alternates: { canonical: url },
    // 1~2편 시리즈는 얇은 페이지 → 색인 제외(내부 네비게이션 링크는 유지)
    ...(indexable ? {} : { robots: { index: false, follow: true } }),
    openGraph: {
      title: `${seriesTitle} — 우나어 매거진 연재`,
      description: `${seriesTitle} ${posts.length}편 모아보기`,
      url,
      type: 'website',
    },
  }
}

export default async function MagazineSeriesHub({
  params,
}: {
  params: Promise<{ seriesId: string }>
}) {
  const { seriesId } = await params
  const [posts, seriesTitle] = await Promise.all([getSeriesPosts(seriesId), getSeriesTitle(seriesId)])

  if (posts.length === 0 || !seriesTitle) notFound()

  const magHref = (p: SeriesPost) => `/magazine/${p.slug ?? p.id}`

  const collectionJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: seriesTitle,
    url: `${BASE_URL}/magazine/series/${seriesId}`,
    inLanguage: 'ko-KR',
    isPartOf: { '@type': 'WebSite', name: '우리 나이가 어때서', url: BASE_URL },
    mainEntity: {
      '@type': 'ItemList',
      numberOfItems: posts.length,
      itemListElement: posts.map((p, i) => ({
        '@type': 'ListItem',
        position: i + 1,
        url: `${BASE_URL}${magHref(p)}`,
        name: p.title,
      })),
    },
  }

  return (
    <div className="max-w-[720px] mx-auto px-3 py-6 md:px-6 md:py-8">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(collectionJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(
            buildBreadcrumbJsonLd([
              { name: '홈', path: '/' },
              { name: '매거진', path: '/magazine' },
              { name: seriesTitle, path: `/magazine/series/${seriesId}` },
            ]),
          ),
        }}
      />

      {/* breadcrumb (화면) */}
      <nav className="mb-4 text-caption text-muted-foreground" aria-label="위치">
        <Link href="/magazine" className="hover:text-foreground no-underline">매거진</Link>
        <span className="mx-1.5">›</span>
        <span className="text-foreground">시리즈</span>
      </nav>

      {/* 허브 헤더 + 소개문 */}
      <header className="mb-6 pb-5 border-b border-border">
        <p className="text-caption font-medium text-primary-text mb-1.5">우나어 매거진 연재</p>
        <h1 className="text-2xl font-bold text-foreground m-0 mb-3 leading-[1.4]">{seriesTitle}</h1>
        <p className="text-body text-muted-foreground leading-relaxed break-keep">
          {`'${seriesTitle}'는 총 ${posts.length}편으로 이어지는 우나어 매거진 연재입니다. `}
          40대·50대·60대 또래의 눈높이에서 하나의 주제를 여러 편에 걸쳐 차근차근 풀어냈어요.
          아래 순서대로 읽으면 흐름을 따라가기 좋습니다.
        </p>
      </header>

      {/* 시리즈 글 목록 */}
      <ol className="list-none p-0 m-0 space-y-4">
        {posts.map((p, i) => (
          <li key={p.id}>
            <Link
              href={magHref(p)}
              className="group flex items-start gap-3 rounded-xl border border-border bg-muted/20 px-4 py-3.5 no-underline text-inherit transition-colors hover:border-primary"
            >
              <span className="shrink-0 mt-0.5 flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-caption font-bold text-primary-text">
                {p.seriesOrder ?? i + 1}
              </span>
              <span className="min-w-0">
                <span className="block text-body font-bold text-foreground leading-snug break-keep group-hover:text-primary-text">
                  {p.title}
                </span>
                {p.summary && (
                  <span className="mt-1 block text-caption text-muted-foreground line-clamp-2 break-keep">
                    {p.summary}
                  </span>
                )}
                <span className="mt-1 block text-caption text-muted-foreground/70">
                  {p.category ?? '라이프스타일'}
                  {p.publishedAt ? ` · ${formatTimeAgo(p.publishedAt.toISOString())}` : ''}
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ol>

      <div className="mt-8 text-center">
        <Link href="/magazine" className="text-body text-primary-text no-underline hover:underline">
          매거진 전체 보기 →
        </Link>
      </div>
    </div>
  )
}
