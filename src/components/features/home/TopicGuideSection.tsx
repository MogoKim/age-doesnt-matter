import Link from 'next/link'

/**
 * 주제별 모아보기 — `/guide` · `/topic/menopause` · `/topic/second-act` 진입점.
 *
 * ── 왜 만들었나 (2026-09-16 내부링크 실측) ────────────────────
 *  공개 229면 기준 내부링크 **수신** 횟수가 이렇게 기울어 있었다:
 *    `/jobs/region/<시도>` 306 · `/magazine` 229 · `/guide/<글>` 18 · `/topic/<허브>` 2
 *  정작 홈에는 `/guide`·`/topic/*` 로 가는 길이 **하나도 없었다.** 그런데 GSC 상
 *  비홈 최고 성과는 가이드다(쿠팡알바 72노출 · 안경알 48 · 크로스핏 28).
 *  즉 **사람이 찾는 글로 가는 길이 홈에 없었다.** 그 길을 만든다.
 *
 * ── 설계 ────────────────────────────────────────────────────
 *  · **서버 컴포넌트**다. DB 조회도, client 경계도 늘리지 않는다.
 *    홈의 다른 카드는 GA4 추적용 `HomeCardLink`(client)를 쓰지만, 여기는 목적지가
 *    고정 3개뿐이라 추적 island 를 새로 만들 이유가 없다 — 평범한 `next/link` 로 충분하다.
 *  · `/topic` 자체에는 **index 라우트가 없다**(`app/(main)/topic/` = `menopause`·`second-act` 뿐).
 *    🔴 `/topic` 으로 링크하면 404 다. 개별 허브로만 링크한다.
 *  · 문구는 각 목적지의 실제 제목에서 가져왔다 — 없는 내용을 홈에서 약속하지 않는다.
 */

const DESTINATIONS = [
  {
    href: '/topic/menopause',
    label: '갱년기',
    description: '폐경·완경부터 몸과 마음의 변화까지',
  },
  {
    href: '/topic/second-act',
    label: '인생 2막',
    description: '재취업·연금·노후 준비를 한자리에',
  },
  {
    href: '/guide',
    label: '생활 가이드',
    description: '살림·건강·돈, 우리 나이에 맞는 쉬운 정보',
  },
] as const

export default function TopicGuideSection() {
  return (
    <section className="py-4 border-b-4 border-background lg:py-8 lg:border-b-0" aria-labelledby="home-topic-guide">
      <div className="mb-4 px-4 lg:px-0">
        <h2 id="home-topic-guide" className="text-title font-bold text-foreground">
          주제별로 모아 보기
        </h2>
      </div>

      {/* 모바일: 세로 스택 / 데스크탑: 3열 — 가로 스크롤을 쓰지 않아 좁은 화면에서 넘치지 않는다 */}
      <div className="flex flex-col gap-2 px-4 lg:grid lg:grid-cols-3 lg:gap-4 lg:px-0">
        {DESTINATIONS.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="flex min-h-control flex-col justify-center rounded-xl border border-border bg-card px-4 py-3 no-underline text-inherit transition-colors hover:border-primary focus-visible:outline-2 focus-visible:outline-primary active:opacity-95"
          >
            <span className="text-body font-bold text-foreground break-keep">{item.label}</span>
            <span className="mt-0.5 text-caption text-muted-foreground break-keep">{item.description}</span>
          </Link>
        ))}
      </div>
    </section>
  )
}
