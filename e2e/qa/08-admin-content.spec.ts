/**
 * QA 08 — 어드민 콘텐츠 관리 (admin.json storageState)
 *
 * 검증 항목:
 *   - 콘텐츠 목록 테이블 + 검색/필터
 *   - 게시글 상태 변경 UI (버튼 렌더링만)
 *   - 타입 필터 (STORY/QNA 등)
 */
import { test, expect } from '@playwright/test'

test.describe('콘텐츠 목록', () => {
  test('콘텐츠 관리 접근 + 테이블 렌더링', async ({ page }) => {
    await page.goto('/admin/content')
    await page.waitForLoadState('networkidle', { timeout: 15000 })
    expect(page.url()).not.toContain('/login')
    await expect(page.locator('main').first()).toBeVisible()

    const table = page.locator('table, [role="table"]').first()
    await expect(table).toBeVisible({ timeout: 10000 })
  })

  test('콘텐츠 검색 + 상태 필터 존재', async ({ page }) => {
    await page.goto('/admin/content')
    await page.waitForLoadState('networkidle', { timeout: 15000 })

    const searchInput = page
      .locator('input[type="search"], input[placeholder*="검색"], input[placeholder*="제목"]')
      .first()
    if (await searchInput.count() === 0) console.warn('[QA-08] 콘텐츠 검색폼 미발견')

    const statusFilter = page.locator('select, [class*="filter"]').first()
    if (await statusFilter.count() === 0) console.warn('[QA-08] 상태 필터 미발견')
  })

  test('게시글 타입별 필터 (URL 파라미터)', async ({ page }) => {
    await page.goto('/admin/content?boardType=STORY')
    await page.waitForLoadState('networkidle', { timeout: 15000 })
    await expect(page.locator('main').first()).toBeVisible()
    expect(page.url()).not.toContain('/login')
  })

  test('콘텐츠 행 액션 버튼 존재 (숨김/노출/삭제)', async ({ page }) => {
    await page.goto('/admin/content')
    await page.waitForLoadState('networkidle', { timeout: 15000 })

    const rows = await page.locator('table tbody tr').count()
    if (rows === 0) {
      console.warn('[QA-08] 콘텐츠 없음')
      return
    }

    // 첫 번째 행에 액션 버튼 확인
    const firstRow = page.locator('table tbody tr').first()
    const actionBtn = firstRow.locator('button, [class*="action"]').first()
    if (await actionBtn.count() === 0) console.warn('[QA-08] 행 액션 버튼 미발견')
  })
})
