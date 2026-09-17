/**
 * 생활 가이드 — 링크 무결성 · 내용 일치 계약 (2026-09-17)
 *
 * ── 왜 필요한가 (운영 실측) ──────────────────────────────────
 *  두 가이드의 "우리 또래 이야기"·"관련 생활 이야기" 가 **삭제된 글 7건**을 가리키고 있었다.
 *    · `/guide/안경알만-교체-가능-비용`      4건 전부 404 → 살릴 대체가 없어 **비움**
 *    · `/guide/50대-쿠팡알바-재취업-현실`   3건 404 → 같은 질문에 답하는 살아 있는 글 1건으로 대체
 *  사라진 원인은 9/14 공개 콘텐츠 삭제 등이며, **복원·리다이렉트는 이번 범위가 아니다.**
 *
 * ── 이 테스트가 지키는 것 ────────────────────────────────────
 *  1. 링크가 0건이면 제목·박스까지 **안 그린다** (빈 상자로 "이야기가 있다"고 약속하지 않는다)
 *  2. 가이드 데이터가 **삭제 확인된 경로**를 다시 가리키지 않는다
 *  3. 제목·요약·본문·FAQ 가 서로 **모순되지 않는다**
 *     (금액을 안 주기로 한 가이드가 제목에서 "비용 감"을 약속하지 않는다)
 *  4. **검증되지 않은 경험 귀속**("후기가 많다", "…하는 분이 많다")을 사실처럼 쓰지 않는다
 *  5. 🔴 **안경 파손 책임을 고객 부담으로 일반화하지 않는다**
 *  6. 한글 경로는 렌더 시점에 인코딩된다 (네이버 Yeti 계약)
 *  7. 나머지 6개 가이드는 **건드리지 않는다** (날짜·링크 회귀 금지)
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { GUIDES, GUIDE_SLUGS } from '@/lib/guides'
import { encodePathname } from '@/lib/post-url'

const TEMPLATE = readFileSync(resolve(__dirname, '../app/(main)/guide/[slug]/page.tsx'), 'utf8')

const GLASSES = GUIDES['안경알만-교체-가능-비용']
const REJOB = GUIDES['50대-쿠팡알바-재취업-현실']
const TOUCHED = ['안경알만-교체-가능-비용', '50대-쿠팡알바-재취업-현실']

/** 2026-09-17 운영 실측에서 404 로 확인된 경로 — 다시 링크하면 안 된다 */
const CONFIRMED_DEAD = [
  '/community/stories/안경테-가지고-아무-안경점-가서-안경알만-교체-가능할까요',
  '/community/stories/안경-고쳐쓸때-가운데손가락-기분나빠요',
  '/community/humor/안경-쓴-사람들-치킨-먹을-때-특징',
  '/community/stories/50대-사무직이신분들-노안-어떠세요',
  '/community/stories/59세-쿠팡-알바-체험',
  '/community/stories/재취업-후-벌써-2주가-지났습니다',
  '/community/life2/남편-은퇴후-재취업-성공했어요',
]

describe('① 빈 링크 섹션은 그리지 않는다', () => {
  it('🔴 communityLinks 가 0건이면 섹션 전체를 조건부로 감싼다', () => {
    expect(TEMPLATE).toMatch(/\{guide\.communityLinks\.length > 0 && \(/)
  })

  it('🔴 relatedLinks 가 0건이면 섹션 전체를 조건부로 감싼다', () => {
    expect(TEMPLATE).toMatch(/\{guide\.relatedLinks\.length > 0 && \(/)
  })

  it('🔴 제목("📖 우리 또래 이야기")이 조건 안쪽에 있다 — 빈 제목만 남지 않는다', () => {
    const start = TEMPLATE.indexOf('{guide.communityLinks.length > 0 && (')
    const end = TEMPLATE.indexOf('{/* FAQ */}')
    expect(start).toBeGreaterThan(-1)
    expect(TEMPLATE.slice(start, end)).toContain('📖 우리 또래 이야기')
  })

  it('🔴 제목("관련 생활 이야기")이 조건 안쪽에 있다', () => {
    const start = TEMPLATE.indexOf('{guide.relatedLinks.length > 0 && (')
    expect(start).toBeGreaterThan(-1)
    expect(TEMPLATE.slice(start)).toContain('관련 생활 이야기')
  })
})

describe('② 삭제 확인된 경로를 다시 가리키지 않는다', () => {
  it('🔴 어떤 가이드도 404 확인 경로를 링크하지 않는다', () => {
    for (const slug of GUIDE_SLUGS) {
      const g = GUIDES[slug]
      const hrefs = [...g.communityLinks, ...g.relatedLinks].map((l) => l.href)
      for (const dead of CONFIRMED_DEAD) {
        expect(hrefs, `${slug} → ${dead}`).not.toContain(dead)
      }
    }
  })

  it('🔴 안경 가이드는 대체 후보가 없어 두 목록이 비어 있다', () => {
    expect(GLASSES.communityLinks).toEqual([])
    expect(GLASSES.relatedLinks).toEqual([])
  })

  it('🔴 재취업 가이드는 같은 질문에 답하는 글 1건만 남긴다', () => {
    expect(REJOB.communityLinks).toHaveLength(1)
    expect(REJOB.communityLinks[0].href).toBe('/community/stories/52세에-청소부-무기공무직-지원해봅니다')
    expect(REJOB.relatedLinks.map((l) => l.href)).toEqual(['/jobs'])
  })
})

describe('③ 제목·요약·본문·FAQ 가 서로 어긋나지 않는다', () => {
  const text = (g: typeof GLASSES) =>
    [g.title, g.description, g.tldr, ...g.sections.flatMap((s) => [s.heading, ...s.paragraphs]), ...g.faqs.flatMap((f) => [f.q, f.a])].join('\n')

  it('🔴 안경 가이드: 금액을 안 주기로 했으면 제목에서도 "비용 감"을 약속하지 않는다', () => {
    expect(GLASSES.title).not.toContain('비용 감')
    // 본문이 "금액을 적지 않았다"고 말하는 것과 일치해야 한다
    expect(text(GLASSES)).toContain('금액을 적지 않았습니다')
  })

  it('🔴 안경 가이드 본문에 금액 표기가 없다 (원래도 없었다 — 회귀 방지)', () => {
    expect(text(GLASSES)).not.toMatch(/\d[\d,]*\s*(원|만원)/)
  })

  it('🔴 재취업 가이드: 제목이 검증 못 한 "실제 이야기"를 약속하지 않는다', () => {
    expect(REJOB.title).not.toContain('실제 이야기')
    expect(REJOB.description).not.toContain('경험담')
    expect(REJOB.tldr).not.toContain('경험담')
  })

  it('FAQ 질문이 본문이 다루는 범위 안에 있다 — 급여는 양쪽 다 "공고에서 확인"', () => {
    const salaryFaq = REJOB.faqs.find((f) => f.q.includes('급여'))!
    expect(salaryFaq.a).toContain('공고')
    expect(text(REJOB)).toContain('공고')
  })

  it('두 가이드 모두 FAQ 가 비어 있지 않고 질문이 중복되지 않는다', () => {
    for (const g of [GLASSES, REJOB]) {
      expect(g.faqs.length).toBeGreaterThan(0)
      expect(new Set(g.faqs.map((f) => f.q)).size).toBe(g.faqs.length)
    }
  })
})

describe('④ 검증되지 않은 경험 귀속을 쓰지 않는다', () => {
  const ATTRIBUTION = /후기가 많|하는 분이 많|많은 분이|라고들 하십니다|다는 분이 많|경험담/
  it('🔴 두 가이드 어디에도 검증 안 된 경험 귀속 표현이 없다', () => {
    for (const g of [GLASSES, REJOB]) {
      const all = [g.title, g.description, g.tldr, ...g.sections.flatMap((s) => [s.heading, ...s.paragraphs]), ...g.faqs.flatMap((f) => [f.q, f.a])]
      for (const line of all) expect(line, `${g.slug}: ${line.slice(0, 40)}`).not.toMatch(ATTRIBUTION)
    }
  })
})

describe('⑤ 안경 파손 책임을 고객 부담으로 일반화하지 않는다', () => {
  it('🔴 "손님 부담" 류 단정이 없다', () => {
    const all = [GLASSES.tldr, ...GLASSES.sections.flatMap((s) => s.paragraphs), ...GLASSES.faqs.map((f) => f.a)].join('\n')
    expect(all).not.toContain('손님 부담')
    expect(all).not.toContain('고객 부담')
  })

  it('🔴 대신 매장별 확인사항으로 안내한다', () => {
    const all = [...GLASSES.sections.flatMap((s) => s.paragraphs), ...GLASSES.faqs.map((f) => f.a)].join('\n')
    expect(all).toMatch(/매장마다|매장에 따라|매장 방침|매장에 (직접 )?확인/)
  })
})

describe('⑥ 한글 경로 인코딩 계약', () => {
  it('데이터는 사람이 읽는 한글 경로로 두고, 렌더 시점에 인코딩한다', () => {
    expect(TEMPLATE).toContain('encodePathname(l.href)')
  })

  it('🔴 인코딩 결과에 raw 한글·%25 가 없다', () => {
    for (const slug of GUIDE_SLUGS) {
      const g = GUIDES[slug]
      for (const l of [...g.communityLinks, ...g.relatedLinks]) {
        const enc = encodePathname(l.href)
        expect(/[^\x20-\x7E]/.test(enc), `${slug} ${l.href}`).toBe(false)
        expect(enc.includes('%25'), `${slug} ${l.href}`).toBe(false)
        expect(decodeURI(enc)).toBe(l.href)
      }
    }
  })
})

describe('⑦ 나머지 6개 가이드 회귀 없음', () => {
  const OTHERS = GUIDE_SLUGS.filter((s) => !TOUCHED.includes(s))

  it('가이드는 총 8개, 손댄 것은 2개뿐이다', () => {
    expect(GUIDE_SLUGS).toHaveLength(8)
    expect(OTHERS).toHaveLength(6)
  })

  it('🔴 나머지 6개의 updatedAt 은 2026-07-01 그대로다', () => {
    for (const slug of OTHERS) expect(GUIDES[slug].updatedAt, slug).toBe('2026-07-01')
  })

  it('🔴 손댄 2개도 최초 발행일(publishedAt)은 유지한다', () => {
    for (const slug of TOUCHED) expect(GUIDES[slug].publishedAt, slug).toBe('2026-07-01')
  })

  it('손댄 2개만 updatedAt 이 갱신됐다 — 내용이 실제로 바뀌었기 때문', () => {
    for (const slug of TOUCHED) expect(GUIDES[slug].updatedAt, slug).toBe('2026-09-17')
  })

  it('나머지 6개는 링크를 그대로 갖고 있다 (빈 배열로 만들지 않았다)', () => {
    const withLinks = OTHERS.filter((s) => GUIDES[s].communityLinks.length + GUIDES[s].relatedLinks.length > 0)
    expect(withLinks.length).toBe(OTHERS.length)
  })

  it('모든 가이드가 필수 필드를 갖는다', () => {
    for (const slug of GUIDE_SLUGS) {
      const g = GUIDES[slug]
      for (const k of ['slug', 'title', 'description', 'tldr', 'publishedAt', 'updatedAt'] as const) {
        expect(g[k], `${slug}.${k}`).toBeTruthy()
      }
      expect(g.sections.length, slug).toBeGreaterThan(0)
    }
  })
})
