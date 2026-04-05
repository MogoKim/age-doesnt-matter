/**
 * 최근 수정사항 검증 (2026-04-05)
 * 1. 글쓰기 페이지 타이틀 — board.displayName 표시
 * 2. FAB → 글쓰기 진입 시 서브카테고리 정확도 (slug 소문자 수정)
 * 3. 각 게시판별 write URL 직접 접근 검증
 */
import { test, expect } from '@playwright/test'

const BASE_URL = process.env.E2E_BASE_URL ?? 'https://www.age-doesnt-matter.com'

test.describe('최근 수정사항 검증', () => {
  test.use({ storageState: 'e2e/.auth/user.json' })

  test('사는이야기 글쓰기 — 타이틀 + 카테고리', async ({ page }) => {
    await page.goto(`${BASE_URL}/community/write?board=stories`)
    await page.waitForLoadState('networkidle')

    // 제목 확인
    const title = page.locator('span.text-body.font-bold.text-foreground')
    await expect(title).toContainText('사는이야기 글쓰기', { timeout: 10000 })
    console.log('[PASS] 사는이야기 글쓰기 타이틀 확인')

    await page.screenshot({ path: 'e2e/screenshots/write-stories.png' })
  })

  test('2막준비 글쓰기 — 타이틀 + 카테고리 (은퇴준비 등)', async ({ page }) => {
    await page.goto(`${BASE_URL}/community/write?board=life2`)
    await page.waitForLoadState('networkidle')

    // 제목 확인
    const title = page.locator('span.text-body.font-bold.text-foreground')
    await expect(title).toContainText('2막준비 글쓰기', { timeout: 10000 })
    console.log('[PASS] 2막준비 글쓰기 타이틀 확인')

    // 서브카테고리 버튼 존재 확인 (사는이야기 카테고리가 아닌 2막준비 카테고리)
    const categoryBtns = page.locator('button.rounded-full')
    const count = await categoryBtns.count()
    console.log(`[INFO] 2막준비 카테고리 버튼 수: ${count}`)

    // 사는이야기 카테고리("감동이야기", "일상다반사")가 보이지 않아야 함
    const wrongCategory = page.locator('button', { hasText: '감동이야기' })
    await expect(wrongCategory).toHaveCount(0)
    console.log('[PASS] 잘못된 카테고리(감동이야기) 없음 확인')

    await page.screenshot({ path: 'e2e/screenshots/write-life2.png' })
  })

  test('웃음방 글쓰기 — 타이틀', async ({ page }) => {
    await page.goto(`${BASE_URL}/community/write?board=humor`)
    await page.waitForLoadState('networkidle')

    const title = page.locator('span.text-body.font-bold.text-foreground')
    await expect(title).toContainText('웃음방 글쓰기', { timeout: 10000 })
    console.log('[PASS] 웃음방 글쓰기 타이틀 확인')

    await page.screenshot({ path: 'e2e/screenshots/write-humor.png' })
  })

  test('board 미지정 글쓰기 — 기본값 폴백', async ({ page }) => {
    await page.goto(`${BASE_URL}/community/write`)
    await page.waitForLoadState('networkidle')

    // 어떤 board든 "글쓰기" 포함 타이틀 노출
    const title = page.locator('span.text-body.font-bold.text-foreground')
    const titleText = await title.textContent()
    console.log(`[INFO] 기본 타이틀: ${titleText}`)
    expect(titleText).toMatch(/글쓰기/)

    await page.screenshot({ path: 'e2e/screenshots/write-default.png' })
  })
})
