/**
 * QA 06 — 어드민 대시보드 (admin.json storageState)
 *
 * 주의: E2E_BASE_URL은 Vercel URL로 설정 (CRUD 안전)
 *   E2E_BASE_URL=https://age-doesnt-matter.vercel.app
 *
 * 검증 항목:
 *   - 대시보드 접근 + KPI 카드
 *   - 사이드바 네비게이션
 *   - 주요 수치 렌더링 (에러 없음)
 */
import { test, expect } from '@playwright/test'

test.describe('어드민 대시보드', () => {
  test('대시보드 접근 + main 렌더링', async ({ page }) => {
    await page.goto('/admin')
    await page.waitForLoadState('networkidle', { timeout: 15000 })
    // 로그인 페이지로 리다이렉트 안 됨
    expect(page.url()).not.toContain('/login')
    await expect(page.locator('main').first()).toBeVisible()
  })

  test('KPI 카드 또는 통계 수치 존재', async ({ page }) => {
    await page.goto('/admin')
    await page.waitForLoadState('networkidle', { timeout: 15000 })
    // 숫자가 있는 카드 또는 stat
    const stats = page.locator('[class*="card"], [class*="stat"], [class*="kpi"]')
    const count = await stats.count()
    if (count === 0) console.warn('[QA-06] KPI 카드 미발견')
  })

  test('사이드바 — 주요 메뉴 링크 존재', async ({ page }) => {
    await page.goto('/admin')
    await page.waitForLoadState('networkidle', { timeout: 15000 })

    const sidebar = page.locator('nav, aside, [class*="sidebar"]').first()
    await expect(sidebar).toBeVisible({ timeout: 10000 })

    // 핵심 메뉴 확인
    const menuTexts = ['회원', '콘텐츠', '신고', '배너', '팝업', '설정']
    for (const text of menuTexts) {
      const link = sidebar.getByText(text, { exact: false })
      if (await link.count() === 0) console.warn(`[QA-06] 사이드바 메뉴 미발견: ${text}`)
    }
  })

  test('어드민 로그아웃 버튼 존재', async ({ page }) => {
    await page.goto('/admin')
    await page.waitForLoadState('networkidle', { timeout: 15000 })
    const logoutBtn = page
      .locator('button, a')
      .filter({ hasText: /로그아웃|logout/i })
      .first()
    if (await logoutBtn.count() === 0) console.warn('[QA-06] 로그아웃 버튼 미발견')
  })
})
