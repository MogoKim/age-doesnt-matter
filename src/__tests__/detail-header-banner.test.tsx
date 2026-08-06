import { describe, it, expect, afterEach, vi, beforeEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import DetailHeaderBannerClient from '@/components/ad/DetailHeaderBannerClient'
import type { DetailHeaderBannerItem } from '@/components/ad/DetailHeaderBannerClient'

/**
 * 상세 상단 띠배너의 화면 규칙을 고정한다.
 *
 * 왜 렌더 테스트인가: 운영 DB에 지금 브랜드(SELF) 배너 하나뿐이라
 * 광고주(EXTERNAL) 배너의 "광고" 라벨을 실제 화면에서 확인할 방법이 없다.
 * 라벨을 빠뜨리면 광고 표기 의무 위반이라 코드로 못 박아 둔다.
 */

let mockPath = '/community/stories/abc123'
vi.mock('next/navigation', () => ({ usePathname: () => mockPath }))
vi.mock('next/image', () => ({
  default: (p: Record<string, unknown>) =>
    // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
    <img src={p.src as string} alt={p.alt as string} />,
}))

beforeEach(() => {
  mockPath = '/community/stories/abc123'
  vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({ ok: true } as Response)))
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: false, addEventListener() {}, removeEventListener() {} })))
})
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

function item(over: Partial<DetailHeaderBannerItem> = {}): DetailHeaderBannerItem {
  return {
    id: 'ad1', adType: 'SELF', title: '브랜드 배너',
    imageUrl: 'https://img.example.com/a.png',
    htmlCode: null, clickUrl: null, targetPath: null, ...over,
  }
}

describe('광고 라벨 — 브랜드에는 없고 광고주에는 있다', () => {
  it('SELF(브랜드)는 광고 라벨이 없다', () => {
    render(<DetailHeaderBannerClient banners={[item({ adType: 'SELF' })]} />)
    expect(screen.queryByText('광고')).toBeNull()
  })

  it.each(['EXTERNAL', 'GOOGLE', 'COUPANG'])('%s는 광고 라벨이 보인다', (adType) => {
    render(<DetailHeaderBannerClient banners={[item({ adType })]} />)
    expect(screen.getByText('광고')).toBeTruthy()
  })

  it('모르는 유형이 와도 라벨을 붙인다 — 기본값은 안전한 쪽', () => {
    render(<DetailHeaderBannerClient banners={[item({ adType: 'NEW_NETWORK' })]} />)
    expect(screen.getByText('광고')).toBeTruthy()
  })
})

describe('링크 안전 처리', () => {
  it('외부 https는 새 탭 + noopener noreferrer nofollow', () => {
    render(<DetailHeaderBannerClient banners={[item({ adType: 'EXTERNAL', clickUrl: 'https://advertiser.example.com/x' })]} />)
    const a = screen.getByRole('link')
    expect(a.getAttribute('href')).toBe('https://advertiser.example.com/x')
    expect(a.getAttribute('target')).toBe('_blank')
    const rel = (a.getAttribute('rel') ?? '').split(/\s+/)
    expect(rel).toContain('noopener')
    expect(rel).toContain('noreferrer')
    expect(rel).toContain('nofollow')
  })

  it('내부 경로는 같은 탭(target 없음)', () => {
    render(<DetailHeaderBannerClient banners={[item({ clickUrl: '/about' })]} />)
    const a = screen.getByRole('link')
    expect(a.getAttribute('href')).toBe('/about')
    expect(a.getAttribute('target')).toBeNull()
  })

  it('자사 절대주소는 내부 경로로 바뀐다', () => {
    render(<DetailHeaderBannerClient banners={[item({ clickUrl: 'https://age-doesnt-matter.com/best' })]} />)
    expect(screen.getByRole('link').getAttribute('href')).toBe('/best')
  })

  it('javascript: 는 홈으로 되돌린다', () => {
    render(<DetailHeaderBannerClient banners={[item({ clickUrl: 'javascript:alert(1)' })]} />)
    const a = screen.getByRole('link')
    expect(a.getAttribute('href')).toBe('/')
    expect(a.getAttribute('href')).not.toContain('javascript')
  })

  it('clickUrl이 없으면 링크를 만들지 않는다', () => {
    render(<DetailHeaderBannerClient banners={[item({ clickUrl: null })]} />)
    expect(screen.queryByRole('link')).toBeNull()
  })
})

describe('노출 경로 게이트', () => {
  it('상세 화면에서는 렌더된다', () => {
    mockPath = '/magazine/some-article'
    const { container } = render(<DetailHeaderBannerClient banners={[item()]} />)
    expect(container.querySelector('[role="complementary"]')).toBeTruthy()
  })

  it('목록·글쓰기·수정 화면에서는 아무것도 렌더하지 않는다', () => {
    for (const p of ['/community/stories', '/community/write', '/community/stories/abc/edit', '/', '/magazine']) {
      mockPath = p
      const { container } = render(<DetailHeaderBannerClient banners={[item()]} />)
      expect(container.querySelector('[role="complementary"]'), p).toBeNull()
      cleanup()
    }
  })

  it('targetPath가 게시판 접두어면 그 게시판 글에만 뜬다', () => {
    mockPath = '/community/humor/abc123'
    const { container } = render(
      <DetailHeaderBannerClient banners={[item({ targetPath: '/community/stories' })]} />,
    )
    expect(container.querySelector('[role="complementary"]')).toBeNull()
    cleanup()

    mockPath = '/community/stories/abc123'
    const r2 = render(<DetailHeaderBannerClient banners={[item({ targetPath: '/community/stories' })]} />)
    expect(r2.container.querySelector('[role="complementary"]')).toBeTruthy()
  })
})

describe('규격 — 5:1 · 데스크탑 720px', () => {
  it('배너 컨테이너가 5:1 · max-w-720 클래스를 갖는다', () => {
    const { container } = render(<DetailHeaderBannerClient banners={[item()]} />)
    const el = container.querySelector('[role="complementary"]')!
    const cls = el.className
    expect(cls).toContain('[aspect-ratio:5/1]')
    expect(cls).toContain('max-w-[720px]')
    // 목록 띠(3:1/960)와 섞이지 않았는지
    expect(cls).not.toContain('3/1')
    expect(cls).not.toContain('960')
  })
})

describe('노출 집계', () => {
  it('상세에서 배너별로 1회만 보낸다', async () => {
    render(<DetailHeaderBannerClient banners={[item()]} />)
    await new Promise((r) => setTimeout(r, 0))
    const calls = (globalThis.fetch as unknown as { mock: { calls: unknown[][] } }).mock.calls
      .filter((c) => String(c[0]).includes('/api/ad-impression'))
    expect(calls).toHaveLength(1)
  })

  it('상세가 아니면 집계하지 않는다', async () => {
    mockPath = '/community/stories'
    render(<DetailHeaderBannerClient banners={[item()]} />)
    await new Promise((r) => setTimeout(r, 0))
    const calls = (globalThis.fetch as unknown as { mock: { calls: unknown[][] } }).mock.calls
      .filter((c) => String(c[0]).includes('/api/ad-impression'))
    expect(calls).toHaveLength(0)
  })
})
