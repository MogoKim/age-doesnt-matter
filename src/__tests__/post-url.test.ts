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

  it('🔴 slash 를 인코딩한다 — segment 하나가 경로 segment 둘로 쪼개지면 라우팅이 바뀐다', () => {
    // 2026-09-15 Codex 리뷰: 예전 구현은 `a/b` 를 그대로 둬서 segment 가 2개가 됐다.
    // 경로 구분자 보존은 `encodePathname` 의 책임이지 segment 함수의 책임이 아니다.
    expect(encodePathSegment('a/b')).toBe('a%2Fb')
    expect(encodePathSegment('a/b').split('/')).toHaveLength(1)
  })

  it('빈 문자열은 빈 문자열', () => {
    expect(encodePathSegment('')).toBe('')
  })

  // ── 🔴 Codex 리뷰(2026-09-15) 로 드러난 구멍들 ──────────────
  describe('부분·비정상 인코딩 입력에서도 ASCII 계약을 지킨다', () => {
    const ASCII_ONLY = (v: string) => expect(/[^\x20-\x7E]/.test(v), v).toBe(false)

    it('🔴 혼합 인코딩 — `%XX` 가 섞여 있어도 raw 한글을 남기지 않는다', () => {
      // 예전 구현은 `%XX` 가 하나라도 보이면 segment 전체를 그대로 반환했다.
      const out = encodePathSegment('한글-%20-test')
      ASCII_ONLY(out)
      expect(out).toBe('%ED%95%9C%EA%B8%80-%20-test')
      expect(out).not.toContain('%25')
    })

    it('🔴 encoded slash 가 섞여도 ASCII 한 segment 다', () => {
      const out = encodePathSegment('한글-%2F-경로')
      ASCII_ONLY(out)
      expect(out).toBe('%ED%95%9C%EA%B8%80-%2F-%EA%B2%BD%EB%A1%9C')
      // `%2F` 는 경로 구분자가 **아니다** — segment 안에 남아야 한다
      expect(out.split('/')).toHaveLength(1)
    })

    it('🔴 malformed percent — decode 가 실패하면 날것으로 보고 인코딩한다', () => {
      // `%` 뒤에 hex 가 없다 → 유효한 인코딩이 아니다 → 리터럴 `%` 이므로 `%25` 가 맞다.
      // 이건 이중 인코딩이 아니라 정상 표기다.
      const out = encodePathSegment('50%-할인')
      ASCII_ONLY(out)
      expect(out).toBe('50%25-%ED%95%A0%EC%9D%B8')
      expect(decodeURIComponent(out)).toBe('50%-할인')
    })

    it('🔴 잘린 percent(`%E0`·`%`)도 ASCII 로 떨어진다', () => {
      for (const bad of ['%', '%E', '%E0', '끝-%', '%ZZ-한글']) {
        ASCII_ONLY(encodePathSegment(bad))
      }
    })

    it('🔴 어떤 입력이 와도 결과는 항상 ASCII 다', () => {
      const inputs = [
        '점심', '%EC%A0%90%EC%8B%AC', '한글-%20-test', '한글-%2F-경로', '50%-할인',
        'a/b', '%', '이모지-😀', 'plain-ascii', '공백 있는 슬러그', '물음표?와#샵',
      ]
      for (const i of inputs) ASCII_ONLY(encodePathSegment(i))
    })

    it('🔴 멱등 — 두 번, 세 번 넣어도 `%25` 로 부풀지 않는다', () => {
      for (const i of ['점심', '한글-%20-test', '한글-%2F-경로', 'a/b', '50%-할인']) {
        const once = encodePathSegment(i)
        const twice = encodePathSegment(once)
        expect(twice, `입력: ${i}`).toBe(once)
        expect(encodePathSegment(twice)).toBe(once)
      }
    })

    it('`?`·`#` 처럼 경로를 끊는 문자도 인코딩한다', () => {
      const out = encodePathSegment('물음표?와#샵')
      expect(out).not.toContain('?')
      expect(out).not.toContain('#')
    })
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
  it('🔴 경로 구분자 보존은 여기 책임이다 — segment 안의 `/` 는 `%2F` 로 지킨다', () => {
    // 경로: `/magazine/series/<한글>` → segment 3개 유지
    expect(encodePathname('/magazine/series/한글-시리즈').split('/')).toHaveLength(4)
    // segment 로 넘기면 하나로 유지
    expect(encodePathSegment('한글/시리즈').split('/')).toHaveLength(1)
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
