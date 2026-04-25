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
    w._allGtagEvents = []
    const capture = (...args: unknown[]) => {
      if (args[0] === 'event' && typeof args[1] === 'string') {
        const eventName = args[1] as string
        const params = (args[2] as Record<string, unknown>) ?? {}
        w._allGtagEvents.push({ event: eventName, params })
        if (eventName.startsWith('signup_banner') || eventName === 'inapp_redirect_success') {
          w._gtagSpy.push({ event: eventName, params })
        }
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
  // clock.install()은 반드시 goto() 이전 — 이후 모든 setInterval이 fake clock에 귀속됨
  await page.clock.install()

  await page.goto('/community/stories')
  await page.waitForLoadState('networkidle')
  await installGtagSpy(page)

  const firstPost = page.locator('a[href*="/community/stories/"]').first()
  await firstPost.waitFor({ timeout: 10_000 })
  await firstPost.click()
  // CUID 형식 ID 매칭 (숫자 한정 \d+ 대신 \w+)
  await page.waitForURL(/\/community\/stories\/\w+/)
  await page.waitForLoadState('networkidle')

  await page.evaluate(() => {
    const docH = document.documentElement.scrollHeight - window.innerHeight
    window.scrollTo(0, docH > 100 ? docH * 0.6 : 0)
  })

  // scroll 이벤트 처리 여유 후 21초 fast-forward
  await page.clock.runFor(500)
  await page.evaluate(() => window.dispatchEvent(new Event('scroll')))
  await page.clock.runFor(21_000)

  // 배너 CTA: data-testid으로 식별 (Link → button 전환 후)
  await page.waitForSelector('[data-testid="signup-banner-cta"]', { timeout: 5_000 })
}

// ── 테스트 ────────────────────────────────────────────────────────────────

test.describe('SignupPromptBanner GTM 이벤트', () => {
  test.beforeEach(async ({ page }) => {
    // 페이지 로드 전 storage 초기화 (테스트 격리)
    await page.addInitScript(() => {
      sessionStorage.clear()
      localStorage.removeItem('signup_prompt_done')
      localStorage.removeItem('signup_prompt_count')
      localStorage.removeItem('signup_variant')
      // pwa_installed='1' — AddToHomeScreen(13초 타이머)이 SignupPromptBanner보다 먼저 발화해
      // pwa_shown_this_session='1'을 세팅하면 canShow()=false가 되어 배너 미노출.
      // 이 스위트는 SignupPromptBanner GTM만 검증하므로 PWA 팝업 간섭을 차단한다.
      localStorage.setItem('pwa_installed', '1')
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
   *
   * dispatchEvent(isTrusted=false) 방식:
   * - 브라우저 표준: untrusted 이벤트는 <a> href 네비게이션을 유발하지 않음
   * - React 이벤트 위임은 untrusted 이벤트도 처리 → onClick 발화
   * - window._gtagSpy 컨텍스트 파괴 없이 이벤트 캡처 가능
   */
  test('T2: clicked 이벤트 발화 @signup-banner', async ({ page }) => {
    await triggerBanner(page)

    // 서버 액션(카카오 OAuth) fetch 차단 → navigation 없이 GTM 이벤트만 캡처
    await page.route('**/api/auth/**', route => route.abort())

    // isTrusted=false → React onClick만 발화, redirect 없음
    await page.evaluate(() => {
      const btn = document.querySelector<HTMLButtonElement>('[data-testid="signup-banner-cta"]')
      btn?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    })
    await page.waitForTimeout(200)

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
    await page.clock.install()
    await page.goto('/login')
    await page.waitForLoadState('networkidle')
    await installGtagSpy(page)

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
   *
   * 구현 노트:
   * - page.goBack() 대신 page.goto() 사용: goBack은 full reload를 유발해 addInitScript가
   *   sessionStorage를 초기화할 수 있음
   * - goto('/community/stories') 후 spy 재설치 + SESSION_SHOWN 수동 복원:
   *   실제 SPA에서는 sessionStorage가 navigation 간 유지되는 동작을 시뮬레이션
   * - 이후 SPA link click: 같은 window 컨텍스트 → sessionStorage 유지 → canShow()=false
   */
  test('T5: 세션 내 1회 제한 — 닫은 후 재트리거 미발화 @signup-banner', async ({ page }) => {
    // 1. 첫 번째 배너 노출 + 닫기
    await triggerBanner(page)
    const closeBtn = page.locator('.fixed.bottom-0.left-0.right-0 button[aria-label="닫기"]')
    await closeBtn.click()

    // 2. SESSION_SHOWN 키 확인
    const sessionKey = await page.evaluate(() =>
      sessionStorage.getItem('signup_prompt_shown_this_session')
    )
    expect(sessionKey, 'SESSION_SHOWN 키 미설정').toBe('1')

    // 3. spy 초기화
    await page.evaluate(() => { ;(window as { _gtagSpy?: unknown[] })._gtagSpy = [] })

    // 4. 목록 페이지로 이동 (addInitScript 재실행으로 storage 초기화됨)
    await page.goto('/community/stories')
    await page.waitForLoadState('networkidle')

    // 5. spy 재설치 + 실제 SPA 세션 동작 시뮬레이션 (SESSION_SHOWN 복원)
    await installGtagSpy(page)
    await page.evaluate(() => sessionStorage.setItem('signup_prompt_shown_this_session', '1'))

    // 6. 다음 글로 SPA 이동 (sessionStorage 유지 — SPA는 window 동일)
    const nextPost = page.locator('a[href*="/community/stories/"]').nth(1)
    const hasNext = await nextPost.isVisible({ timeout: 3_000 }).catch(() => false)
    if (hasNext) {
      await nextPost.click()
      await page.waitForURL(/\/community\/stories\/\w+/)
      await page.waitForLoadState('networkidle')
    }

    // 7. 스크롤 60% 후 21초 fast-forward (SESSION_SHOWN='1' → canShow()=false)
    await page.evaluate(() => {
      const docH = document.documentElement.scrollHeight - window.innerHeight
      window.scrollTo(0, docH > 100 ? docH * 0.6 : 0)
    })
    await page.clock.runFor(500)
    await page.evaluate(() => window.dispatchEvent(new Event('scroll')))
    await page.clock.runFor(21_000)
    await page.waitForTimeout(300)

    // 8. 두 번째 배너 미발화 확인
    const spy = await getSpyEvents(page)
    const shown = spy.find(e => e.event === 'signup_banner_shown')
    expect(shown, '세션 내 2번째 배너 발화됨 (SESSION 제한 미작동 버그)').toBeUndefined()
  })

  /**
   * T6: 딤 오버레이 클릭 → dismissed 이벤트 발화 + 배너 사라짐
   * - 딤 레이어(fixed inset-0 z-[149])의 상단 영역 클릭 = 배너 바깥 = 딤 클릭
   */
  test('T6: 딤 오버레이 클릭 → dismissed 이벤트 발화 @signup-banner', async ({ page }) => {
    await triggerBanner(page)

    // 화면 상단(배너 위쪽) 클릭 → 딤 레이어 onClick 발동
    await page.mouse.click(200, 100)
    await page.waitForTimeout(300)

    const spy = await getSpyEvents(page)
    const dismissed = spy.find(e => e.event === 'signup_banner_dismissed')
    expect(dismissed, 'dismissed 이벤트 미발화').toBeTruthy()

    // 배너 사라짐 확인
    const ctaVisible = await page.locator('[data-testid="signup-banner-cta"]').isVisible().catch(() => false)
    expect(ctaVisible, '딤 클릭 후 배너 미사라짐').toBe(false)
  })

  /**
   * T8: ?signup=1&utm_source=kakao-android → auto-trigger 배너 노출 + GTM 이벤트
   * - useSearchParams()로 클라이언트에서 직접 감지 → autoVisible=true
   * - inapp_redirect_success 이벤트 발화
   *
   * GTM 이벤트 캡처 전략:
   * window.gtag spy 불가 — gtag-init(afterInteractive)이 "function gtag(){dataLayer.push(arguments)}"
   * 선언으로 window.gtag를 교체하고, sendEvent는 _gtagReady 모듈 변수 체크로 큐에 먼저 쌓음.
   * → dataLayer.push 자체를 인터셉트 (markGtagReady flush 포함 모든 경로 포착)
   */
  test('T8: signup=1 auto-trigger 배너 노출 + GTM 이벤트 @signup-banner', async ({ page }) => {
    // dataLayer.push 인터셉트 — gtag 이벤트의 최종 도착지
    await page.addInitScript(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const w = window as any
      w._allGtagEvents = []
      w.dataLayer = w.dataLayer || []
      const origPush = Array.prototype.push.bind(w.dataLayer)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      w.dataLayer.push = function (...items: any[]) {
        for (const item of items) {
          // gtag('event', name, params) → dataLayer.push(Arguments{0:'event',1:name,2:params})
          if (item && typeof item === 'object' && item[0] === 'event' && typeof item[1] === 'string') {
            w._allGtagEvents.push({ event: item[1], params: item[2] ?? {} })
          }
        }
        return origPush(...items)
      }
    })

    await page.clock.install()
    await page.goto('/community/stories?signup=1&utm_source=kakao-android')
    await page.waitForLoadState('networkidle')
    await page.clock.runFor(500)

    // auto-trigger 배너 노출 확인
    await page.waitForSelector('[data-testid="signup-auto-trigger-banner"]', { timeout: 3_000 })

    // 카운트다운 텍스트 확인
    const bannerText = await page.locator('[data-testid="signup-auto-trigger-banner"]').textContent()
    expect(bannerText).toMatch(/초 후 자동으로/)

    // dataLayer 인터셉트로 캡처된 이벤트 확인
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const allEvents = await page.evaluate(() => (window as any)._allGtagEvents ?? [])
    const redirectSuccess = (allEvents as Array<{ event: string; params: Record<string, unknown> }>)
      .find(e => e.event === 'inapp_redirect_success')
    expect(redirectSuccess, 'inapp_redirect_success 이벤트 미발화').toBeTruthy()
    expect(redirectSuccess!.params.from_env).toBe('kakao-android')
  })

  /**
   * T9: signup_auto_triggered sessionStorage 세팅 시 auto-trigger 배너 미노출 (중복 차단)
   */
  test('T9: signup_auto_triggered 세션 플래그 → 배너 미노출 @signup-banner', async ({ page }) => {
    await page.addInitScript(() => {
      sessionStorage.setItem('signup_auto_triggered', '1')
    })
    await page.clock.install()
    await page.goto('/community/stories?signup=1&utm_source=kakao-android')
    await page.waitForLoadState('networkidle')
    await page.clock.runFor(500)

    const bannerVisible = await page.locator('[data-testid="signup-auto-trigger-banner"]')
      .isVisible({ timeout: 1_500 }).catch(() => false)
    expect(bannerVisible, '이미 트리거된 세션에서 auto-trigger 배너 재노출됨').toBe(false)
  })

  /**
   * T10: utm_source 없음(또는 'desktop') → auto-trigger 배너 미노출 (오발동 방지)
   */
  test('T10: utm_source 없음 → auto-trigger 배너 미노출 @signup-banner', async ({ page }) => {
    await page.clock.install()
    // utm_source 없이 signup=1만 있는 경우 (일반 공유링크 오발동 시나리오)
    await page.goto('/community/stories?signup=1')
    await page.waitForLoadState('networkidle')
    await page.clock.runFor(500)

    const bannerVisible = await page.locator('[data-testid="signup-auto-trigger-banner"]')
      .isVisible({ timeout: 1_500 }).catch(() => false)
    expect(bannerVisible, 'utm_source 없을 때 auto-trigger 오발동됨').toBe(false)
  })

  /**
   * T7: 홈('/')에서 배너 발화 확인
   * - CONTENT_PATHS에 '/' 추가 후 홈에서도 배너 트리거 가능
   * - isActivePath('/')가 true를 반환해야 함 (exact match 가드 적용)
   */
  test('T7: 홈 페이지에서 배너 발화 @signup-banner', async ({ page }) => {
    await page.clock.install()
    await page.goto('/')
    await page.waitForLoadState('load') // 홈은 광고 요청 지속으로 networkidle 도달 불가
    // AddToHomeScreen TIMER_MS=13초 → runFor(21s) 중 먼저 발화 → pwa_shown_this_session='1' 설정
    // → SignupPromptBanner canShow()=false 충돌 방지
    // pwa_installed='1' → getInstalled()=true → AddToHomeScreen canShow()=false → 미발화
    await page.evaluate(() => localStorage.setItem('pwa_installed', '1'))
    await installGtagSpy(page)

    await page.evaluate(() => {
      const docH = document.documentElement.scrollHeight - window.innerHeight
      window.scrollTo(0, docH > 100 ? docH * 0.6 : 0)
    })
    await page.clock.runFor(500)
    await page.evaluate(() => window.dispatchEvent(new Event('scroll')))
    await page.clock.runFor(21_000)

    await page.waitForSelector('[data-testid="signup-banner-cta"]', { timeout: 5_000 })

    const spy = await getSpyEvents(page)
    const shown = spy.find(e => e.event === 'signup_banner_shown')
    expect(shown, '홈에서 signup_banner_shown 미발화').toBeTruthy()
    expect(String(shown!.params.page_path)).toBe('/')
  })
})

// ── Phase 3: PWA 3페이지 탐색 트리거 ────────────────────────────────────────
// 검증 전략:
//   Primary  — localStorage 'pwa_shown_triggers' 에 'signup' 포함 여부 (DOM-independent)
//   Secondary — beforeinstallprompt 이벤트 dispatch 후 팝업 DOM 가시성
// 주의: addInitScript는 모든 page.goto()마다 실행됨.
//       '_pwa_phase3_init' 가드로 첫 번째 goto에서만 전체 초기화,
//       이후 goto에서는 counter를 건드리지 않아 누적 카운트 보장.

test.describe('Phase 3 — PWA 3페이지 탐색 후 signup 트리거', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      const isFirstLoad = !localStorage.getItem('_pwa_phase3_init')
      if (isFirstLoad) {
        // 첫 번째 goto에서만 전체 초기화
        localStorage.setItem('_pwa_phase3_init', '1')
        sessionStorage.clear()
        localStorage.setItem('signup_completed_at', new Date().toISOString())
        localStorage.removeItem('pwa_installed')
        localStorage.setItem('pwa_page_views_after_signup', '0')
        localStorage.removeItem('pwa_shown_triggers')
        localStorage.removeItem('pwa_shown_count')
        localStorage.removeItem('pwa_declined_count')
      }
      // 모든 로드: SignupPromptBanner 간섭 차단
      localStorage.setItem('signup_prompt_done', '1')
    })
  })

  test.afterEach(async ({ page }) => {
    // 가드 제거 → 다음 테스트 첫 goto에서 재초기화 보장
    await page.evaluate(() => localStorage.removeItem('_pwa_phase3_init')).catch(() => {})
  })

  /**
   * T11: 가입 완료 → 3페이지 탐색 → pwa_shown_triggers에 'signup' 포함
   * + beforeinstallprompt dispatch 후 팝업 DOM 노출 확인 (Secondary)
   *
   * 카운트 흐름: goto 1 → views=1, goto 2 → views=2, goto 3 → views=3 → trigger
   */
  test('T11: 3페이지 탐색 → signup 트리거 발동 @pwa-phase3', async ({ page }) => {
    await page.goto('/community/stories')
    await page.waitForLoadState('networkidle')
    await page.goto('/magazine')
    await page.waitForLoadState('networkidle')
    await page.goto('/')
    await page.waitForLoadState('load')

    // Primary: pwa_shown_triggers에 'signup' 포함 대기
    await page.waitForFunction(
      () => {
        try { return JSON.parse(localStorage.getItem('pwa_shown_triggers') ?? '[]').includes('signup') }
        catch { return false }
      },
      { timeout: 5_000 }
    )

    // 카운터가 정확히 3인지 확인 (이중 카운트 버그 회귀 방지)
    const views = await page.evaluate(() =>
      parseInt(localStorage.getItem('pwa_page_views_after_signup') ?? '0')
    )
    expect(views, '카운터가 3이어야 함 (이중 카운트 버그 재발 시 다른 값)').toBe(3)
  })

  /**
   * T11-visual: beforeinstallprompt dispatch → 팝업 DOM 노출 확인 (Secondary)
   * 헤드리스 Chromium 환경에서 canNativeInstall 상태 반영이 불안정 → fixme
   * 수동 QA: DevTools > Application > localStorage에서 signup_completed_at 세팅 후 3페이지 탐색
   */
  test.fixme('T11-visual: 3페이지 후 beforeinstallprompt dispatch → 팝업 DOM 노출 @pwa-phase3', async ({ page }) => {
    await page.goto('/community/stories')
    await page.waitForLoadState('networkidle')
    await page.goto('/magazine')
    await page.waitForLoadState('networkidle')
    await page.goto('/')
    await page.waitForLoadState('load')

    await page.waitForFunction(
      () => {
        try { return JSON.parse(localStorage.getItem('pwa_shown_triggers') ?? '[]').includes('signup') }
        catch { return false }
      },
      { timeout: 5_000 }
    )

    await page.evaluate(() => window.dispatchEvent(new Event('beforeinstallprompt')))
    await page.waitForTimeout(500)
    await expect(page.locator('button:has-text("나중에 할게요")')).toBeVisible({ timeout: 3_000 })
  })

  /**
   * T12: 카운터 2 선탑재 → 1페이지 탐색 → 즉시 signup 트리거
   * (재방문 시 localStorage 카운터 누적 검증)
   */
  test('T12: 카운터 2 선탑재 → 1페이지에서 즉시 트리거 @pwa-phase3', async ({ page }) => {
    // beforeEach가 counter=0 세팅 후, 이 스크립트가 2로 덮어씀
    await page.addInitScript(() => {
      localStorage.setItem('pwa_page_views_after_signup', '2')
    })

    await page.goto('/community/stories')
    await page.waitForLoadState('networkidle')

    await page.waitForFunction(
      () => {
        try { return JSON.parse(localStorage.getItem('pwa_shown_triggers') ?? '[]').includes('signup') }
        catch { return false }
      },
      { timeout: 5_000 }
    )
  })

  /**
   * T13: pwa_installed=1 → 3페이지 탐색해도 signup 트리거·카운터 모두 없음
   */
  test('T13: pwa_installed=1 → 3페이지 탐색 → 트리거 없음 @pwa-phase3', async ({ page }) => {
    // beforeEach가 pwa_installed 제거 후, 이 스크립트가 '1'로 덮어씀
    await page.addInitScript(() => {
      localStorage.setItem('pwa_installed', '1')
    })

    await page.goto('/community/stories')
    await page.waitForLoadState('networkidle')
    await page.goto('/magazine')
    await page.waitForLoadState('networkidle')
    await page.goto('/')
    await page.waitForLoadState('load')
    await page.waitForTimeout(1_000)

    const shownTriggers = await page.evaluate(() => {
      try { return JSON.parse(localStorage.getItem('pwa_shown_triggers') ?? '[]') }
      catch { return [] }
    })
    expect(shownTriggers, 'pwa_installed=1인데 signup 트리거됨').not.toContain('signup')

    const views = await page.evaluate(() =>
      parseInt(localStorage.getItem('pwa_page_views_after_signup') ?? '0')
    )
    expect(views, '설치 상태인데 카운터 증가됨').toBe(0)
  })
})
