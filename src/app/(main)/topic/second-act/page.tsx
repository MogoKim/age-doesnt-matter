import Link from 'next/link'
import type { Metadata } from 'next'

import Breadcrumbs from '@/components/common/Breadcrumbs'
import { getSecondActSections, type HubLink } from '@/lib/seo/topic-second-act'

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://age-doesnt-matter.com'
const CANONICAL = `${BASE_URL}/topic/second-act`

// 빌드 시 prerender하지 않는다 — CI 빌드 환경에는 DB가 없어 export가 실패한다.
// 실제 DB 조회는 getSecondActSections 내부 unstable_cache(1시간)가 막아준다.
export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: '인생 2막 — 50대 60대 재취업, 은퇴 후 일자리와 노후 준비',
  description:
    '50대 재취업의 현실, 쿠팡·청소·돌봄 같은 실제 일자리 후기, 퇴직금·연금·건강보험 처리, '
    + '은퇴 후 생활비까지. 40대 후반부터 60대까지 우리 또래가 직접 겪고 나눈 이야기를 모았습니다.',
  alternates: { canonical: CANONICAL },
  robots: { index: true, follow: true },
  openGraph: {
    title: '인생 2막 — 재취업과 은퇴 후 준비, 우리 또래의 실제 이야기',
    description:
      '재취업 현실, 실제 하는 일, 퇴직금·연금·건강보험, 은퇴 후 생활비, 일 말고 남은 시간까지 한곳에.',
    url: CANONICAL,
    type: 'website',
    siteName: '우리 나이가 어때서',
    locale: 'ko_KR',
  },
}

const KIND_LABEL: Record<string, string> = {
  magazine: '정리된 정보',
  guide: '생활 가이드',
  community: '우리 또래 이야기',
}

function LinkCard({ item, kind }: { item: HubLink; kind: 'magazine' | 'community' | 'guide' }) {
  return (
    <Link
      href={item.href}
      className="block rounded-lg border border-border bg-card p-4 no-underline shadow-sm transition-colors hover:border-primary/40 hover:bg-primary/5"
    >
      <span className="text-caption font-bold text-primary-text">
        {KIND_LABEL[kind]}
        {kind === 'community' && item.commentCount ? ` · 댓글 ${item.commentCount}` : ''}
      </span>
      <h4 className="m-0 mt-1 text-body font-bold leading-[1.45] text-foreground">{item.title}</h4>
      {item.excerpt && (
        <p className="mt-2 line-clamp-2 text-[17px] leading-[1.7] text-muted-foreground">{item.excerpt}</p>
      )}
    </Link>
  )
}

export default async function SecondActTopicPage() {
  const sections = await getSecondActSections()

  const collectionLd = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: '인생 2막 — 50대 60대 재취업, 은퇴 후 일자리와 노후 준비',
    description:
      '재취업 현실, 실제 일자리 후기, 퇴직금·연금·건강보험, 은퇴 후 생활비, 일 말고 남은 시간을 모은 페이지입니다.',
    url: CANONICAL,
    inLanguage: 'ko-KR',
    isPartOf: { '@type': 'WebSite', name: '우리 나이가 어때서', url: BASE_URL },
    mainEntity: {
      '@type': 'ItemList',
      itemListElement: sections
        .flatMap((section) => [...section.guides, ...section.magazine, ...section.community])
        .map((item, index) => ({
          '@type': 'ListItem',
          position: index + 1,
          name: item.title,
          url: `${BASE_URL}${item.href}`,
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
        <Breadcrumbs items={[{ label: '홈', href: '/' }, { label: '인생 2막' }]} />

        <header className="mb-7">
          <p className="mb-2 text-caption font-bold text-primary-text">인생 2막</p>
          <h1 className="m-0 text-2xl font-bold leading-[1.35] text-foreground md:text-3xl">
            다시 일하고, 다시 계획하는 시간
          </h1>
          <p className="mt-4 max-w-[760px] text-body leading-[1.8] text-muted-foreground">
            퇴직이 다가오거나 이미 지나온 40대 후반부터 60대까지, 비슷한 질문 앞에 섭니다.
            나이 때문에 서류에서 걸리는 건 아닐까, 퇴직금은 어떻게 받아야 하나, 건강보험료는
            얼마나 나올까, 한 달에 얼마면 살아지나. 그리고 일을 놓은 뒤의 하루는 어떻게 채우나.
          </p>
          <p className="mt-3 max-w-[760px] text-body leading-[1.8] text-muted-foreground">
            여기 모은 글은 우나어에 쌓인 우리 또래의 경험과 정리된 정보입니다.
            제도는 자주 바뀌고 사람마다 사정이 다르니, 돈과 관련된 결정은 이 글들로 방향만 잡고
            공단이나 금융기관에 직접 확인하시는 게 좋습니다.
          </p>
        </header>

        <nav aria-label="인생 2막 주제 바로가기" className="mb-8 rounded-lg border border-border bg-card p-4">
          <h2 className="m-0 text-body font-bold text-foreground">어떤 이야기가 궁금하세요?</h2>
          <ul className="mt-3 flex flex-wrap gap-2 p-0">
            {sections.map((section) => (
              <li key={section.id} className="list-none">
                <a
                  href={`#${section.id}`}
                  className="inline-flex min-h-[52px] items-center rounded-full border border-border bg-background px-4 text-[17px] font-bold text-foreground no-underline transition-colors hover:border-primary/40 hover:bg-primary/5"
                >
                  {section.title}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <div className="space-y-10">
          {sections.map((section) => (
            <section key={section.id} id={section.id} aria-labelledby={`${section.id}-heading`} className="scroll-mt-20">
              <p className="mb-1 text-caption font-bold text-primary-text">{section.title}</p>
              <h2 id={`${section.id}-heading`} className="m-0 text-xl font-bold leading-[1.4] text-foreground">
                {section.heading}
              </h2>
              <p className="mt-3 max-w-[760px] text-body leading-[1.8] text-muted-foreground">
                {section.description}
              </p>

              {section.guides.length > 0 && (
                <div className="mt-5 grid gap-3 md:grid-cols-2">
                  {section.guides.map((item) => (
                    <LinkCard key={item.href} item={item} kind="guide" />
                  ))}
                </div>
              )}

              {section.magazine.length > 0 && (
                <div className="mt-5">
                  <h3 className="m-0 text-body font-bold text-foreground">먼저 읽어두면 좋은 정리</h3>
                  <div className="mt-3 grid gap-3 md:grid-cols-2">
                    {section.magazine.map((item) => (
                      <LinkCard key={item.href} item={item} kind="magazine" />
                    ))}
                  </div>
                </div>
              )}

              {section.community.length > 0 && (
                <div className="mt-5">
                  <h3 className="m-0 text-body font-bold text-foreground">우리 또래는 이렇게 겪었어요</h3>
                  <div className="mt-3 grid gap-3 md:grid-cols-2">
                    {section.community.map((item) => (
                      <LinkCard key={item.href} item={item} kind="community" />
                    ))}
                  </div>
                </div>
              )}

              {section.regions.length > 0 && (
                <div className="mt-5">
                  <h3 className="m-0 text-body font-bold text-foreground">지역별 일자리 보기</h3>
                  <p className="mt-1 text-[17px] leading-[1.7] text-muted-foreground">
                    나이 제한 없이 지원할 수 있는 공고를 지역별로 모아둡니다.
                  </p>
                  <ul className="mt-3 flex flex-wrap gap-2 p-0">
                    {section.regions.map((sido) => (
                      <li key={sido} className="list-none">
                        <Link
                          href={`/jobs/region/${encodeURIComponent(sido)}`}
                          className="inline-flex min-h-[52px] items-center rounded-lg border border-border bg-card px-4 text-[17px] font-bold text-foreground no-underline transition-colors hover:border-primary/40 hover:bg-primary/5"
                        >
                          {sido} 일자리
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </section>
          ))}
        </div>

        <section className="mt-10 border-t border-border pt-6">
          <h2 className="m-0 text-lg font-bold text-foreground">겪고 계신 이야기를 나눠주세요</h2>
          <p className="mt-2 max-w-[760px] text-body leading-[1.8] text-muted-foreground">
            위 글들은 대부분 우나어 회원들이 직접 쓴 것입니다. 어떤 일을 시작했는지, 무엇이
            생각과 달랐는지 적어두면 같은 자리에 선 다른 사람에게 그대로 도움이 됩니다.
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <Link
              href="/community/life2"
              className="inline-flex min-h-[52px] items-center rounded-lg bg-primary px-5 text-[17px] font-bold text-white no-underline transition-colors hover:bg-primary/90"
            >
              2막준비에서 이야기 나누기
            </Link>
            <Link
              href="/jobs"
              className="inline-flex min-h-[52px] items-center rounded-lg border border-border bg-card px-5 text-[17px] font-bold text-foreground no-underline transition-colors hover:border-primary/40 hover:bg-primary/5"
            >
              내일찾기 일자리 전체 보기
            </Link>
            <Link
              href="/guide"
              className="inline-flex min-h-[52px] items-center rounded-lg border border-border bg-card px-5 text-[17px] font-bold text-foreground no-underline transition-colors hover:border-primary/40 hover:bg-primary/5"
            >
              생활 가이드 전체 보기
            </Link>
          </div>
        </section>
      </div>
    </main>
  )
}
