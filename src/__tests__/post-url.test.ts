/**
 * 글 URL 생성 — **RFC 호환 ASCII URL** 계약.
 *
 * ── 왜 필요한가 ──────────────────────────────────────────────
 *  slug 가 한글이라 URL 에 **raw non-ASCII** 가 그대로 들어갔다.
 *  브라우저는 알아서 인코딩해 주지만 **네이버 크롤러(Yeti)는 그 URL 을 못 가져온다** —
 *  같은 글이라도 percent-encoded URL 로는 200, raw 한글 URL 로는 접근 실패였다.
 *  production sitemap 229개 중 **138개가 raw non-ASCII** 였다.
 *
 *  canonical·og:url 은 이미 인코딩돼 있었다. 즉 **sitemap 과 SSR 내부 링크만** 규칙이 달랐다.
 *
 * ── 지켜야 할 것 ─────────────────────────────────────────────
 *  · 경로 segment 만 **정확히 한 번** 인코딩한다
 *  · `/` 를 인코딩하지 않는다 — 경로 구조가 깨진다
 *  · 이미 인코딩된 `%` 를 `%25` 로 **이중 인코딩하지 않는다**
 *  · `decodeURI` 하면 원래 URL 과 같아야 한다 — 가리키는 대상이 바뀌면 안 된다
 */
import { describe, expect, it } from 'vitest'
import {
  encodePathSegment, buildPostPath, buildPostUrl, encodePathname, SITE_ORIGIN,
} from '@/lib/post-url'

describe('encodePathSegment — segment 하나만 정확히 한 번', () => {
  it('한글을 percent-encode 한다', () => {
    expect(encodePathSegment('점심')).toBe('%EC%A0%90%EC%8B%AC')
  })
  it('ASCII 는 그대로 둔다', () => {
    expect(encodePathSegment('cmn3617au000cey2u11lxlmx7')).toBe('cmn3617au000cey2u11lxlmx7')
  })
  it('하이픈·숫자는 인코딩하지 않는다', () => {
    expect(encodePathSegment('50대-이력서-2')).toBe('50%EB%8C%80-%EC%9D%B4%EB%A0%A5%EC%84%9C-2')
  })

  it('🔴 이미 인코딩된 값을 다시 인코딩하지 않는다 (%25 이중 인코딩 금지)', () => {
    const once = encodePathSegment('점심')
    expect(encodePathSegment(once)).toBe(once)
    expect(encodePathSegment(once)).not.toContain('%25')
  })

  it('🔴 slash 를 인코딩하지 않는다 — segment 에 들어오면 그대로 둔다', () => {
    // segment 함수는 slash 를 받지 않는 게 정상이지만, 받아도 경로를 깨지 않는다.
    expect(encodePathSegment('a/b')).toBe('a/b')
  })

  it('빈 문자열은 빈 문자열', () => {
    expect(encodePathSegment('')).toBe('')
  })

  it('decodeURIComponent 하면 원래 값으로 돌아온다', () => {
    for (const s of ['점심-뭐드세요', '60살에-운전면허', 'abc-123', '오늘-손주-돌잔치에-다녀왔어요']) {
      expect(decodeURIComponent(encodePathSegment(s))).toBe(s)
    }
  })
})

describe('encodePathname — 경로 전체', () => {
  it('각 segment 를 인코딩하고 slash 는 보존한다', () => {
    expect(encodePathname('/community/stories/점심'))
      .toBe('/community/stories/%EC%A0%90%EC%8B%AC')
  })
  it('🔴 slash 개수가 보존된다', () => {
    const out = encodePathname('/community/stories/한글-슬러그')
    expect(out.split('/').length).toBe(4)
    expect(out.startsWith('/community/stories/')).toBe(true)
  })
  it('이미 인코딩된 경로는 그대로다 — 멱등', () => {
    const once = encodePathname('/magazine/한글')
    expect(encodePathname(once)).toBe(once)
    expect(encodePathname(once)).not.toContain('%25')
  })
  it('ASCII 전용 경로는 변하지 않는다', () => {
    expect(encodePathname('/jobs/cmn3617au000cey2u11lxlmx7')).toBe('/jobs/cmn3617au000cey2u11lxlmx7')
  })
  it('decodeURI 하면 원래 경로와 같다', () => {
    const raw = '/community/stories/점심-뭐드세요'
    expect(decodeURI(encodePathname(raw))).toBe(raw)
  })
})

// ── 글 경로 ──────────────────────────────────────────────────
type P = Parameters<typeof buildPostPath>[0]
const post = (over: Partial<P> = {}): P => ({
  id: 'cmn3617au000cey2u11lxlmx7', boardType: 'STORY', slug: null, ...over,
} as P)

describe('buildPostPath — 보드별 경로 + 인코딩', () => {
  it('JOB 은 id 를 쓴다', () => {
    expect(buildPostPath(post({ boardType: 'JOB' }))).toBe('/jobs/cmn3617au000cey2u11lxlmx7')
  })
  it('MAGAZINE 은 slug 우선', () => {
    expect(buildPostPath(post({ boardType: 'MAGAZINE', slug: '50대-이력서' })))
      .toBe('/magazine/50%EB%8C%80-%EC%9D%B4%EB%A0%A5%EC%84%9C')
  })
  it('MAGAZINE slug 가 없으면 id', () => {
    expect(buildPostPath(post({ boardType: 'MAGAZINE' }))).toBe('/magazine/cmn3617au000cey2u11lxlmx7')
  })
  it('커뮤니티는 보드 slug 경로를 쓴다', () => {
    expect(buildPostPath(post({ boardType: 'STORY', slug: '점심' })))
      .toBe('/community/stories/%EC%A0%90%EC%8B%AC')
    expect(buildPostPath(post({ boardType: 'HUMOR', slug: '점심' })))
      .toBe('/community/humor/%EC%A0%90%EC%8B%AC')
  })
  it('알 수 없는 boardType 은 stories 로 떨어진다 — `/community/undefined/...` 금지', () => {
    // 기존 호출부(SearchResults·my/posts·my/scraps·BestContent)가 쓰던 `?? 'stories'` 와 같은 방어다.
    expect(buildPostPath(post({ boardType: 'NOT_A_BOARD', slug: '한글' })))
      .toBe('/community/stories/%ED%95%9C%EA%B8%80')
  })

  it('🔴 결과에 raw non-ASCII 가 없다', () => {
    for (const bt of ['STORY', 'HUMOR', 'LIFE2', 'WEEKLY', 'MAGAZINE']) {
      const out = buildPostPath(post({ boardType: bt as P['boardType'], slug: '한글-슬러그-테스트' }))
      expect(/[^\x20-\x7E]/.test(out), `${bt}: ${out}`).toBe(false)
    }
  })
  it('🔴 %25 가 없다', () => {
    const out = buildPostPath(post({ boardType: 'MAGAZINE', slug: '한글' }))
    expect(out).not.toContain('%25')
  })
  it('decodeURI 하면 사람이 읽는 경로로 돌아온다', () => {
    expect(decodeURI(buildPostPath(post({ boardType: 'MAGAZINE', slug: '50대-이력서' }))))
      .toBe('/magazine/50대-이력서')
  })
})

describe('buildPostUrl — 절대 URL', () => {
  it('origin 을 붙인다', () => {
    expect(buildPostUrl(post({ boardType: 'MAGAZINE', slug: '한글' })))
      .toBe(`${SITE_ORIGIN}/magazine/%ED%95%9C%EA%B8%80`)
  })
  it('🔴 URL 로 파싱되고 pathname 이 인코딩돼 있다', () => {
    const u = new URL(buildPostUrl(post({ boardType: 'STORY', slug: '점심-뭐드세요' })))
    expect(u.pathname).toBe('/community/stories/%EC%A0%90%EC%8B%AC-%EB%AD%90%EB%93%9C%EC%84%B8%EC%9A%94')
    expect(/[^\x20-\x7E]/.test(u.pathname)).toBe(false)
  })
  it('🔴 멱등 — 같은 글은 항상 같은 URL', () => {
    const p = post({ boardType: 'MAGAZINE', slug: '한글' })
    expect(buildPostUrl(p)).toBe(buildPostUrl(p))
  })
  it('origin 은 사이트 도메인이다', () => {
    expect(SITE_ORIGIN).toBe('https://age-doesnt-matter.com')
  })
})
