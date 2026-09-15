/**
 * `/dev/*` 노출 통제 — **환경별 허용/차단 계약**.
 *
 * ── 왜 필요한가 ──────────────────────────────────────────────
 *  2026-09-15 실측: `/dev/components` · `/dev/qa-report` · `/dev/event-preview` 가
 *  **production 에서 200** 이었다. 내부 미리보기 화면이 외부에 그대로 열려 있었다.
 *
 *  🔴 **`noindex` 는 접근 통제가 아니다.** 이 페이지들에는 `noindex, nofollow` 가 붙어 있었지만
 *     그것은 "검색엔진에 넣지 마라"는 요청일 뿐, URL 을 아는 사람의 접근을 막지 못한다.
 *     `robots.txt` 도 마찬가지다(애초에 `/dev/` Disallow 도 없었다).
 *     막아야 하는 것은 **서버 응답**이다.
 *
 * ── 계약 ────────────────────────────────────────────────────
 *  · Vercel **production** → 404
 *  · Vercel **preview** → 허용 (Preview E2E 가 `/dev/event-preview` 를 쓴다)
 *  · **로컬**(VERCEL_ENV 없음) → 허용
 *  · 차단은 **middleware 한 곳**에서 한다 — 페이지마다 흩어두면 새 라우트가 새어 나간다
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { isDevRoute, isDevRouteAllowed, DEV_ROUTE_PREFIX } from '@/lib/dev-routes'

const read = (f: string) => readFileSync(resolve(process.cwd(), f), 'utf8')

describe('isDevRoute — 경로 판별', () => {
  it('접두사는 `/dev` 다', () => {
    expect(DEV_ROUTE_PREFIX).toBe('/dev')
  })

  it('`/dev` 와 그 하위를 잡는다', () => {
    for (const p of ['/dev', '/dev/', '/dev/components', '/dev/event-preview', '/dev/a/b/c']) {
      expect(isDevRoute(p), p).toBe(true)
    }
  })

  it('🔴 `/dev` 로 시작하는 **다른** 경로는 잡지 않는다', () => {
    // `/development` 를 막아버리면 멀쩡한 경로가 404 가 된다.
    for (const p of ['/development', '/devices', '/deverything', '/', '/magazine', '/admin']) {
      expect(isDevRoute(p), p).toBe(false)
    }
  })
})

describe('isDevRouteAllowed — 환경 행렬', () => {
  const allow = (VERCEL_ENV?: string, NODE_ENV?: string) =>
    isDevRouteAllowed({ VERCEL_ENV, NODE_ENV })

  it('🔴 VERCEL_ENV 는 preview·development 만 허용한다', () => {
    expect(allow('preview'), 'preview').toBe(true)
    expect(allow('development'), 'development').toBe(true)
  })

  it('🔴 VERCEL_ENV=production 은 NODE_ENV 와 무관하게 차단한다', () => {
    for (const node of ['production', 'development', 'test', undefined]) {
      expect(allow('production', node), `NODE_ENV=${node}`).toBe(false)
    }
  })

  it('🔴 VERCEL_ENV 가 없으면 NODE_ENV 로 fallback 한다', () => {
    expect(allow(undefined, 'development'), 'NODE_ENV=development').toBe(true)
    expect(allow(undefined, 'production'), 'NODE_ENV=production').toBe(false)
  })

  it('🔴 VERCEL_ENV 가 알 수 없는 값이어도 NODE_ENV 로 fallback 한다', () => {
    expect(allow('staging', 'development')).toBe(true)
    expect(allow('staging', 'production')).toBe(false)
    expect(allow('', 'development')).toBe(true)
    expect(allow('', 'production')).toBe(false)
  })

  it('🔴 둘 다 없거나 모르는 값이면 **차단**한다 — fail-closed 다', () => {
    // 이전 구현은 fail-open(모르면 허용)이었다. 그러면 VERCEL_ENV 를 못 읽는 production 에서
    // 그대로 열린다 — 막으려던 상황에서 정확히 실패한다. 허용은 **명시적으로 확인된 경우**만이다.
    expect(allow(undefined, undefined)).toBe(false)
    expect(allow(undefined, 'test')).toBe(false)
    expect(allow('staging', 'staging')).toBe(false)
  })

  it('환경 행렬 전체', () => {
    const matrix: Array<[string | undefined, string | undefined, boolean]> = [
      ['production',  'production',  false],
      ['production',  'development', false],
      ['production',  undefined,     false],
      ['preview',     'production',  true],
      ['preview',     'development', true],
      ['development', 'production',  true],
      ['development', 'development', true],
      [undefined,     'development', true],
      [undefined,     'production',  false],
      [undefined,     'test',        false],
      [undefined,     undefined,     false],
      ['staging',     'development', true],
      ['staging',     'production',  false],
    ]
    for (const [v, n, expected] of matrix) {
      expect(allow(v, n), `VERCEL_ENV=${v} NODE_ENV=${n}`).toBe(expected)
    }
  })
})

describe('middleware 가 중앙 가드다 — 소스 고정', () => {
  const mw = read('src/middleware.ts')

  it('middleware 가 dev-routes 가드를 import 한다', () => {
    expect(mw).toMatch(/import \{[^}]*isDevRoute[^}]*\} from '@\/lib\/dev-routes'/)
  })

  it('🔴 404 를 반환한다 — redirect·rewrite 가 아니다', () => {
    const block = mw.slice(mw.indexOf('isDevRoute('), mw.indexOf('isDevRoute(') + 400)
    expect(block).toContain('status: 404')
  })

  it('🔴 인증·Redis 작업보다 **먼저** 막는다', () => {
    // 차단 대상 요청이 DB·Redis·토큰 검증을 거치면 안 된다.
    const guardAt = mw.indexOf('isDevRoute(')
    expect(guardAt).toBeGreaterThan(-1)
    for (const later of ['getToken(', 'verifyAdminToken(', 'resolveSlug(']) {
      const at = mw.indexOf(later, mw.indexOf('export default async function middleware'))
      if (at > -1) expect(guardAt, `${later} 보다 뒤에 있다`).toBeLessThan(at)
    }
  })

  it('middleware matcher 가 `/dev` 를 제외하지 않는다', () => {
    const matcher = mw.slice(mw.indexOf('matcher:'))
    expect(matcher).not.toContain('dev|')
    expect(matcher).not.toContain('|dev')
  })
})

describe('🔴 noindex 를 접근 통제로 쓰지 않는다', () => {
  it('차단 로직이 robots·metadata 에 의존하지 않는다', () => {
    // 주석은 빼고 **코드만** 본다 — 왜 noindex 가 접근 통제가 아닌지 설명하는 건 위반이 아니다.
    const code = read('src/lib/dev-routes.ts')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '')
      .toLowerCase()
    for (const bad of ['robots', 'noindex', 'metadata']) {
      expect(code, `${bad} 에 의존하면 접근 통제가 아니다`).not.toContain(bad)
    }
    // 실제 판단 근거는 VERCEL_ENV 하나뿐이어야 한다
    expect(code).toContain('vercel_env')
  })

  it('robots.ts 는 이 차단의 근거가 아니다 — `/dev` Disallow 유무와 무관하게 404 여야 한다', () => {
    // robots.txt 는 크롤러에 대한 요청일 뿐이다. 계약은 middleware 에만 있다.
    expect(read('src/middleware.ts')).toContain('isDevRoute(')
  })
})

describe('Preview E2E 가 계속 통과하는 구조인가', () => {
  const pw = read('playwright.config.ts')

  it('`/dev/event-preview` 를 쓰는 spec 은 qa/ 아래에 있다', () => {
    expect(read('e2e/qa/24-participation-events.spec.ts')).toContain('/dev/event-preview')
  })

  it('🔴 chromium project 가 `qa/` 를 제외한다 — CI 가 production 을 상대로 /dev 를 때리지 않는다', () => {
    // e2e-smoke job 은 E2E_BASE_URL=production 으로 `--project=chromium` 을 돌린다.
    // qa/ 가 거기 잡히면 이 차단이 CI 를 red 로 만든다.
    const chromium = pw.slice(pw.indexOf("name: 'chromium'"), pw.indexOf("name: 'mobile-chrome'"))
    expect(chromium).toContain('(?!.*\\/qa\\/)')
  })

  it('참여 이벤트 project 의 baseURL 은 preview 지정을 우선한다', () => {
    const proj = pw.slice(pw.indexOf("name: 'qa-participation-events'"))
    expect(proj).toContain('QA_EVENT_URL')
    expect(proj).not.toContain("baseURL: 'https://age-doesnt-matter.com'")
  })
})
