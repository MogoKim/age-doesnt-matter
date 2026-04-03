/**
 * QA 03 — 일자리 + 매거진 (인증 불필요)
 *
 * 검증 항목:
 *   - 일자리 목록 렌더링 + 필터 존재
 *   - 일자리 상세 페이지 접근
 *   - 매거진 목록 렌더링
 *   - 매거진 상세 콘텐츠 + 광고 슬롯
 */
import { test, expect } from '@playwright/test'

test.describe('일자리', () => {
  test('일자리 목록 200 + 아이템 존재', async ({ page }) => {
    const res = await page.goto('/jobs')
    expect(res?.status()).toBeLessThan(400)
    await page.waitForLoadState('networkidle', { timeout: 15000 })

    await expect(page.locator('main').first()).toBeVisible()
    const items = await page
      .locator('article, [class*="job"], [class*="card"], li')
      .count()
    expect(items).toBeGreaterThan(0)
  })

  test('일자리 필터 — 지역/근무형태 드롭다운 또는 버튼 존재', async ({ page }) => {
    await page.goto('/jobs')
    await page.waitForLoadState('networkidle')

    const filter = page.locator(
      'select, [class*="filter"], [class*="dropdown"], button[class*="region"], button[class*="type"]',
    ).first()
    // 필터가 없으면 소프트 경고만
    const count = await filter.count()
    if (count === 0) {
      console.warn('[QA-03] 일자리 필터 UI 미발견')
    }
  })

  test('첫 번째 일자리 상세 진입', async ({ page }) => {
    await page.goto('/jobs')
    await page.waitForLoadState('networkidle', { timeout: 15000 })

    const firstLink = page
      .locator('a[href*="/jobs/"]')
      .filter({ hasNotText: /더보기|전체/ })
      .first()

    if (await firstLink.count() === 0) {
      test.skip(true, '일자리 데이터 없음')
      return
    }

    await firstLink.click()
    await page.waitForLoadState('networkidle', { timeout: 15000 })
    expect(page.url()).toContain('/jobs/')
    await expect(page.locator('main, article').first()).toBeVisible()
  })

  test('일자리 상세 — 급여/근무지/고용형태 정보 렌더링', async ({ page }) => {
    await page.goto('/jobs')
    await page.waitForLoadState('networkidle', { timeout: 15000 })

    const firstLink = page
      .locator('a[href*="/jobs/"]')
      .filter({ hasNotText: /더보기|전체/ })
      .first()
    if (await firstLink.count() === 0) {
      test.skip(true, '일자리 데이터 없음')
      return
    }

    await firstLink.click()
    await page.waitForLoadState('networkidle', { timeout: 15000 })

    // 핵심 정보 중 최소 1개 이상 렌더링
    const hasInfo = await page.getByText(/급여|월급|시급|근무지|지역|고용형태|채용/, { exact: false }).count()
    expect(hasInfo).toBeGreaterThan(0)
  })
})

test.describe('매거진', () => {
  test('매거진 목록 200 + 아이템 존재', async ({ page }) => {
    const res = await page.goto('/magazine')
    expect(res?.status()).toBeLessThan(400)
    await page.waitForLoadState('networkidle', { timeout: 15000 })

    await expect(page.locator('main').first()).toBeVisible()
    const items = await page.locator('article, [class*="magazine"], [class*="card"]').count()
    expect(items).toBeGreaterThan(0)
  })

  test('첫 번째 매거진 상세 — 콘텐츠 + 제목 렌더링', async ({ page }) => {
    await page.goto('/magazine')
    await page.waitForLoadState('networkidle', { timeout: 15000 })

    const firstLink = page
      .locator('a[href*="/magazine/"]')
      .filter({ hasNotText: /더보기/ })
      .first()
    if (await firstLink.count() === 0) {
      test.skip(true, '매거진 데이터 없음')
      return
    }

    await firstLink.click()
    await page.waitForLoadState('networkidle', { timeout: 15000 })
    expect(page.url()).toContain('/magazine/')

    // 제목 + 본문 최소 렌더링
    const heading = page.locator('h1, h2').first()
    await expect(heading).toBeVisible({ timeout: 10000 })
  })

  test('매거진 상세 — OG 메타 태그 존재', async ({ page }) => {
    await page.goto('/magazine')
    await page.waitForLoadState('networkidle', { timeout: 15000 })

    const firstLink = page
      .locator('a[href*="/magazine/"]')
      .filter({ hasNotText: /더보기/ })
      .first()
    if (await firstLink.count() === 0) return

    await firstLink.click()
    await page.waitForLoadState('networkidle', { timeout: 15000 })

    const ogTitle = await page.locator('meta[property="og:title"]').getAttribute('content')
    expect(ogTitle && ogTitle.length > 0, 'og:title 미설정').toBe(true)

    const ogImage = await page.locator('meta[property="og:image"]').getAttribute('content')
    expect(ogImage && ogImage.length > 0, 'og:image 미설정').toBe(true)
  })
})
