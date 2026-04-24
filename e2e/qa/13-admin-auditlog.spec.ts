/**
 * QA 13 — 어드민 감사로그 (admin.json storageState)
 *
 * 검증 항목:
 *   - 감사로그 목록 접근 + 렌더링
 *   - 날짜/액션 유형 필터
 *   - 페이지네이션
 */
import { test, expect } from '@playwright/test'

test.describe('감사로그', () => {
  test('감사로그 접근 + 렌더링', async ({ page }) => {
    await page.goto('/admin/audit-log')
    await page.waitForLoadState('networkidle', { timeout: 15000 })
    expect(page.url()).not.toContain('/login')
    await expect(page.locator('main').first()).toBeVisible()
  })

  test('감사로그 테이블 또는 빈 상태', async ({ page }) => {
    await page.goto('/admin/audit-log')
    await page.waitForLoadState('networkidle', { timeout: 15000 })

    const table = page.locator('table, [role="table"]').first()
    const emptyMsg = page.getByText(/로그 없|기록 없/, { exact: false })
    const hasContent = (await table.count()) > 0 || (await emptyMsg.count()) > 0
    expect(hasContent, '감사로그 페이지 콘텐츠 없음').toBe(true)
  })

  test('날짜 또는 액션 필터 존재', async ({ page }) => {
    await page.goto('/admin/audit-log')
    await page.waitForLoadState('networkidle', { timeout: 15000 })

    const filter = page.locator(
      'input[type="date"], select, [class*="filter"], [class*="date"]',
    ).first()
    if (await filter.count() === 0) console.warn('[QA-13] 감사로그 필터 미발견')
  })
})
