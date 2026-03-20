import { test, expect } from '@playwright/test'

test.describe('시나리오 2: 글 목록 → 상세 → 목록 복귀', () => {
  test('커뮤니티 이야기 목록 → 게시글 클릭 → 상세 페이지', async ({ page }) => {
    await page.goto('/community/stories')

    // 게시글 목록 렌더링 확인
    await expect(page.locator('main')).toBeVisible()

    // 첫 번째 게시글 링크 클릭 (있는 경우)
    const firstPostLink = page.locator('a[href*="/community/stories/"]').first()
    if (await firstPostLink.isVisible()) {
      await firstPostLink.click()
      // 상세 페이지 URL 확인
      await expect(page).toHaveURL(/\/community\/stories\//)
      // 상세 페이지 콘텐츠 확인
      await expect(page.locator('main')).toBeVisible()
    }
  })

  test('유머 게시판 목록 접근', async ({ page }) => {
    await page.goto('/community/humor')
    await expect(page.locator('main')).toBeVisible()
  })

  test('베스트 게시판 접근', async ({ page }) => {
    await page.goto('/best')
    await expect(page.locator('main')).toBeVisible()
  })
})
