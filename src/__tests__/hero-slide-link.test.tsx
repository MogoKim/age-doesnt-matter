import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { HeroSlideLink } from '@/components/features/home/HeroSliderClient'

/**
 * 링크 판별 로직(hero-link.ts)은 순수 함수로 따로 검증한다.
 * 여기서는 그 판별이 **실제 DOM 속성으로 이어지는지**를 본다 —
 * 운영 배너가 아직 내부 링크(/best) 하나뿐이라 외부 링크 렌더를 화면에서 확인할 수 없어서다.
 */

afterEach(cleanup)

describe('HeroSlideLink — 외부 https', () => {
  it('새 탭으로 열고 rel에 noopener/noreferrer/nofollow를 단다', () => {
    render(
      <HeroSlideLink ctaUrl="https://advertiser.example.com/landing" className="x" tabIndex={0}>
        광고 배너
      </HeroSlideLink>
    )
    const a = screen.getByRole('link')
    expect(a).toHaveProperty('tagName', 'A')
    expect(a.getAttribute('href')).toBe('https://advertiser.example.com/landing')
    expect(a.getAttribute('target')).toBe('_blank')
    const rel = (a.getAttribute('rel') ?? '').split(/\s+/)
    expect(rel).toContain('noopener')
    expect(rel).toContain('noreferrer')
    expect(rel).toContain('nofollow')
  })
})

describe('HeroSlideLink — 내부 경로', () => {
  it('같은 탭에서 이동한다 (target/rel 없음)', () => {
    render(
      <HeroSlideLink ctaUrl="/best" className="x" tabIndex={0}>
        내부 배너
      </HeroSlideLink>
    )
    const a = screen.getByRole('link')
    expect(a.getAttribute('href')).toBe('/best')
    expect(a.getAttribute('target')).toBeNull()
    expect(a.getAttribute('rel')).toBeNull()
  })

  it('빈 값이면 홈으로', () => {
    render(
      <HeroSlideLink ctaUrl={null} className="x" tabIndex={0}>
        배너
      </HeroSlideLink>
    )
    expect(screen.getByRole('link').getAttribute('href')).toBe('/')
  })
})

describe('HeroSlideLink — 차단 대상', () => {
  it('javascript: 는 홈으로 되돌리고 새 탭으로 열지 않는다', () => {
    render(
      <HeroSlideLink ctaUrl="javascript:alert(1)" className="x" tabIndex={0}>
        배너
      </HeroSlideLink>
    )
    const a = screen.getByRole('link')
    expect(a.getAttribute('href')).toBe('/')
    expect(a.getAttribute('target')).toBeNull()
  })

  it('http:// 와 //evil.com 도 홈으로', () => {
    render(
      <HeroSlideLink ctaUrl="http://example.com" className="x" tabIndex={0}>
        a
      </HeroSlideLink>
    )
    expect(screen.getByRole('link').getAttribute('href')).toBe('/')
    cleanup()

    render(
      <HeroSlideLink ctaUrl="//evil.com" className="x" tabIndex={0}>
        b
      </HeroSlideLink>
    )
    expect(screen.getByRole('link').getAttribute('href')).toBe('/')
  })
})

describe('HeroSlideLink — 공통', () => {
  it('className과 tabIndex를 그대로 전달한다', () => {
    render(
      <HeroSlideLink ctaUrl="https://example.com" className="absolute inset-0" tabIndex={-1}>
        배너
      </HeroSlideLink>
    )
    const a = screen.getByRole('link')
    expect(a.getAttribute('class')).toBe('absolute inset-0')
    expect(a.getAttribute('tabindex')).toBe('-1')
  })
})
