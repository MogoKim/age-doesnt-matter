import Link from 'next/link'
import type { Metadata } from 'next'

import Breadcrumbs from '@/components/common/Breadcrumbs'
import { getMenopauseHubSections, type HubLink } from '@/lib/seo/topic-menopause'

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://age-doesnt-matter.com'
const CANONICAL = `${BASE_URL}/topic/menopause`

// 자료는 매거진·갱년기톡 발행 주기에 맞춰 1시간이면 충분하다(내부 조회도 unstable_cache로 한 번 더 묶여 있다).
export const revalidate = 3600

export const metadata: Metadata = {
  title: '갱년기 — 폐경·완경부터 몸과 마음의 변화까지 | 40대 50대 60대 여성',
  description:
    '안면홍조와 불면, 관절 통증, 감정 기복, 병원과 호르몬 치료 선택까지. 갱년기를 지나는 40대 50대 60대 여성이 '
    + '실제로 묻고 답한 이야기와 정리된 정보를 주제별로 모았습니다.',
  alternates: { canonical: CANONICAL },
  robots: { index: true, follow: true },
  openGraph: {
    title: '갱년기 — 우리 또래가 실제로 묻고 답한 이야기',
    description:
      '폐경·완경, 몸의 변화, 감정과 관계, 병원·치료 선택까지 갱년기 주제를 한곳에 모았습니다.',
    url: CANONICAL,
    type: 'website',
    siteName: '우리 나이가 어때서',
    locale: 'ko_KR',
  },
}

function LinkCard({ item, kind }: { item: HubLink; kind: 'magazine' | 'community' }) {
  return (
    <Link
      href={item.href}
      className="block rounded-lg border border-border bg-card p-4 no-underline shadow-sm transition-colors hover:border-primary/40 hover:bg-primary/5"
    >
      <span className="text-caption font-bold text-primary-text">
        {kind === 'magazine' ? '정리된 정보' : '우리 또래 이야기'}
        {kind === 'community' && item.commentCount ? ` · 댓글 ${item.commentCount}` : ''}
      </span>
      <h4 className="m-0 mt-1 text-body font-bold leading-[1.45] text-foreground">{item.title}</h4>
      {item.excerpt && (
        <p className="mt-2 line-clamp-2 text-[17px] leading-[1.7] text-muted-foreground">{item.excerpt}</p>
      )}
    </Link>
  )
}

export default async function MenopauseTopicPage() {
  const sections = await getMenopauseHubSections()

  const collectionLd = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: '갱년기 — 폐경·완경부터 몸과 마음의 변화까지',
    description:
      '갱년기를 지나는 40대 50대 60대 여성을 위해 폐경·완경, 몸의 변화, 감정과 관계, 병원·치료 선택 주제를 모은 페이지입니다.',
    url: CANONICAL,
    inLanguage: 'ko-KR',
    isPartOf: { '@type': 'WebSite', name: '우리 나이가 어때서', url: BASE_URL },
    mainEntity: {
      '@type': 'ItemList',
      itemListElement: sections.flatMap((section) => [...section.magazine, ...section.community]).map((item, index) => ({
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
        <Breadcrumbs items={[{ label: '홈', href: '/' }, { label: '갱년기' }]} />

        <header className="mb-7">
          <p className="mb-2 text-caption font-bold text-primary-text">갱년기</p>
          <h1 className="m-0 text-2xl font-bold leading-[1.35] text-foreground md:text-3xl">
            갱년기, 나만 이런 게 아닙니다
          </h1>
          <p className="mt-4 max-w-[760px] text-body leading-[1.8] text-muted-foreground">
            얼굴이 화끈거리고 새벽에 자꾸 깨고, 이유 없이 눈물이 납니다. 생리가 불규칙해지면서
            &lsquo;내가 지금 어디쯤 온 건가&rsquo; 싶어집니다. 갱년기는 40대 후반부터 60대까지 몇 년에 걸쳐
            지나가고, 증상도 사람마다 다릅니다. 그래서 정보 하나보다 <strong className="font-bold text-foreground">먼저 지나간
            사람의 이야기</strong>가 더 도움이 될 때가 많습니다.
          </p>
          <p className="mt-3 max-w-[760px] text-body leading-[1.8] text-muted-foreground">
            이 페이지는 우나어에 쌓인 갱년기 이야기를 네 가지 주제로 나눠 모았습니다. 궁금한 쪽부터
            읽어보세요. 여기 있는 글은 진단이나 처방이 아닙니다. 몸에 이상이 느껴진다면 반드시
            의료진과 상의하시고, 이곳은 결정을 앞두고 참고할 경험을 얻는 곳으로 써주세요.
          </p>
        </header>

        <nav aria-label="갱년기 주제 바로가기" className="mb-8 rounded-lg border border-border bg-card p-4">
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
            </section>
          ))}
        </div>

        <section className="mt-10 border-t border-border pt-6">
          <h2 className="m-0 text-lg font-bold text-foreground">지금 겪고 있는 이야기를 나눠주세요</h2>
          <p className="mt-2 max-w-[760px] text-body leading-[1.8] text-muted-foreground">
            위 글들은 모두 우나어 갱년기톡에서 실제로 오간 이야기입니다. 증상이 언제 시작됐는지,
            무엇이 도움이 됐는지 적어두면 같은 시기를 지나는 다른 사람에게 그대로 도움이 됩니다.
            인생 2막을 준비하는 이야기나 또래들의 일상이 궁금하다면 아래에서 이어서 보세요.
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <Link
              href="/community/menopause"
              className="inline-flex min-h-[52px] items-center rounded-lg bg-primary px-5 text-[17px] font-bold text-white no-underline transition-colors hover:bg-primary/90"
            >
              갱년기톡에서 이야기 나누기
            </Link>
            <Link
              href="/community/life2"
              className="inline-flex min-h-[52px] items-center rounded-lg border border-border bg-card px-5 text-[17px] font-bold text-foreground no-underline transition-colors hover:border-primary/40 hover:bg-primary/5"
            >
              은퇴·노후를 준비하는 인생 2막 이야기
            </Link>
            <Link
              href="/magazine"
              className="inline-flex min-h-[52px] items-center rounded-lg border border-border bg-card px-5 text-[17px] font-bold text-foreground no-underline transition-colors hover:border-primary/40 hover:bg-primary/5"
            >
              건강·생활 매거진 전체 보기
            </Link>
          </div>
        </section>
      </div>
    </main>
  )
}
