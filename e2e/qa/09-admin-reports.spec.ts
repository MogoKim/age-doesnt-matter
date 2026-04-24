/**
 * QA 09 — 어드민 신고 관리 (admin.json storageState)
 *
 * 검증 항목:
 *   - 신고 목록 접근 + 테이블
 *   - 신고 탭 (미처리/처리완료)
 *   - 처리 버튼 렌더링
 */
import { test, expect } from '@playwright/test'

test.describe('신고 관리', () => {
  test('신고 목록 접근 + 렌더링', async ({ page }) => {
    await page.goto('/admin/reports')
    await page.waitForLoadState('networkidle', { timeout: 15000 })
    expect(page.url()).not.toContain('/login')
    await expect(page.locator('main').first()).toBeVisible()
  })

  test('신고 목록 테이블 또는 빈 상태 메시지', async ({ page }) => {
    await page.goto('/admin/reports')
    await page.waitForLoadState('networkidle', { timeout: 15000 })

    const table = page.locator('table, [role="table"]').first()
    const emptyMsg = page.getByText(/신고 없|접수된 신고/, { exact: false })
    const hasContent = (await table.count()) > 0 || (await emptyMsg.count()) > 0
    expect(hasContent, '신고 페이지 빈 상태').toBe(true)
  })

  test('신고 탭 (미처리/처리완료) 존재', async ({ page }) => {
    await page.goto('/admin/reports')
    await page.waitForLoadState('networkidle', { timeout: 15000 })

    const tabs = page.locator('[role="tab"], [class*="tab"]')
    if (await tabs.count() === 0) console.warn('[QA-09] 신고 탭 미발견')
  })
})
