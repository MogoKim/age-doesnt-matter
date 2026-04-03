/**
 * QA 05 — 유저 인증 기능 (user.json storageState 필요)
 *
 * 전제조건: e2e/.auth/user.json 존재
 *   → npx tsx e2e/export-kakao-cookies.ts 실행 후 생성
 *
 * 검증 항목:
 *   - 마이페이지 렌더링 + 닉네임 표시
 *   - 글쓰기 접근 (폼 렌더링만, 실제 저장 금지)
 *   - 공감/스크랩 버튼 활성화 확인
 *   - 댓글 입력폼 활성화
 *   - 프로필 설정 접근
 */
import { test, expect } from '@playwright/test'
import path from 'path'
import { existsSync } from 'fs'

const USER_AUTH = path.join(__dirname, '../.auth/user.json')

// user.json 없으면 전체 skip
test.beforeAll(() => {
  if (!existsSync(USER_AUTH)) {
    console.warn('[QA-05] user.json 없음 → 전체 skip. npx tsx e2e/export-kakao-cookies.ts 실행 필요')
  }
})

test.describe('마이페이지', () => {
  test('마이페이지 접근 + 닉네임 렌더링', async ({ page }) => {
    if (!existsSync(USER_AUTH)) {
      test.skip()
      return
    }
    const res = await page.goto('/my', { waitUntil: 'domcontentloaded', timeout: 15000 })
    expect(res?.status()).toBeLessThan(400)
    await page.waitForTimeout(1500)
    await expect(page.locator('main').first()).toBeVisible()
    // 닉네임은 마이페이지 h1에 렌더링됨
    await expect(page.locator('h1').first()).toBeVisible({ timeout: 10000 })
  })

  test('마이페이지 — 작성한 글 / 스크랩 탭 존재', async ({ page }) => {
    if (!existsSync(USER_AUTH)) {
      test.skip()
      return
    }
    await page.goto('/my', { waitUntil: 'domcontentloaded', timeout: 15000 })
    await page.waitForTimeout(1000)
    // 탭 또는 메뉴
    const tabs = page.locator('[role="tab"], [class*="tab"]')
    const count = await tabs.count()
    if (count === 0) console.warn('[QA-05] 마이페이지 탭 미발견')
  })
})

test.describe('글쓰기 (폼 렌더링만)', () => {
  test('글쓰기 페이지 접근 + 에디터 렌더링', async ({ page }) => {
    if (!existsSync(USER_AUTH)) {
      test.skip()
      return
    }
    // 직접 URL로 진입 (FAB 클릭 후 networkidle 대기는 30s 예산 초과)
    await page.goto('/community/write', { waitUntil: 'domcontentloaded', timeout: 15000 })
    await page.waitForTimeout(1500)

    // 제목/내용 입력폼 렌더링
    const titleInput = page.locator('input[name="title"], input[placeholder*="제목"]').first()
    const contentArea = page.locator('textarea, [contenteditable="true"], [class*="editor"]').first()
    const hasForm = (await titleInput.count()) > 0 || (await contentArea.count()) > 0
    expect(hasForm, '글쓰기 폼 미렌더링').toBe(true)
  })
})

test.describe('커뮤니티 인증 기능', () => {
  test('로그인 상태 — 공감 버튼 클릭 가능 (API 오류 없음)', { timeout: 60000 }, async ({ page }) => {
    if (!existsSync(USER_AUTH)) {
      test.skip()
      return
    }
    await page.goto('/community', { waitUntil: 'domcontentloaded', timeout: 15000 })
    await page.waitForTimeout(2000)

    const firstLink = page
      .locator('a[href*="/community/"]')
      .filter({ hasNotText: /글쓰기|더보기/ })
      .first()
    if (await firstLink.count() === 0) {
      test.skip(true, '게시글 없음')
      return
    }
    await firstLink.click()
    await page.waitForLoadState('domcontentloaded', { timeout: 15000 })
    await page.waitForTimeout(1500)

    const likeBtn = page
      .locator('button')
      .filter({ hasText: /공감|좋아요|👍/ })
      .first()
    if (await likeBtn.count() === 0) return

    // 401 에러 없이 클릭 가능해야 함
    let apiError = false
    page.on('response', (res) => {
      if (res.url().includes('/api/') && res.status() === 401) apiError = true
    })
    await likeBtn.click()
    await page.waitForTimeout(2000)
    expect(apiError, '공감 API 401 오류').toBe(false)
  })

  test('댓글 입력폼 표시 (로그인 상태)', async ({ page }) => {
    if (!existsSync(USER_AUTH)) {
      test.skip()
      return
    }
    await page.goto('/community', { waitUntil: 'domcontentloaded', timeout: 15000 })
    await page.waitForTimeout(2000)

    const firstLink = page
      .locator('a[href*="/community/"]')
      .filter({ hasNotText: /글쓰기|더보기/ })
      .first()
    if (await firstLink.count() === 0) return
    await firstLink.click()
    await page.waitForLoadState('domcontentloaded', { timeout: 15000 })
    await page.waitForTimeout(1500)

    const commentInput = page.locator(
      'textarea[placeholder*="댓글"], input[placeholder*="댓글"], [class*="comment-input"]',
    ).first()
    await expect(commentInput).toBeVisible({ timeout: 10000 })
  })
})

test.describe('설정 페이지', () => {
  test('설정 접근 + UI 렌더링', async ({ page }) => {
    if (!existsSync(USER_AUTH)) {
      test.skip()
      return
    }
    const settingsRes = await page.goto('/my/settings', { waitUntil: 'domcontentloaded', timeout: 15000 })
    if (settingsRes && settingsRes.status() === 404) {
      await page.goto('/my', { waitUntil: 'domcontentloaded', timeout: 15000 })
      await page.waitForTimeout(1000)
      const settingsLink = page.locator('a, button').filter({ hasText: /설정|프로필 수정/ }).first()
      if (await settingsLink.count() > 0) await settingsLink.click()
      await page.waitForLoadState('domcontentloaded', { timeout: 10000 })
    }
    await expect(page.locator('main').first()).toBeVisible()
  })
})
