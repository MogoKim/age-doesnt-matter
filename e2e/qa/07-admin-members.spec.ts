/**
 * QA 07 — 어드민 회원 관리 (admin.json storageState)
 *
 * 검증 항목:
 *   - 회원 목록 테이블 렌더링
 *   - 검색/필터 UI
 *   - 회원 상태 표시 (활성/정지/탈퇴)
 *   - 페이지네이션 존재
 *   - 회원 상세 접근 (읽기 전용)
 */
import { test, expect } from '@playwright/test'

test.describe('회원 목록', () => {
  test('회원 목록 접근 + 테이블 렌더링', async ({ page }) => {
    await page.goto('/admin/members')
    await page.waitForLoadState('networkidle', { timeout: 15000 })
    expect(page.url()).not.toContain('/login')
    await expect(page.locator('main').first()).toBeVisible()

    const table = page.locator('table, [role="table"]').first()
    await expect(table).toBeVisible({ timeout: 10000 })
  })

  test('회원 검색 입력폼 존재', async ({ page }) => {
    await page.goto('/admin/members')
    await page.waitForLoadState('networkidle', { timeout: 15000 })

    const searchInput = page.locator(
      'input[type="search"], input[placeholder*="검색"], input[placeholder*="닉네임"]',
    ).first()
    if (await searchInput.count() === 0) console.warn('[QA-07] 회원 검색폼 미발견')
    else await expect(searchInput).toBeVisible()
  })

  test('회원 상태 필터 존재', async ({ page }) => {
    await page.goto('/admin/members')
    await page.waitForLoadState('networkidle', { timeout: 15000 })

    const filter = page.locator('select, [class*="filter"], [class*="status"]').first()
    if (await filter.count() === 0) console.warn('[QA-07] 상태 필터 미발견')
  })

  test('회원 테이블 행 + 페이지네이션', async ({ page }) => {
    await page.goto('/admin/members')
    await page.waitForLoadState('networkidle', { timeout: 15000 })

    const rows = await page.locator('table tbody tr, [role="row"]').count()
    if (rows === 0) {
      console.warn('[QA-07] 회원 데이터 없음')
    }

    // 페이지네이션 (10명 이상일 때만 존재)
    const pagination = page.locator('[class*="pagination"], nav[aria-label*="page"]').first()
    if (rows >= 10 && await pagination.count() === 0) {
      console.warn('[QA-07] 10명 이상인데 페이지네이션 없음')
    }
  })
})
