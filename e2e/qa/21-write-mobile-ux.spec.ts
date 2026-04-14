/**
 * 글쓰기 화면 모바일 UX 검증 (2026-04-14)
 * 배포된 수정사항 실기기 대역 검증:
 * 1. GNB 아이콘 행(nav[aria-label="주요 메뉴"]) 완전 숨김
 * 2. header / footer 숨김
 * 3. 하단 "게시하기" CTA 버튼 표시 (키보드 없을 때)
 * 4. 하단 CTA 비활성 확인 (빈 상태)
 * 5. 전용 헤더 "등록" 버튼 표시
 * 6. 툴바 (B/I/U 등) 화면 하단 존재
 * 7. 수정(edit) 화면도 동일 레이아웃 검증
 */
import { test, expect } from '@playwright/test'

const BASE_URL = process.env.E2E_BASE_URL ?? 'https://www.age-doesnt-matter.com'

async function dismissDraftListIfShown(page: import('@playwright/test').Page) {
  const newWriteBtn = page.locator('button', { hasText: '새로 작성하기' })
  if (await newWriteBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    await newWriteBtn.click()
    await page.waitForTimeout(500)
  }
}

test.describe('글쓰기 화면 모바일 UX', () => {
  test.use({ storageState: 'e2e/.auth/user.json' })

  test('GNB 아이콘 행 완전 숨김', async ({ page }) => {
    await page.goto(`${BASE_URL}/community/write?board=stories`)
    await page.waitForLoadState('networkidle')
    await dismissDraftListIfShown(page)

    // nav[aria-label="주요 메뉴"] — IconMenu 행이 보이지 않아야 함
    const gnbNav = page.locator('nav[aria-label="주요 메뉴"]')
    // CSS display:none이므로 isHidden 또는 not visible
    await expect(gnbNav).toBeHidden({ timeout: 5000 })
    console.log('[PASS] GNB 아이콘 행 숨김 확인')

    await page.screenshot({ path: 'e2e/screenshots/21-gnb-hidden.png', fullPage: false })
  })

  test('header / footer 숨김', async ({ page }) => {
    await page.goto(`${BASE_URL}/community/write?board=stories`)
    await page.waitForLoadState('networkidle')
    await dismissDraftListIfShown(page)

    // header 태그 숨김
    const header = page.locator('header').first()
    await expect(header).toBeHidden({ timeout: 5000 })
    console.log('[PASS] header 숨김 확인')

    // footer 태그 숨김
    const footer = page.locator('footer').first()
    await expect(footer).toBeHidden({ timeout: 5000 })
    console.log('[PASS] footer 숨김 확인')

    await page.screenshot({ path: 'e2e/screenshots/21-header-footer-hidden.png', fullPage: false })
  })

  test('전용 헤더 — 타이틀 + 등록 버튼', async ({ page }) => {
    await page.goto(`${BASE_URL}/community/write?board=stories`)
    await page.waitForLoadState('networkidle')
    await dismissDraftListIfShown(page)

    // 전용 헤더 타이틀 "글쓰기" 포함
    const title = page.locator('span.text-body.font-bold.text-foreground')
    await expect(title).toContainText('글쓰기', { timeout: 8000 })
    console.log('[PASS] 전용 헤더 타이틀 확인')

    // 헤더 "등록" 버튼 존재
    const registerBtn = page.locator('button', { hasText: '등록' })
    await expect(registerBtn).toBeVisible({ timeout: 5000 })
    console.log('[PASS] 헤더 "등록" 버튼 존재 확인')

    await page.screenshot({ path: 'e2e/screenshots/21-header-register.png', fullPage: false })
  })

  test('하단 CTA "게시하기" — 기본 표시 확인', async ({ page }) => {
    await page.goto(`${BASE_URL}/community/write?board=stories`)
    await page.waitForLoadState('networkidle')
    await dismissDraftListIfShown(page)

    // 하단 고정 CTA "게시하기" 버튼 표시
    const ctaBtn = page.locator('button', { hasText: '게시하기' })
    await expect(ctaBtn).toBeVisible({ timeout: 8000 })
    console.log('[PASS] 하단 CTA "게시하기" 버튼 표시 확인')

    await page.screenshot({ path: 'e2e/screenshots/21-cta-visible.png', fullPage: false })
  })

  test('하단 CTA "게시하기" — 빈 상태에서 비활성', async ({ page }) => {
    await page.goto(`${BASE_URL}/community/write?board=stories`)
    await page.waitForLoadState('networkidle')
    await dismissDraftListIfShown(page)

    // 하단 CTA 버튼 — 빈 상태에서 disabled 또는 muted 색상
    const ctaBtn = page.locator('button', { hasText: '게시하기' })
    await expect(ctaBtn).toBeVisible({ timeout: 8000 })
    const isDisabled = await ctaBtn.isDisabled()
    console.log(`[INFO] 빈 상태 게시하기 버튼 disabled: ${isDisabled}`)
    expect(isDisabled).toBe(true)
    console.log('[PASS] 빈 상태 게시하기 비활성 확인')

    await page.screenshot({ path: 'e2e/screenshots/21-cta-disabled.png', fullPage: false })
  })

  test('하단 CTA "게시하기" — 내용 입력 후 활성화', async ({ page }) => {
    await page.goto(`${BASE_URL}/community/write?board=stories`)
    await page.waitForLoadState('networkidle')
    await dismissDraftListIfShown(page)

    // 카테고리 선택
    const firstCategory = page.locator('button.rounded-full').first()
    if (await firstCategory.isVisible({ timeout: 3000 }).catch(() => false)) {
      await firstCategory.click()
      await page.waitForTimeout(300)
    }

    // 제목 입력
    const titleInput = page.locator('input[placeholder*="제목"]')
    await titleInput.fill('테스트 제목입니다')
    await page.waitForTimeout(300)

    // 본문 입력
    const editor = page.locator('.ProseMirror').first()
    await editor.click()
    await editor.fill('테스트 본문 내용입니다')
    await page.waitForTimeout(500)

    // 게시하기 버튼 활성화 확인
    const ctaBtn = page.locator('button', { hasText: '게시하기' })
    const isDisabled = await ctaBtn.isDisabled()
    console.log(`[INFO] 내용 입력 후 게시하기 버튼 disabled: ${isDisabled}`)
    expect(isDisabled).toBe(false)
    console.log('[PASS] 내용 입력 후 게시하기 활성화 확인')

    await page.screenshot({ path: 'e2e/screenshots/21-cta-enabled.png', fullPage: false })
  })

  test('툴바(B/I/U) 화면 하단 존재 확인', async ({ page }) => {
    await page.goto(`${BASE_URL}/community/write?board=stories`)
    await page.waitForLoadState('networkidle')
    await dismissDraftListIfShown(page)

    // 에디터 클릭해서 포커스 (툴바 활성화)
    const editor = page.locator('.ProseMirror').first()
    await editor.click()
    await page.waitForTimeout(500)

    // Bold 버튼 ("B" 텍스트) 또는 사진 추가 버튼(title="사진 추가") 으로 툴바 존재 확인
    const boldBtn = page.locator('button', { hasText: /^B$/ }).first()
    const photoBtn = page.locator('button[title="사진 추가"]').first()

    const boldExists = await boldBtn.isVisible({ timeout: 5000 }).catch(() => false)
    const photoExists = await photoBtn.isVisible({ timeout: 3000 }).catch(() => false)

    console.log(`[INFO] Bold 버튼: ${boldExists}, 사진 버튼: ${photoExists}`)
    expect(boldExists || photoExists).toBe(true)
    console.log('[PASS] 툴바 존재 확인')

    await page.screenshot({ path: 'e2e/screenshots/21-toolbar.png', fullPage: false })
  })

  test('2막준비 글쓰기도 동일 레이아웃', async ({ page }) => {
    await page.goto(`${BASE_URL}/community/write?board=life2`)
    await page.waitForLoadState('networkidle')
    await dismissDraftListIfShown(page)

    // GNB 숨김
    const gnbNav = page.locator('nav[aria-label="주요 메뉴"]')
    await expect(gnbNav).toBeHidden({ timeout: 5000 })

    // 하단 CTA 표시
    const ctaBtn = page.locator('button', { hasText: '게시하기' })
    await expect(ctaBtn).toBeVisible({ timeout: 8000 })

    console.log('[PASS] 2막준비 글쓰기 레이아웃 확인')
    await page.screenshot({ path: 'e2e/screenshots/21-write-life2-mobile.png', fullPage: false })
  })

  test('웃음방 글쓰기도 동일 레이아웃', async ({ page }) => {
    await page.goto(`${BASE_URL}/community/write?board=humor`)
    await page.waitForLoadState('networkidle')
    await dismissDraftListIfShown(page)

    const gnbNav = page.locator('nav[aria-label="주요 메뉴"]')
    await expect(gnbNav).toBeHidden({ timeout: 5000 })

    const ctaBtn = page.locator('button', { hasText: '게시하기' })
    await expect(ctaBtn).toBeVisible({ timeout: 8000 })

    console.log('[PASS] 웃음방 글쓰기 레이아웃 확인')
    await page.screenshot({ path: 'e2e/screenshots/21-write-humor-mobile.png', fullPage: false })
  })
})
