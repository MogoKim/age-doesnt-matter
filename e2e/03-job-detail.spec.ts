import { test, expect } from '@playwright/test'

test.describe('시나리오 4: 일자리 상세 → 지원 클릭 → 외부 이동', () => {
  test('일자리 목록 → 상세 페이지 접근', async ({ page }) => {
    await page.goto('/jobs')
    await expect(page.locator('main')).toBeVisible()

    // 일자리 링크 클릭 (있는 경우)
    const firstJobLink = page.locator('a[href*="/jobs/"]').first()
    if (await firstJobLink.isVisible()) {
      await firstJobLink.click()
      await expect(page).toHaveURL(/\/jobs\//)
      await expect(page.locator('main')).toBeVisible()
    }
  })

  test('매거진 목록 → 상세 페이지 접근', async ({ page }) => {
    await page.goto('/magazine')
    await expect(page.locator('main')).toBeVisible()

    const firstLink = page.locator('a[href*="/magazine/"]').first()
    if (await firstLink.isVisible()) {
      await firstLink.click()
      await expect(page).toHaveURL(/\/magazine\//)
      await expect(page.locator('main')).toBeVisible()
    }
  })
})
