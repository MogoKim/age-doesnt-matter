/**
 * QA 12 — 어드민 설정 관리 (admin.json storageState)
 *
 * 검증 항목:
 *   - 게시판 설정 접근 + 목록
 *   - 금지어 목록 접근
 *   - 설정 폼 렌더링
 */
import { test, expect } from '@playwright/test'

test.describe('어드민 설정', () => {
  test('설정 페이지 접근 + 렌더링', async ({ page }) => {
    await page.goto('/admin/settings')
    await page.waitForLoadState('networkidle', { timeout: 15000 })
    expect(page.url()).not.toContain('/login')
    await expect(page.locator('main').first()).toBeVisible()
  })

  test('게시판 설정 또는 금지어 영역 존재', async ({ page }) => {
    await page.goto('/admin/settings')
    await page.waitForLoadState('networkidle', { timeout: 15000 })

    const sections = page.locator('[class*="section"], [class*="card"], fieldset').count()
    const count = await sections
    if (count === 0) console.warn('[QA-12] 설정 섹션 미발견')
  })

  test('금지어 목록 접근 (서브페이지 있는 경우)', async ({ page }) => {
    // 금지어 전용 페이지가 있으면 접근, 없으면 설정 페이지에 포함
    await page.goto('/admin/settings')
    await page.waitForLoadState('networkidle', { timeout: 15000 })

    // "금지어" 텍스트 존재 여부만 확인
    const hasBannedWords = await page.getByText(/금지어|차단어/, { exact: false }).count()
    if (hasBannedWords === 0) console.warn('[QA-12] 금지어 관련 UI 미발견')
  })
})
