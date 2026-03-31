import { test, expect } from '@playwright/test'

test.describe('시나리오 7: 광고 렌더링 검증', () => {

  test('데스크탑: AdSense 슬롯 존재', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 })
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    // ins.adsbygoogle 태그가 DOM에 존재하는지 확인
    const adsenseSlots = page.locator('ins.adsbygoogle')
    const count = await adsenseSlots.count()

    // CI 환경에서 광고가 서빙되지 않을 수 있으므로 최소 1개만 확인
    // (AdSenseUnit이 DOM API로 ins를 생성하므로 페이지에 콘텐츠가 있으면 존재해야 함)
    if (count === 0) {
      console.warn('[CI] ins.adsbygoogle 태그 0개 — 페이지에 콘텐츠가 없거나 스크립트 미로드')
    }
    expect(count).toBeGreaterThanOrEqual(1)
  })

  test('모바일: AdSense 슬롯 존재', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 })
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    const adsenseSlots = page.locator('ins.adsbygoogle')
    const count = await adsenseSlots.count()
    if (count === 0) {
      console.warn('[CI] 모바일 ins.adsbygoogle 태그 0개')
    }
    expect(count).toBeGreaterThanOrEqual(1)
  })

  test('AdSense 스크립트 처리 확인 (data-ad-status)', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    const slot = page.locator('ins.adsbygoogle').first()
    const attached = await slot.waitFor({ state: 'attached', timeout: 10000 }).then(() => true).catch(() => false)
    if (!attached) {
      test.skip(true, 'AdSense ins 태그가 DOM에 없음 — CI 환경일 수 있음')
      return
    }

    // Google이 슬롯을 처리할 때까지 대기 (최대 15초)
    const processed = await page.waitForFunction(
      () => {
        const ins = document.querySelector('ins.adsbygoogle')
        return ins?.getAttribute('data-ad-status') !== null
      },
      { timeout: 15000 },
    ).then(() => true).catch(() => false)

    if (processed) {
      const status = await slot.getAttribute('data-ad-status')
      expect(['filled', 'unfilled']).toContain(status)
    } else {
      // CI IP에서 Google이 광고를 처리하지 못할 수 있음 — 경고만
      console.warn('[CI] AdSense data-ad-status 미설정 — CI 환경에서는 정상일 수 있음')
    }
  })

  test('쿠팡 배너 이미지 렌더링', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 })
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    // 쿠팡 배너 또는 폴백 배너 — 둘 중 하나라도 있으면 성공
    const coupangBanner = page.locator('img[src*="ads-partners.coupang.com"]')
    const coupangVisible = await coupangBanner.first().isVisible({ timeout: 10000 }).catch(() => false)

    if (!coupangVisible) {
      // AdSense가 fill했거나 CI에서 이미지 로드 실패 — 경고
      console.warn('[CI] 쿠팡 배너 이미지 미표시 — AdSense fill 또는 CI 환경')
      // 광고 영역(aside[aria-label="광고"]) 자체는 존재해야 함
      const adRegion = page.locator('aside[aria-label="광고"]')
      const adExists = await adRegion.first().isVisible({ timeout: 5000 }).catch(() => false)
      expect(adExists).toBeTruthy()
    }
  })

  test('SPA 네비게이션 후 광고 슬롯 재생성', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    // 매거진으로 이동
    const magLink = page.getByRole('navigation').getByRole('link', { name: '매거진' })
    const hasMagLink = await magLink.isVisible({ timeout: 5000 }).catch(() => false)

    if (!hasMagLink) {
      test.skip(true, '매거진 네비게이션 링크 없음')
      return
    }

    await magLink.click()
    await page.waitForURL(/\/magazine/, { timeout: 10000 })
    await page.waitForLoadState('networkidle')

    // 홈으로 돌아오기
    const homeLink = page.locator('header a[href="/"]').first()
    const hasHomeLink = await homeLink.isVisible({ timeout: 5000 }).catch(() => false)

    if (!hasHomeLink) {
      test.skip(true, '홈 링크 없음')
      return
    }

    await homeLink.click()
    await page.waitForURL('/', { timeout: 10000 })
    await page.waitForLoadState('networkidle')

    // 광고 슬롯이 다시 생성되었는지 확인
    const afterNavCount = await page.locator('ins.adsbygoogle').count()
    expect(afterNavCount).toBeGreaterThanOrEqual(1)
  })

  test('광고 관련 Console 에러 없음', async ({ page }) => {
    const errors: string[] = []

    page.on('pageerror', (err) => {
      // CSP 관련 에러 제외 (CI 환경에서 발생 가능)
      if (/Content Security Policy|CSP/i.test(err.message)) return
      if (/adsbygoogle|adsense|coupang/i.test(err.message)) {
        errors.push(`[pageerror] ${err.message}`)
      }
    })
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        const text = msg.text()
        // CSP 차단 에러 제외
        if (/Content Security Policy|Refused to|CSP/i.test(text)) return
        // Google 태그 매니저 내부 에러 제외 (CI에서 빈번)
        if (/Failed to load resource.*googlesyndication/i.test(text)) return
        if (/adsbygoogle|adsense|coupang/i.test(text)) {
          errors.push(`[console.error] ${text}`)
        }
      }
    })

    await page.goto('/')
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(5000)

    if (errors.length > 0) {
      console.warn('[CI] 광고 관련 에러 발견:', errors)
    }
    expect(errors).toHaveLength(0)
  })
})
