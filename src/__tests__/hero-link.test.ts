import { describe, it, expect } from 'vitest'
import { resolveHeroLink, validateCtaUrlForSave } from '@/lib/hero-link'

/**
 * 히어로 배너를 광고 지면으로 팔려면 외부 링크를 받아야 한다.
 * 기존에는 ctaUrl을 그대로 <Link>에 넣어, 외부 도메인도 같은 탭에서 열리고
 * (앱 웹뷰에 갇힘) 이상한 스킴도 그대로 렌더됐다. 그 계약을 여기서 고정한다.
 */

describe('resolveHeroLink — 내부 경로', () => {
  it('/로 시작하면 내부 이동', () => {
    expect(resolveHeroLink('/best')).toEqual({ kind: 'internal', href: '/best' })
    expect(resolveHeroLink('/community/stories')).toEqual({ kind: 'internal', href: '/community/stories' })
  })

  it('쿼리·해시가 붙어도 내부', () => {
    expect(resolveHeroLink('/events/abc?src=hero#top')).toEqual({
      kind: 'internal',
      href: '/events/abc?src=hero#top',
    })
  })

  it('앞뒤 공백은 잘라낸다', () => {
    expect(resolveHeroLink('  /best  ')).toEqual({ kind: 'internal', href: '/best' })
  })

  it('빈 값·null·undefined는 홈', () => {
    expect(resolveHeroLink('')).toEqual({ kind: 'internal', href: '/' })
    expect(resolveHeroLink('   ')).toEqual({ kind: 'internal', href: '/' })
    expect(resolveHeroLink(null)).toEqual({ kind: 'internal', href: '/' })
    expect(resolveHeroLink(undefined)).toEqual({ kind: 'internal', href: '/' })
  })
})

describe('resolveHeroLink — 외부 링크', () => {
  it('https는 외부로 허용', () => {
    expect(resolveHeroLink('https://example.com')).toEqual({ kind: 'external', href: 'https://example.com' })
    expect(resolveHeroLink('https://ad.example.co.kr/landing?utm=hero')).toEqual({
      kind: 'external',
      href: 'https://ad.example.co.kr/landing?utm=hero',
    })
  })

  it('대문자 스킴도 허용', () => {
    expect(resolveHeroLink('HTTPS://example.com').kind).toBe('external')
  })
})

describe('resolveHeroLink — 차단', () => {
  it('http는 막는다 (혼합 콘텐츠·중간자 위험)', () => {
    const r = resolveHeroLink('http://example.com')
    expect(r.kind).toBe('blocked')
    expect(r.href).toBe('/')
  })

  it('javascript: 스킴을 막는다', () => {
    expect(resolveHeroLink('javascript:alert(1)').kind).toBe('blocked')
    expect(resolveHeroLink('  JavaScript : alert(1)').kind).toBe('blocked')
  })

  it('data:·vbscript:·file:·ftp:·mailto:·tel:을 막는다', () => {
    for (const u of [
      'data:text/html,<script>alert(1)</script>',
      'vbscript:msgbox(1)',
      'file:///etc/passwd',
      'ftp://example.com/a',
      'mailto:a@b.com',
      'tel:01012345678',
      'blob:https://example.com/x',
      'about:blank',
    ]) {
      expect(resolveHeroLink(u).kind, u).toBe('blocked')
    }
  })

  it('프로토콜 상대 경로(//evil.com)를 막는다 — 내부처럼 보이지만 외부다', () => {
    const r = resolveHeroLink('//evil.com')
    expect(r.kind).toBe('blocked')
    expect(r.href).toBe('/')
  })

  it('스킴 없는 도메인·상대경로를 막는다', () => {
    expect(resolveHeroLink('example.com').kind).toBe('blocked')
    expect(resolveHeroLink('community/stories').kind).toBe('blocked')
  })

  it('차단 시 항상 홈으로 되돌리고 사유를 준다', () => {
    const r = resolveHeroLink('javascript:alert(1)')
    expect(r.href).toBe('/')
    expect(r.reason).toBeTruthy()
  })
})

describe('validateCtaUrlForSave — 관리자 저장 단계', () => {
  it('내부·외부·빈 값은 통과(null 반환)', () => {
    expect(validateCtaUrlForSave('/best')).toBeNull()
    expect(validateCtaUrlForSave('https://example.com')).toBeNull()
    expect(validateCtaUrlForSave('')).toBeNull()
    expect(validateCtaUrlForSave(null)).toBeNull()
  })

  it('차단 대상은 사유 문자열을 반환해 저장을 막는다', () => {
    expect(validateCtaUrlForSave('javascript:alert(1)')).toBeTruthy()
    expect(validateCtaUrlForSave('http://example.com')).toBeTruthy()
    expect(validateCtaUrlForSave('//evil.com')).toBeTruthy()
  })
})
