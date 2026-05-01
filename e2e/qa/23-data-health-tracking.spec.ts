/**
 * 데이터 헬스체크 Phase 1+2 — E2E 자동 검증
 *
 * 검증 항목:
 * - 비회원 _anon_sid 쿠키 생성/유지 (T1-T2)
 * - sendBeacon /api/events 호출 (T3)
 * - PostViewBeacon → /api/posts/[id]/view 호출 (T4)
 * - /api/posts/[id]/view 비로그인 200 응답 (T5)
 * - post_create_started GTM 이벤트 (T6, qa-tracking-user 프로젝트)
 * - signup_step GTM 이벤트 (T7, fixme — onboarding 상태 필요)
 * - /api/events 유효성 검증 (T8)
 *
 * 실행:
 *   비인증: npx playwright test e2e/qa/23 --project=qa-tracking
 *   인증:   npx playwright test e2e/qa/23 --project=qa-tracking-user
 *   프로덕션: E2E_BASE_URL=https://www.age-doesnt-matter.com npx playwright test e2e/qa/23 --project=qa-tracking
 */

import { test, expect, type Page } from '@playwright/test'

// ── GTM spy 헬퍼 (22-signup-banner-gtm.spec.ts 패턴과 동일) ──────────────────

// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function installGtagSpy(page: Page): Promise<void> {
  await page.evaluate(() => {
    const w = window as Record<string, unknown> & typeof window
    w._gtagSpy = [] as Array<{ event: string; params: Record<string, unknown> }>
    const capture = (...args: unknown[]) => {
      if (args[0] === 'event' && typeof args[1] === 'string') {
        ;(w._gtagSpy as Array<{ event: string; params: Record<string, unknown> }>).push({
          event: args[1] as string,
          params: (args[2] as Record<string, unknown>) ?? {},
        })
      }
    }
    const orig = w.gtag as ((...a: unknown[]) => void) | undefined
    if (orig) {
      w.gtag = (...a: unknown[]) => { capture(...a); orig(...a) }
    } else {
      // 로컬 환경 — GTM 미로드 시 stub 생성
      w.gtag = capture
    }
  })
}

async function getSpyEvents(page: Page): Promise<Array<{ event: string; params: Record<string, unknown> }>> {
  return page.evaluate(
    () => (window as unknown as Record<string, unknown>)._gtagSpy as Array<{ event: string; params: Record<string, unknown> }> ?? []
  )
}

// UUID v4 형식 검증
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

// ── 비회원 익명 세션 (_anon_sid 쿠키) ────────────────────────────────────────

test.describe('비회원 익명 세션 (_anon_sid 쿠키)', () => {
  /**
   * T1: 첫 방문 시 _anon_sid 쿠키 생성 + httpOnly + SameSite=Lax + UUID v4 + 1년 만료
   * 미들웨어의 addAnonSession() 헬퍼가 모든 경로에서 쿠키를 설정하는지 확인
   */
  test('T1: 첫 방문 _anon_sid 생성 — httpOnly·Lax·UUID v4·1년 만료 @data-health', async ({ page, context }) => {
    await page.goto('/')
    await page.waitForLoadState('load')

    const cookies = await context.cookies()
    const sid = cookies.find(c => c.name === '_anon_sid')

    expect(sid, '_anon_sid 쿠키 미생성 — middleware addAnonSession 미동작').toBeDefined()
    expect(sid!.httpOnly, 'httpOnly 미설정 — JS XSS 노출 위험').toBe(true)
    expect(sid!.sameSite, 'SameSite 값 이상').toBe('Lax')
    expect(sid!.value, 'UUID v4 형식이 아님').toMatch(UUID_REGEX)
    // 만료: 현재 시각 + 31,000,000초 이상 (365일 = 31,536,000초)
    const nowSec = Date.now() / 1000
    expect(sid!.expires, '만료 시간이 1년 미만').toBeGreaterThan(nowSec + 31_000_000)
  })

  /**
   * T2: 재방문 시 동일 쿠키 유지 (새 UUID 생성되지 않음)
   * addAnonSession()의 "이미 있으면 skip" 로직 검증
   */
  test('T2: 재방문 시 동일 _anon_sid 유지 @data-health', async ({ page, context }) => {
    await page.goto('/')
    await page.waitForLoadState('load')
    const sid1 = (await context.cookies()).find(c => c.name === '_anon_sid')?.value

    await page.goto('/best')
    await page.waitForLoadState('load')
    const sid2 = (await context.cookies()).find(c => c.name === '_anon_sid')?.value

    expect(sid1, '첫 방문 쿠키 미생성').toBeTruthy()
    expect(sid1, '재방문 시 쿠키 값이 변경됨 — 비회원 세션 연속성 깨짐').toBe(sid2)
  })

  /**
   * T3: 페이지 이동 시 /api/events sendBeacon 호출
   * PageViewTracker → trackEvent('page_view') → sendBeacon('/api/events', payload)
   * httpOnly 쿠키는 브라우저가 자동 포함 (Cookie 헤더)
   */
  test('T3: 페이지 이동 시 /api/events POST sendBeacon 호출 @data-health', async ({ page }) => {
    const [eventsReq] = await Promise.all([
      page.waitForRequest(
        req => req.url().includes('/api/events') && req.method() === 'POST',
        { timeout: 10_000 }
      ),
      page.goto('/'),
    ])

    expect(eventsReq, '/api/events 호출 없음 — PageViewTracker 미동작').toBeDefined()
    expect(eventsReq.url()).toContain('/api/events')
    expect(eventsReq.method()).toBe('POST')
  })
})

// ── PostView 기록 ─────────────────────────────────────────────────────────────

test.describe('PostView 기록 (PostViewBeacon)', () => {
  /**
   * T4: 게시글 상세 방문 시 /api/posts/[id]/view sendBeacon 호출
   * PostViewBeacon 컴포넌트의 useEffect → sendBeacon 동작 확인
   */
  test('T4: 게시글 상세 방문 시 /api/posts/[id]/view POST @data-health', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('load')

    // 홈에서 커뮤니티 게시글 링크 동적 수집
    const href = await page.locator('a[href*="/community/"]').first().getAttribute('href').catch(() => null)
    if (!href) {
      test.skip()
      return
    }

    const [viewReq] = await Promise.all([
      page.waitForRequest(
        req => {
          const url = req.url()
          return url.includes('/api/posts/') && url.endsWith('/view') && req.method() === 'POST'
        },
        { timeout: 10_000 }
      ),
      page.goto(href),
    ])

    expect(viewReq.url()).toMatch(/\/api\/posts\/.+\/view$/)

    // PostViewBeacon은 readPercent: 0 으로 전송
    const body = viewReq.postDataJSON() as Record<string, unknown> | null
    expect(body?.readPercent, 'readPercent 파라미터 없음').toBe(0)
  })

  // T5: 비로그인 /api/posts/[id]/view -> 200 early return
  // 서버 측: auth() -> null -> return { ok: true } (DB write 없음)
  test('T5: 비로그인 /api/posts/[id]/view -> 200 응답 @data-health', async ({ request }) => {
    // 가짜 CUID — 비로그인이면 auth() null 체크 후 early return
    const res = await request.post('/api/posts/cm000000000000000000000000/view', {
      data: { readPercent: 50 },
    })
    expect(res.status(), '/api/posts/*/view 비로그인 200이 아님').toBe(200)
    const body = await res.json() as Record<string, unknown>
    expect(body.ok).toBe(true)
  })
})

// ── GTM 퍼널 이벤트 ───────────────────────────────────────────────────────────

test.describe('글쓰기 퍼널 GTM 이벤트', () => {
  /**
   * T6: /community/write 진입 시 post_create_started 발화
   * PostWriteForm의 useEffect (mount, !isEditMode) → sendGtmEvent
   * qa-tracking-user 프로젝트(user.json storageState)에서만 실행
   */
  test('T6: /community/write 진입 시 post_create_started 발화 @data-health', async ({ page }) => {
    // addInitScript: navigation 전에 실행되고 페이지 새로고침에도 유지됨
    // defineProperty로 window.gtag 할당을 가로채 spy에 기록
    await page.addInitScript(() => {
      const w = window as unknown as Record<string, unknown>
      w._gtagSpy = []
      let _real: ((...a: unknown[]) => void) | undefined
      Object.defineProperty(window, 'gtag', {
        configurable: true,
        get: () => _real,
        set: (fn: (...a: unknown[]) => void) => {
          _real = (...args: unknown[]) => {
            if (args[0] === 'event' && typeof args[1] === 'string') {
              ;(w._gtagSpy as Array<{ event: string; params: Record<string, unknown> }>).push({
                event: args[1] as string,
                params: (args[2] as Record<string, unknown>) ?? {},
              })
            }
            fn(...args)
          }
        },
      })
    })

    await page.goto('/community/write')
    await page.waitForLoadState('load')

    // 비인증 → 로그인 페이지로 리다이렉트되면 skip (qa-tracking 프로젝트)
    if (!page.url().includes('/community/write')) {
      test.skip()
      return
    }

    await page.waitForTimeout(800) // PostWriteForm useEffect 실행 여유

    const events = await getSpyEvents(page)
    const started = events.find(e => e.event === 'post_create_started')
    expect(started, 'post_create_started 미발화 — PostWriteForm useEffect 미동작').toBeDefined()
    expect(started!.params.has_draft).toBeDefined()
  })

  /**
   * T7: signup_step step=1 — needsOnboarding=true 상태가 필요해 자동화 어려움
   * 수동 QA 절차:
   * 1. 새 카카오 계정으로 최초 로그인
   * 2. /onboarding 진입 직후 DevTools Console:
   *    await page.evaluate(() => window._allGtagEvents)
   * 3. {event:'signup_step', params:{step:1, step_name:'nickname'}} 확인
   */
  test.fixme('T7: signup_step step=1 — needsOnboarding=true 상태 필요 (수동 QA)', async () => {})
})

// ── /api/events API 유효성 ────────────────────────────────────────────────────

test.describe('/api/events API 기본 동작', () => {
  /**
   * T8: 유효한 eventName → 200, 빈/긴 eventName → 400
   * api/events/route.ts의 eventName 유효성 검사 로직 검증
   */
  test('T8: 유효한 eventName→200, 빈/긴 eventName→400 @data-health', async ({ request }) => {
    // 정상
    const ok = await request.post('/api/events', {
      data: { eventName: 'qa_smoke_test', path: '/qa' },
    })
    expect(ok.status(), '/api/events 정상 요청이 200이 아님').toBe(200)
    const okBody = await ok.json() as Record<string, unknown>
    expect(okBody.ok).toBe(true)

    // 빈 eventName
    const bad = await request.post('/api/events', {
      data: { eventName: '' },
    })
    expect(bad.status(), '빈 eventName이 400이 아님').toBe(400)

    // 100자 초과 eventName
    const long = await request.post('/api/events', {
      data: { eventName: 'a'.repeat(101) },
    })
    expect(long.status(), '긴 eventName이 400이 아님').toBe(400)
  })
})
