import { describe, it, expect } from 'vitest'
import { resolveHeroLink } from '@/lib/hero-link'

/**
 * 광고 슬롯이 쓰던 자체 classifyLink를 resolveHeroLink로 합치면서,
 * 자사 도메인을 내부 경로로 되돌리던 동작을 잃지 않게 고정한다.
 * 운영 광고가 실제로 "https://age-doesnt-matter.com/" 형태로 저장돼 있다.
 */

describe('resolveHeroLink — 자사 도메인 절대주소', () => {
  it('자사 도메인은 내부 경로로 되돌린다', () => {
    expect(resolveHeroLink('https://age-doesnt-matter.com/best')).toEqual({
      kind: 'internal',
      href: '/best',
    })
  })

  it('운영 데이터 형태(루트)도 내부로', () => {
    expect(resolveHeroLink('https://age-doesnt-matter.com/')).toEqual({
      kind: 'internal',
      href: '/',
    })
  })

  it('쿼리·해시를 보존한다', () => {
    expect(resolveHeroLink('https://age-doesnt-matter.com/community/stories?src=ad#top')).toEqual({
      kind: 'internal',
      href: '/community/stories?src=ad#top',
    })
  })

  it('www 서브도메인도 내부로', () => {
    expect(resolveHeroLink('https://www.age-doesnt-matter.com/magazine').kind).toBe('internal')
  })

  it('다른 도메인은 외부 그대로', () => {
    expect(resolveHeroLink('https://example.com').kind).toBe('external')
    expect(resolveHeroLink('https://advertiser.co.kr/landing').kind).toBe('external')
  })

  it('자사 도메인을 흉내낸 주소는 외부로 둔다', () => {
    // age-doesnt-matter.com.evil.com 은 우리 도메인이 아니다
    expect(resolveHeroLink('https://age-doesnt-matter.com.evil.com/x').kind).toBe('external')
  })
})
