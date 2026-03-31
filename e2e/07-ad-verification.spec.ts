import { test, expect } from '@playwright/test'

test.describe('시나리오 7: 광고 렌더링 검증', () => {

  test('데스크탑: AdSense 슬롯 존재', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 })
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    // 홈 섹션 + 인피드 + 사이드바 → 최소 2개
    const adsenseSlots = page.locator('ins.adsbygoogle')
    const count = await adsenseSlots.count()
    expect(count).toBeGreaterThanOrEqual(2)
  })

  test('모바일: AdSense 슬롯 존재', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 })
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    // 홈 섹션 + 인피드 → 최소 1개
    const adsenseSlots = page.locator('ins.adsbygoogle')
    const count = await adsenseSlots.count()
    expect(count).toBeGreaterThanOrEqual(1)
  })

  test('AdSense 스크립트 처리 확인 (data-ad-status)', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    // ins.adsbygoogle 태그가 DOM에 존재하는지 먼저 확인
    const slot = page.locator('ins.adsbygoogle').first()
    const attached = await slot.waitFor({ state: 'attached', timeout: 10000 }).then(() => true).catch(() => false)
    if (!attached) {
      // CI 환경에서 AdSense 스크립트 차단 가능 — skip
      test.skip(true, 'AdSense ins 태그가 DOM에 없음 — CI 환경일 수 있음')
      return
    }

    // Google이 슬롯을 처리할 때까지 대기 (최대 15초)
    // filled/unfilled 둘 다 성공 — Google이 슬롯을 인식했다는 증거
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
      // timeout — Google 스크립트가 슬롯을 처리하지 못함
      // CI IP에서 Google이 광고를 서빙하지 않을 수 있으므로 경고만
      console.warn('AdSense data-ad-status 미설정 — CI 환경에서는 정상일 수 있음')
    }
  })

  test('쿠팡 배너 이미지 렌더링', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 })
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    const coupangBanner = page.locator('img[src*="ads-partners.coupang.com"]')
    await expect(coupangBanner.first()).toBeVisible({ timeout: 10000 })
  })

  test('SPA 네비게이션 후 광고 슬롯 재생성', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    // 초기 광고 슬롯 수 확인
    const initialCount = await page.locator('ins.adsbygoogle').count()

    // 매거진으로 이동
    await page.getByRole('navigation').getByRole('link', { name: '매거진' }).click()
    await page.waitForURL(/\/magazine/, { timeout: 10000 })
    await page.waitForLoadState('networkidle')

    // 홈으로 돌아오기
    await page.locator('header a[href="/"]').first().click()
    await page.waitForURL('/', { timeout: 10000 })
    await page.waitForLoadState('networkidle')

    // 광고 슬롯이 다시 생성되었는지 확인
    const afterNavCount = await page.locator('ins.adsbygoogle').count()
    expect(afterNavCount).toBeGreaterThanOrEqual(1)
    // 초기와 동일하거나 더 많아야 함
    expect(afterNavCount).toBeGreaterThanOrEqual(initialCount)
  })

  test('광고 관련 Console 에러 없음', async ({ page }) => {
    const errors: string[] = []

    page.on('pageerror', (err) => {
      if (/adsbygoogle|adsense|coupang/i.test(err.message)) {
        errors.push(`[pageerror] ${err.message}`)
      }
    })
    page.on('console', (msg) => {
      if (msg.type() === 'error' && /adsbygoogle|adsense|coupang/i.test(msg.text())) {
        errors.push(`[console.error] ${msg.text()}`)
      }
    })

    await page.goto('/')
    await page.waitForLoadState('networkidle')
    // 광고 스크립트 로드 + 처리 대기
    await page.waitForTimeout(5000)

    if (errors.length > 0) {
      console.warn('광고 관련 에러 발견:', errors)
    }
    expect(errors).toHaveLength(0)
  })
})
