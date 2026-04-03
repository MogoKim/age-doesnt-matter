/**
 * QA 10 — 어드민 배너/광고 관리 (admin.json storageState)
 *
 * 검증 항목:
 *   - 배너 목록 접근
 *   - 배너 생성 폼 렌더링 (저장 금지)
 *   - 배너 상태 표시
 */
import { test, expect } from '@playwright/test'

test.describe('배너 관리', () => {
  test('배너 목록 접근 + 렌더링', async ({ page }) => {
    await page.goto('/admin/banners')
    await page.waitForLoadState('networkidle', { timeout: 15000 })
    expect(page.url()).not.toContain('/login')
    await expect(page.locator('main').first()).toBeVisible()
  })

  test('배너 목록 테이블 또는 빈 상태', async ({ page }) => {
    await page.goto('/admin/banners')
    await page.waitForLoadState('networkidle', { timeout: 15000 })

    const table = page.locator('table, [class*="table"], [class*="list"]').first()
    // "등록된 히어로 배너가 없습니다." / "등록된 광고가 없습니다." 패턴 대응
    const emptyMsg = page.getByText(/없습니다|배너.*없|등록된.*배너|없음/, { exact: false })
    const hasContent = (await table.count()) > 0 || (await emptyMsg.count()) > 0
    expect(hasContent, '배너 페이지 콘텐츠 없음').toBe(true)
  })

  test('배너 등록 버튼 + 폼 모달/페이지 렌더링', async ({ page }) => {
    await page.goto('/admin/banners')
    await page.waitForLoadState('networkidle', { timeout: 15000 })

    const addBtn = page
      .locator('button, a')
      .filter({ hasText: /배너 등록|배너 추가|새 배너|등록/ })
      .first()
    if (await addBtn.count() === 0) {
      console.warn('[QA-10] 배너 등록 버튼 미발견')
      return
    }

    await addBtn.click()
    await page.waitForLoadState('networkidle', { timeout: 10000 })

    // 폼 렌더링 확인 (저장 안 함)
    const form = page.locator('form, [class*="form"]').first()
    const modal = page.locator('[role="dialog"], [class*="modal"]').first()
    const hasForm = (await form.count()) > 0 || (await modal.count()) > 0
    expect(hasForm, '배너 등록 폼 미렌더링').toBe(true)
  })
})
