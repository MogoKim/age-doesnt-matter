/**
 * SignupPromptBanner GTM 이벤트 자동 검증
 *
 * gtm.ts의 sendEvent()는 window.gtag() 직접 호출 (window.dataLayer push 아님).
 * window.gtag를 spy로 래핑해 signup_banner_* 이벤트 캡처.
 *
 * 권장 실행 환경: E2E_BASE_URL=https://age-doesnt-matter.com (GTM/gtag 로드 보장)
 * 로컬 개발 환경에서는 GTM이 미로드 시 T1~T3 실패 가능.
 */

import { test, expect, type Page } from '@playwright/test'

// ── 헬퍼 ──────────────────────────────────────────────────────────────────

/**
 * window.gtag를 spy로 래핑.
 * gtag 미로드 시 stub 생성.
 * signup_banner_* 이벤트만 window._gtagSpy 배열에 수집.
 */
async function installGtagSpy(page: Page): Promise<void> {
  await page.evaluate(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const w = window as any
    w._gtagSpy = []
    const capture = (...args: unknown[]) => {
      if (args[0] === 'event' && typeof args[1] === 'string' && args[1].startsWith('signup_banner')) {
        w._gtagSpy.push({ event: args[1], params: (args[2] as Record<string, unknown>) ?? {} })
      }
    }
    const orig = w.gtag as ((...a: unknown[]) => void) | undefined
    if (orig) {
      w.gtag = (...a: unknown[]) => { capture(...a); orig(...a) }
    } else {
      // 로컬 개발 환경 — gtag 미로드 시 stub 생성
      w.gtag = capture
    }
  })
}

/** spy에서 캡처된 이벤트 목록 조회 */
async function getSpyEvents(page: Page): Promise<Array<{ event: string; params: Record<string, unknown> }>> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return page.evaluate(() => (window as any)._gtagSpy ?? [])
}

/**
 * 배너 트리거 공통 헬퍼.
 *
 * 흐름:
 * 1. /community/stories 실제 로드 (gtag / markGtagReady 정상 초기화)
 * 2. gtag spy 설치
 * 3. fake clock 설치 (gtag 로드 완료 후 — setInterval이 fake time 사용)
 * 4. 첫 번째 글로 SPA 이동 (useEffect 재마운트 → setInterval 새로 시작)
 * 5. 스크롤 60% (scrolledRef = true)
 * 6. 21초 fast-forward → tryFire() 발동 → 배너 노출
 */
async function triggerBanner(page: Page): Promise<void> {
  await page.goto('/community/stories')
  await page.waitForLoadState('networkidle')

  await installGtagSpy(page)
  await page.clock.install()

  const firstPost = page.locator('a[href*="/community/stories/"]').first()
  await firstPost.waitFor({ timeout: 10_000 })
  await firstPost.click()
  await page.waitForURL(/\/community\/stories\/\d+/)

  await page.evaluate(() => {
    const docH = document.documentElement.scrollHeight - window.innerHeight
    window.scrollTo(0, docH > 100 ? docH * 0.6 : 0)
  })

  await page.clock.runFor(21_000)

  // CTA 링크(/login?callbackUrl=...)가 나타나면 배너 노출 완료
  await page.waitForSelector('a[href*="/login?callbackUrl"]', { timeout: 5_000 })
}

// ── 테스트 ────────────────────────────────────────────────────────────────

test.describe('SignupPromptBanner GTM 이벤트', () => {
  test.beforeEach(async ({ page }) => {
    // 페이지 로드 전 storage 완전 초기화 (테스트 격리)
    await page.addInitScript(() => {
      sessionStorage.clear()
      localStorage.removeItem('signup_prompt_done')
      localStorage.removeItem('signup_prompt_count')
      localStorage.removeItem('signup_variant')
      localStorage.removeItem('pwa_installed')
    })
  })

  /**
   * T1: eligible + shown 이벤트 발화 + 파라미터 정합성
   * - variant: A|B|C
   * - page_path: /community/로 시작
   * - show_count: 1 (첫 번째 노출)
   * - eligible.variant === shown.variant
   */
  test('T1: eligible + shown 이벤트 발화 및 파라미터 정합성 @signup-banner', async ({ page }) => {
    await triggerBanner(page)

    const spy = await getSpyEvents(page)

    const eligible = spy.find(e => e.event === 'signup_banner_eligible')
    expect(eligible, 'signup_banner_eligible 이벤트 미발화').toBeTruthy()
    expect(eligible!.params.variant, 'variant 파라미터 이상').toMatch(/^[ABC]$/)
    expect(String(eligible!.params.page_path), 'page_path 파라미터 이상').toMatch(/^\/community\//)

    const shown = spy.find(e => e.event === 'signup_banner_shown')
    expect(shown, 'signup_banner_shown 이벤트 미발화').toBeTruthy()
    expect(shown!.params.variant, 'shown.variant 파라미터 이상').toMatch(/^[ABC]$/)
    expect(String(shown!.params.page_path), 'shown.page_path 파라미터 이상').toMatch(/^\/community\//)
    expect(shown!.params.show_count, 'show_count는 1이어야 함').toBe(1)

    // eligible variant와 shown variant 반드시 일치
    expect(eligible!.params.variant).toBe(shown!.params.variant)
  })

  /**
   * T2: CTA 클릭 → signup_banner_clicked 발화
   */
  test('T2: clicked 이벤트 발화 @signup-banner', async ({ page }) => {
    await triggerBanner(page)

    const ctaLink = page.locator('a[href*="/login?callbackUrl"]')
    await ctaLink.click()

    const spy = await getSpyEvents(page)
    const clicked = spy.find(e => e.event === 'signup_banner_clicked')
    expect(clicked, 'signup_banner_clicked 이벤트 미발화').toBeTruthy()
    expect(clicked!.params.variant).toMatch(/^[ABC]$/)
  })

  /**
   * T3: 닫기 버튼 → signup_banner_dismissed 발화
   */
  test('T3: dismissed 이벤트 발화 @signup-banner', async ({ page }) => {
    await triggerBanner(page)

    // fixed bottom-0 배너 내 닫기 버튼 (다른 모달과 구분)
    const closeBtn = page.locator('.fixed.bottom-0.left-0.right-0 button[aria-label="닫기"]')
    await closeBtn.click()

    const spy = await getSpyEvents(page)
    const dismissed = spy.find(e => e.event === 'signup_banner_dismissed')
    expect(dismissed, 'signup_banner_dismissed 이벤트 미발화').toBeTruthy()
    expect(dismissed!.params.variant).toMatch(/^[ABC]$/)
    expect(dismissed!.params.show_count as number, 'show_count > 0 이어야 함').toBeGreaterThan(0)
  })

  /**
   * T4: EXCLUDED_PATH(/login)에서 미발화
   * - isActivePath('/login') = false → tryFire() 진입 불가
   */
  test('T4: EXCLUDED_PATH(/login)에서 미발화 @signup-banner', async ({ page }) => {
    await page.goto('/login')
    await page.waitForLoadState('networkidle')
    await installGtagSpy(page)
    await page.clock.install()

    await page.evaluate(() => {
      const docH = document.documentElement.scrollHeight - window.innerHeight
      window.scrollTo(0, docH > 100 ? docH * 0.6 : 0)
    })
    await page.clock.runFor(21_000)
    await page.waitForTimeout(300) // React 상태 반영 여유

    const spy = await getSpyEvents(page)
    const eligible = spy.find(e => e.event === 'signup_banner_eligible')
    expect(eligible, '/login 페이지에서 배너 이벤트 발화됨 (EXCLUDED_PATH 미작동 버그)').toBeUndefined()
  })

  /**
   * T5: 세션 내 1회 제한
   * - 배너 닫은 후 SPA 이동 + 재트리거 시도 → signup_banner_shown 미발화
   * - sessionStorage.signup_prompt_shown_this_session = '1' 유지 확인
   */
  test('T5: 세션 내 1회 제한 — 닫은 후 재트리거 미발화 @signup-banner', async ({ page }) => {
    // 첫 번째 배너 노출 + 닫기
    await triggerBanner(page)
    const closeBtn = page.locator('.fixed.bottom-0.left-0.right-0 button[aria-label="닫기"]')
    await closeBtn.click()

    // sessionStorage 키 존재 확인
    const sessionKey = await page.evaluate(() =>
      sessionStorage.getItem('signup_prompt_shown_this_session')
    )
    expect(sessionKey, 'SESSION_SHOWN 키 미설정').toBe('1')

    // spy 초기화 (이전 이벤트 제거)
    await page.evaluate(() => { ;(window as { _gtagSpy?: unknown[] })._gtagSpy = [] })

    // SPA 이동 (page.goBack → 같은 세션, sessionStorage 유지)
    await page.goBack()
    await page.waitForURL(/\/community\/stories/)

    const nextPost = page.locator('a[href*="/community/stories/"]').nth(1)
    const hasNext = await nextPost.isVisible({ timeout: 3_000 }).catch(() => false)
    if (hasNext) {
      await nextPost.click()
      await page.waitForURL(/\/community\/stories\/\d+/)
    }

    await page.evaluate(() => {
      const docH = document.documentElement.scrollHeight - window.innerHeight
      window.scrollTo(0, docH > 100 ? docH * 0.6 : 0)
    })
    await page.clock.runFor(21_000)
    await page.waitForTimeout(300)

    const spy = await getSpyEvents(page)
    const shown = spy.find(e => e.event === 'signup_banner_shown')
    expect(shown, '세션 내 2번째 배너 발화됨 (SESSION 제한 미작동 버그)').toBeUndefined()
  })
})
