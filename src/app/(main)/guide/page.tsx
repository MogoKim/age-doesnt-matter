import Link from 'next/link'
import type { Metadata } from 'next'

import Breadcrumbs from '@/components/common/Breadcrumbs'
import { GUIDES, GUIDE_SLUGS, type GuideDoc } from '@/lib/guides'

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://age-doesnt-matter.com'

export const dynamic = 'force-static'

export const metadata: Metadata = {
  title: '생활 가이드 — 40대 50대 60대 여성을 위한 쉬운 생활 정보',
  description:
    '50대 재취업, 장보기 물가, 안경알 교체, 운동 시작, 여행 옷차림처럼 우리 또래가 자주 묻는 생활 정보를 쉽게 정리했습니다.',
  alternates: { canonical: `${BASE_URL}/guide` },
  robots: { index: true, follow: true },
  openGraph: {
    title: '생활 가이드 — 우리 나이가 어때서',
    description:
      '50대 재취업, 건강, 장보기, 여행, 살림처럼 40대 50대 60대 여성이 실제로 궁금해하는 생활 정보를 모았습니다.',
    url: `${BASE_URL}/guide`,
    type: 'website',
    siteName: '우리 나이가 어때서',
    locale: 'ko_KR',
  },
}

const GUIDE_GROUPS = [
  {
    title: '일자리·재취업',
    description: '다시 일하고 싶은 우리 또래가 먼저 확인하면 좋은 가이드입니다.',
    slugs: ['50대-쿠팡알바-재취업-현실'],
  },
  {
    title: '생활·건강',
    description: '살림, 운동, 여행, 장보기처럼 매일의 선택을 쉽게 정리한 가이드입니다.',
    slugs: [
      '50대-크로스핏-운동-시작',
      '50대-유럽여행-옷차림',
      '마늘-한접-몇개-보관법',
      '안경알만-교체-가능-비용',
      '오이지-장아찌-담그는법',
      '50대-살기좋은지역-고르는법',
      '장보기-물가-줄이는법',
    ],
  },
] as const

function getGuideCards(slugs: readonly string[]): GuideDoc[] {
  return slugs.map((slug) => GUIDES[slug]).filter((guide): guide is GuideDoc => Boolean(guide))
}

export default function GuideIndexPage() {
  const guides = GUIDE_SLUGS.map((slug) => GUIDES[slug])
  const collectionLd = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: '생활 가이드',
    description:
      '40대 50대 60대 여성이 자주 묻는 생활, 건강, 재취업, 살림 정보를 쉽게 정리한 가이드 모음입니다.',
    url: `${BASE_URL}/guide`,
    isPartOf: { '@type': 'WebSite', name: '우리 나이가 어때서', url: BASE_URL },
    mainEntity: {
      '@type': 'ItemList',
      itemListElement: guides.map((guide, index) => ({
        '@type': 'ListItem',
        position: index + 1,
        name: guide.title,
        url: `${BASE_URL}/guide/${guide.slug}`,
      })),
    },
  }

  return (
    <main className="min-h-screen bg-[var(--surface-warm)]">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(collectionLd) }}
      />

      <div className="mx-auto max-w-[960px] px-4 py-6 md:px-6 md:py-8">
        <Breadcrumbs items={[
          { label: '홈', href: '/' },
          { label: '생활 가이드' },
        ]} />

        <header className="mb-7">
          <p className="mb-2 text-caption font-bold text-primary-text">생활 가이드</p>
          <h1 className="m-0 text-2xl font-bold leading-[1.35] text-foreground md:text-3xl">
            우리 또래가 자주 묻는 생활 정보를 쉽게 모았습니다
          </h1>
          <p className="mt-4 max-w-[760px] text-body leading-[1.8] text-muted-foreground">
            40대 50대 60대가 실제로 자주 검색하고 묻는 생활 문제를 한곳에 정리했습니다.
            재취업과 알바, 운동 시작, 여행 준비, 장보기 물가, 안경알 교체, 살림 보관법처럼
            매일의 선택에 바로 도움이 되는 주제를 다룹니다. 각 가이드는 짧은 답변, 자세한
            설명, 우리 또래 커뮤니티 경험담으로 이어지도록 구성했습니다.
          </p>
        </header>

        <div className="space-y-8">
          {GUIDE_GROUPS.map((group) => {
            const groupGuides = getGuideCards(group.slugs)

            return (
              <section key={group.title} aria-labelledby={`guide-group-${group.title}`} className="space-y-3">
                <div>
                  <h2 id={`guide-group-${group.title}`} className="m-0 text-lg font-bold text-foreground">
                    {group.title}
                  </h2>
                  <p className="mt-1 text-body leading-[1.7] text-muted-foreground">{group.description}</p>
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  {groupGuides.map((guide) => (
                    <Link
                      key={guide.slug}
                      href={`/guide/${guide.slug}`}
                      className="block rounded-lg border border-border bg-card p-4 no-underline shadow-sm transition-colors hover:border-primary/40 hover:bg-primary/5"
                    >
                      <h3 className="m-0 text-body font-bold leading-[1.45] text-foreground">{guide.breadcrumbLabel}</h3>
                      <p className="mt-2 line-clamp-3 text-[17px] leading-[1.7] text-muted-foreground">
                        {guide.description}
                      </p>
                      <span className="mt-3 inline-flex min-h-[52px] items-center text-[17px] font-bold text-primary-text">
                        자세히 보기
                      </span>
                    </Link>
                  ))}
                </div>
              </section>
            )
          })}
        </div>

        <section className="mt-9 border-t border-border pt-6">
          <h2 className="m-0 text-lg font-bold text-foreground">커뮤니티에서 같이 이야기해요</h2>
          <p className="mt-2 text-body leading-[1.8] text-muted-foreground">
            가이드로 기본 정보를 확인한 뒤, 비슷한 고민을 가진 우리 또래의 실제 이야기를 읽어보세요.
            생활 정보는 숫자만으로 끝나지 않습니다. 직접 겪은 후기와 댓글이 함께 있을 때 더 현실적인
            판단을 할 수 있습니다.
          </p>
          <div className="mt-4 flex flex-col gap-2 sm:flex-row">
            <Link
              href="/community/life2"
              className="inline-flex min-h-[52px] items-center justify-center rounded-lg bg-primary px-4 text-[17px] font-bold text-white no-underline"
            >
              2막준비 보기
            </Link>
            <Link
              href="/community/stories"
              className="inline-flex min-h-[52px] items-center justify-center rounded-lg border border-border bg-card px-4 text-[17px] font-bold text-foreground no-underline"
            >
              사는이야기 보기
            </Link>
          </div>
        </section>
      </div>
    </main>
  )
}
