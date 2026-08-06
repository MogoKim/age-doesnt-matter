import { describe, it, expect } from 'vitest'
import { buildPlayStoreUrl, buildPlayStoreUrlRaw, buildAndroidIntentUrlRaw } from '@/lib/app-links'

/**
 * Play스토어 referrer(UTM) 조립 테스트.
 *
 * 배경: 예전에는 진입점과 무관하게 `utm_medium=footer`가 고정이라
 * PostCTA·홈 FAQ·인라인 배너의 설치가 Play Console에서 전부 "footer"로 뭉개졌다.
 * 이제 medium이 진입점을 담는다. 다만 **URL 자체가 깨지면 설치 유도가 통째로 죽으므로**
 * 패키지 id·캠페인·URL 파싱 가능성을 함께 고정한다.
 */

const PACKAGE_ID = 'com.agenotmatter.app'

/** referrer 파라미터를 꺼내 URLSearchParams로 되돌린다 */
function referrerParams(url: string): URLSearchParams {
  const raw = new URL(url).searchParams.get('referrer')
  expect(raw).toBeTruthy()
  return new URLSearchParams(raw as string)
}

describe('buildPlayStoreUrl — URL 무결성', () => {
  it('유효한 Play스토어 URL이고 패키지 id가 유지된다', () => {
    for (const placement of [undefined, 'post_cta', 'home_faq_android', 'inline']) {
      const url = buildPlayStoreUrl(placement)
      const parsed = new URL(url)
      expect(parsed.origin).toBe('https://play.google.com')
      expect(parsed.pathname).toBe('/store/apps/details')
      expect(parsed.searchParams.get('id')).toBe(PACKAGE_ID)
      expect(parsed.searchParams.get('hl')).toBe('ko')
    }
  })

  it('캠페인·source는 그대로 보존된다', () => {
    const p = referrerParams(buildPlayStoreUrl('post_cta'))
    expect(p.get('utm_campaign')).toBe('app_install')
    expect(p.get('utm_source')).toBe('website')
  })
})

describe('buildPlayStoreUrl — medium 하드코딩 제거', () => {
  it('더 이상 medium이 footer로 고정되지 않는다', () => {
    for (const placement of ['post_cta', 'home_faq_android', 'inline']) {
      expect(referrerParams(buildPlayStoreUrl(placement)).get('utm_medium')).not.toBe('footer')
    }
  })

  it('medium이 진입점을 담아 진입점별로 구분된다', () => {
    expect(referrerParams(buildPlayStoreUrl('post_cta')).get('utm_medium')).toBe('post_cta')
    expect(referrerParams(buildPlayStoreUrl('home_faq_android')).get('utm_medium')).toBe('home_faq_android')
    expect(referrerParams(buildPlayStoreUrl('inline')).get('utm_medium')).toBe('inline')
  })

  it('진입점별 referrer가 서로 다르다 (어트리뷰션 분리)', () => {
    const urls = ['post_cta', 'home_faq_android', 'inline'].map((p) => buildPlayStoreUrl(p))
    expect(new Set(urls).size).toBe(urls.length)
  })

  it('utm_content에도 진입점이 남는다', () => {
    expect(referrerParams(buildPlayStoreUrl('post_cta')).get('utm_content')).toBe('post_cta')
  })

  it('진입점을 안 넘기면 기본 medium을 쓰고 content는 비운다', () => {
    const p = referrerParams(buildPlayStoreUrl())
    expect(p.get('utm_medium')).toBe('app_install_cta')
    expect(p.get('utm_content')).toBeNull()
  })

  it('medium을 명시하면 진입점과 분리할 수 있다 (실험 arm 대비)', () => {
    const p = referrerParams(buildPlayStoreUrl('post_cta', { medium: 'exp_install_first' }))
    expect(p.get('utm_medium')).toBe('exp_install_first')
    expect(p.get('utm_content')).toBe('post_cta')
  })
})

describe('buildPlayStoreUrl — referrer 주입 방어', () => {
  it('진입점 문자열이 referrer 구조를 깨뜨리지 못한다', () => {
    const p = referrerParams(buildPlayStoreUrl('evil&utm_campaign=hijacked'))
    expect(p.get('utm_campaign')).toBe('app_install')
    expect(p.get('utm_medium')).not.toContain('&')
  })

  it('안전 문자가 하나도 없으면 기본 medium으로 떨어진다', () => {
    expect(referrerParams(buildPlayStoreUrl('!!!')).get('utm_medium')).toBe('app_install_cta')
  })
})

describe('raw 계열은 영향받지 않는다 (/go 채널 링크)', () => {
  it('buildPlayStoreUrlRaw는 넘긴 referrer를 그대로 싣는다', () => {
    const url = buildPlayStoreUrlRaw('utm_source=naver&utm_medium=blog&utm_campaign=magazine')
    const p = referrerParams(url)
    expect(p.get('utm_source')).toBe('naver')
    expect(p.get('utm_medium')).toBe('blog')
    expect(new URL(url).searchParams.get('id')).toBe(PACKAGE_ID)
  })

  it('빈 referrer면 기본 스토어 URL', () => {
    expect(new URL(buildPlayStoreUrlRaw('')).searchParams.get('id')).toBe(PACKAGE_ID)
  })

  it('intent URL은 앱 패키지와 스토어 폴백을 함께 담는다', () => {
    const intent = buildAndroidIntentUrlRaw('/community/stories', 'utm_source=threads')
    expect(intent).toContain(`package=${PACKAGE_ID}`)
    expect(intent).toContain('S.browser_fallback_url=')
    expect(intent).toContain('intent://age-doesnt-matter.com/community/stories')
  })
})
