/**
 * 홈·푸터 → `/guide`·`/topic/*` 연결 계약 (Batch C-2)
 *
 * ── 왜 필요한가 (2026-09-16 내부링크 실측) ────────────────────
 *  공개 229면 기준 내부링크 **수신** 횟수:
 *    `/jobs/region/<시도>` 306 · `/magazine` 229 · `/guide/<글>` 18 · `/topic/<허브>` 2
 *  정작 홈에는 `/guide`·`/topic/*` 로 가는 길이 **하나도 없었다.** 그런데 GSC 상 비홈
 *  최고 성과는 가이드다(쿠팡알바 72노출 · 안경알 48 · 크로스핏 28).
 *
 * ── 이 테스트가 지키는 것 ────────────────────────────────────
 *  1. 세 목적지가 홈과 푸터 양쪽에 있다
 *  2. 🔴 `/topic` 자체로는 **절대 링크하지 않는다** — index 라우트가 없어 404 다
 *  3. 광고·섹션 순서·법정 고지·글씨 크기 기능이 그대로다
 *  4. client 경계를 넓히지 않는다(새 섹션은 서버 컴포넌트)
 *  5. 새 DB 조회가 없다
 *
 * 소스 문자열 검사인 이유: 홈은 Suspense·async 서버 컴포넌트·광고 island 가 얽혀 있어
 * 단위 렌더가 무겁다. **구조 계약만** 가볍게 고정하고, 실제 렌더는 Preview 실측이 본다.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync, existsSync } from 'fs'
import { resolve } from 'path'

const read = (p: string) => readFileSync(resolve(__dirname, p), 'utf8')

/**
 * 주석을 걷어낸 **코드만** 본다.
 * 🔴 이 헬퍼가 없으면 "`/topic` 으로 링크하면 안 된다" 같은 **설명 주석 자체**가
 *    위반으로 잡힌다(2026-09-17 에 실제로 밟았다). 줄 번호는 유지하지 않아도 된다.
 */
const codeOnly = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, '')
const HOME = read('../app/(main)/page.tsx')
const FOOTER = read('../components/layouts/Footer.tsx')
const SECTION = read('../components/features/home/TopicGuideSection.tsx')
const HOME_CODE = codeOnly(HOME)
const FOOTER_CODE = codeOnly(FOOTER)
const SECTION_CODE = codeOnly(SECTION)

const DESTINATIONS = ['/guide', '/topic/menopause', '/topic/second-act'] as const

describe('목적지 연결', () => {
  it('🔴 홈에서 세 목적지로 링크한다', () => {
    for (const href of DESTINATIONS) {
      expect(`${HOME}${SECTION}`, href).toContain(`'${href}'`)
    }
  })

  it('🔴 푸터에서 세 목적지로 링크한다', () => {
    for (const href of DESTINATIONS) {
      expect(FOOTER, href).toContain(`'${href}'`)
    }
  })

  it('🔴 `/topic` 자체로는 링크하지 않는다 — index 라우트가 없어 404 다', () => {
    // 실제로 라우트가 없다는 것부터 확인한다(있으면 이 계약 자체를 다시 봐야 한다)
    expect(existsSync(resolve(__dirname, '../app/(main)/topic/page.tsx'))).toBe(false)
    for (const src of [HOME_CODE, FOOTER_CODE, SECTION_CODE]) {
      expect(src).not.toMatch(/['"`]\/topic['"`]/)
    }
  })

  it('목적지는 절대 URL 이 아니라 앱 내부 경로다 (Link 로 그려진다)', () => {
    for (const href of DESTINATIONS) {
      expect(SECTION + FOOTER).not.toContain(`https://age-doesnt-matter.com${href}`)
    }
  })
})

describe('새 섹션 — client 경계·DB 를 넓히지 않는다', () => {
  it("🔴 'use client' 가 없다 (서버 컴포넌트)", () => {
    expect(SECTION_CODE).not.toMatch(/^\s*['"]use client['"]/m)
  })

  it('🔴 DB·쿼리 레이어를 import 하지 않는다', () => {
    expect(SECTION_CODE).not.toMatch(/@\/lib\/(prisma|queries)/)
    expect(SECTION_CODE).not.toMatch(/unstable_cache|prisma\./)
  })

  it('🔴 홈에 새 데이터 로더가 늘지 않았다 (기존 3개 그대로)', () => {
    const cached = HOME_CODE.match(/unstable_cache\(/g) ?? []
    expect(cached).toHaveLength(2) // getCachedJobs · getCachedMagazine
    expect(HOME).toContain('getCachedHomeSections')
  })

  it('추적용 client island(HomeCardLink)를 새로 쓰지 않는다', () => {
    expect(SECTION_CODE).not.toContain('HomeCardLink')
  })
})

describe('보존 — 광고·섹션 순서', () => {
  it('🔴 홈 광고 컴포넌트가 그대로다', () => {
    for (const ad of ['FeedAd', 'NativeAdSlot', 'ResponsiveAd', 'LazyAd', 'CoupangHome1', 'CoupangHome2', 'AdSenseUnit', 'CoupangDesktopBanner']) {
      expect(HOME, ad).toContain(ad)
    }
  })

  it('🔴 기존 섹션 순서가 그대로다 — 새 섹션은 일자리와 FAQ **사이**에만 들어간다', () => {
    // Project BRIDGE(2026-09-22): SignupCard 제거 — 마지막 앵커가 HomeFaqSection 으로 내려왔다.
    const order = ['HeroSlider', 'FirstGreetingWidget', 'HotContentSections', 'MagazineWrapper', 'JobWrapper', 'TopicGuideSection', 'HomeFaqSection']
    const positions = order.map((name) => HOME.indexOf(`<${name}`))
    for (const [i, pos] of positions.entries()) expect(pos, order[i]).toBeGreaterThan(-1)
    for (let i = 1; i < positions.length; i++) {
      expect(positions[i], `${order[i - 1]} → ${order[i]}`).toBeGreaterThan(positions[i - 1])
    }
  })

  it('🔴 광고 인접 관계가 유지된다 — 매거진 다음이 쿠팡2, HomeFaqSection 다음이 데스크탑 하단', () => {
    // 🔴 import 줄이 아니라 **JSX 사용 지점**으로 앵커한다 — import 는 파일 맨 위에 모여 있어
    //    단순 indexOf 로는 순서 판정이 뒤집힌다(2026-09-17 에 실제로 밟았다).
    const mag = HOME.indexOf('<MagazineWrapper')
    const coupang2 = HOME.indexOf('<CoupangHome2')
    const newSection = HOME.indexOf('<TopicGuideSection')
    // Project BRIDGE(2026-09-22): SignupCard 제거 → 데스크탑 하단 광고의 앵커를 HomeFaqSection 으로 옮겼다.
    //   광고 슬롯(ADSENSE.DESKTOP_BOTTOM) 자체는 그대로다 — 앞 섹션만 바뀌었다.
    const lastSection = HOME.indexOf('<HomeFaqSection')
    expect(mag).toBeGreaterThan(-1)
    expect(coupang2, '<CoupangHome2 JSX').toBeGreaterThan(mag)
    // 새 섹션은 매거진↔쿠팡2 사이에 끼어들지 않았다
    expect(newSection).toBeGreaterThan(coupang2)
    // HomeFaqSection 다음이 데스크탑 하단 광고다
    expect(lastSection, '<HomeFaqSection JSX').toBeGreaterThan(-1)
    expect(HOME.indexOf('ADSENSE.DESKTOP_BOTTOM')).toBeGreaterThan(lastSection)
  })
})

describe('보존 — 푸터 법정 고지·접근성', () => {
  it('🔴 법정 고지·정책 링크가 그대로다', () => {
    for (const s of ['/terms', '/privacy', '/rules', '/contact', '사업자등록번호 457-24-01157', '통신판매업 제2023-서울서초-2160호', '사업자정보확인']) {
      expect(FOOTER, s).toContain(s)
    }
  })

  it('🔴 개인정보처리방침 강조가 유지된다 (법정 고지)', () => {
    expect(FOOTER).toMatch(/href:\s*'\/privacy',\s*emphasis:\s*true/)
  })

  it('🔴 글씨 크기 토글이 유지된다 (접근성)', () => {
    expect(FOOTER).toContain('FooterFontSizeToggle')
  })

  it('주제 링크는 정책 링크 행과 섞이지 않는다 — 배열이 따로다', () => {
    expect(FOOTER).toContain('TOPIC_LINKS')
    expect(FOOTER).toContain('FOOTER_LINKS')
    const policyBlock = FOOTER.slice(FOOTER.indexOf('const FOOTER_LINKS'), FOOTER.indexOf('] as const', FOOTER.indexOf('const FOOTER_LINKS')))
    for (const href of DESTINATIONS) expect(policyBlock, href).not.toContain(href)
  })
})

describe('접근성·터치', () => {
  it('🔴 링크가 키보드 포커스 표시를 갖는다', () => {
    expect(SECTION).toContain('focus-visible:outline')
    const topicNav = FOOTER.slice(FOOTER.indexOf('aria-label="주제별 모아보기"'), FOOTER.indexOf('aria-label="하단 링크"'))
    expect(topicNav).toContain('focus-visible:outline')
  })

  it('🔴 터치 타깃 높이가 확보된다 (토큰 사용 — 하드코딩 px 아님)', () => {
    expect(SECTION).toContain('min-h-control')
    const topicNav = FOOTER.slice(FOOTER.indexOf('aria-label="주제별 모아보기"'), FOOTER.indexOf('aria-label="하단 링크"'))
    expect(topicNav).toContain('min-h-11')
  })

  it('두 내비게이션이 서로 다른 aria-label 을 갖는다', () => {
    expect(FOOTER).toContain('aria-label="주제별 모아보기"')
    expect(FOOTER).toContain('aria-label="하단 링크"')
  })

  it('🔴 좁은 화면에서 넘치지 않는 레이아웃이다 — 가로 스크롤을 쓰지 않는다', () => {
    expect(SECTION).not.toContain('overflow-x-auto')
    expect(SECTION).toContain('flex-col')
    expect(SECTION).toContain('break-keep')
  })
})
