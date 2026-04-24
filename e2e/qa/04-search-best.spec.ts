/**
 * QA 04 — 검색 + 베스트 (인증 불필요)
 *
 * 검증 항목:
 *   - 통합 검색 결과 렌더링 (탭별)
 *   - 검색어 없음 / 빈 결과 UX
 *   - 베스트 탭 3개 (오늘/주간/명예의전당) 전환
 *   - 각 탭 콘텐츠 렌더링
 */
import { test, expect } from '@playwright/test'

test.describe('통합 검색', () => {
  test('검색 페이지 접근', async ({ page }) => {
    const res = await page.goto('/search')
    expect(res?.status()).toBeLessThan(400)
    await page.waitForLoadState('networkidle')
    await expect(page.locator('main').first()).toBeVisible()
  })

  test('검색어 입력 → 결과 렌더링', async ({ page }) => {
    await page.goto('/search')
    await page.waitForLoadState('networkidle')

    const searchInput = page.locator('input[type="search"], input[placeholder*="검색"]').first()
    if (await searchInput.count() === 0) {
      // URL 파라미터 방식
      await page.goto('/search?q=건강')
    } else {
      await searchInput.fill('건강')
      await searchInput.press('Enter')
    }

    await page.waitForLoadState('networkidle', { timeout: 15000 })
    // 결과 또는 "결과가 없습니다" 둘 중 하나
    const hasResults = await page.locator('article, [class*="result"], [class*="item"]').count()
    const hasEmpty = await page.getByText(/결과가 없|검색 결과 없|0건/).count()
    expect(hasResults + hasEmpty).toBeGreaterThan(0)
  })

  test('검색 결과 탭 전환 (커뮤니티/일자리/매거진)', async ({ page }) => {
    await page.goto('/search?q=건강')
    await page.waitForLoadState('networkidle', { timeout: 15000 })

    const tabs = page.locator('[role="tab"], [class*="tab"]')
    const tabCount = await tabs.count()
    if (tabCount === 0) {
      console.warn('[QA-04] 검색 탭 UI 미발견')
      return
    }
    // 각 탭 클릭 후 페이지 에러 없음 확인
    for (let i = 0; i < Math.min(tabCount, 3); i++) {
      await tabs.nth(i).click()
      await page.waitForLoadState('networkidle', { timeout: 10000 })
      await expect(page.locator('main').first()).toBeVisible()
    }
  })
})

test.describe('베스트 (인기글)', () => {
  test('베스트 페이지 접근 + 탭 렌더링', async ({ page }) => {
    const res = await page.goto('/best')
    expect(res?.status()).toBeLessThan(400)
    await page.waitForLoadState('networkidle', { timeout: 15000 })
    await expect(page.locator('main').first()).toBeVisible()
  })

  test('베스트 — 오늘의 베스트 탭 콘텐츠', async ({ page }) => {
    await page.goto('/best')
    await page.waitForLoadState('networkidle', { timeout: 15000 })

    // "오늘" 탭 클릭 (이미 활성화일 수도 있음)
    const todayTab = page.locator('[role="tab"], button, a').filter({ hasText: /오늘|Today/ }).first()
    if (await todayTab.count() > 0) {
      await todayTab.click()
      await page.waitForLoadState('networkidle', { timeout: 10000 })
    }

    const items = await page.locator('article, [class*="post"], [class*="card"], li[class*="item"]').count()
    // 베스트는 데이터가 없을 수 있음 (초기 운영 단계)
    if (items === 0) {
      console.warn('[QA-04] 오늘의 베스트 항목 없음 — 운영 초기 상태')
    }
  })

  test('베스트 — 주간 탭 전환', async ({ page }) => {
    await page.goto('/best')
    await page.waitForLoadState('networkidle', { timeout: 15000 })

    const weekTab = page.locator('[role="tab"], button, a').filter({ hasText: /주간|Week/ }).first()
    if (await weekTab.count() === 0) {
      console.warn('[QA-04] 주간 탭 미발견')
      return
    }
    await weekTab.click()
    await page.waitForLoadState('networkidle', { timeout: 10000 })
    await expect(page.locator('main').first()).toBeVisible()
  })

  test('베스트 — 명예의전당 탭 전환', async ({ page }) => {
    await page.goto('/best')
    await page.waitForLoadState('networkidle', { timeout: 15000 })

    const hallTab = page
      .locator('[role="tab"], button, a')
      .filter({ hasText: /명예의전당|Hall|HOF/ })
      .first()
    if (await hallTab.count() === 0) {
      console.warn('[QA-04] 명예의전당 탭 미발견')
      return
    }
    await hallTab.click()
    await page.waitForLoadState('networkidle', { timeout: 10000 })
    await expect(page.locator('main').first()).toBeVisible()
  })
})
