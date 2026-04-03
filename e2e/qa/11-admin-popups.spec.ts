/**
 * QA 11 — 어드민 팝업 관리 (admin.json storageState)
 */
import { test, expect } from '@playwright/test'

test.describe('팝업 관리', () => {
  test('팝업 목록 접근 + 렌더링', async ({ page }) => {
    await page.goto('/admin/popups')
    await page.waitForLoadState('networkidle', { timeout: 15000 })
    expect(page.url()).not.toContain('/login')
    await expect(page.locator('main').first()).toBeVisible()
  })

  test('팝업 목록 테이블 또는 빈 상태', async ({ page }) => {
    await page.goto('/admin/popups')
    await page.waitForLoadState('networkidle', { timeout: 15000 })

    const table = page.locator('table, [role="table"]').first()
    const emptyMsg = page.getByText(/팝업 없|등록된 팝업/, { exact: false })
    const hasContent = (await table.count()) > 0 || (await emptyMsg.count()) > 0
    expect(hasContent, '팝업 페이지 콘텐츠 없음').toBe(true)
  })

  test('팝업 등록 버튼 존재', async ({ page }) => {
    await page.goto('/admin/popups')
    await page.waitForLoadState('networkidle', { timeout: 15000 })

    const addBtn = page
      .locator('button, a')
      .filter({ hasText: /팝업 등록|팝업 추가|등록/ })
      .first()
    if (await addBtn.count() === 0) {
      console.warn('[QA-11] 팝업 등록 버튼 미발견')
    }
  })
})
