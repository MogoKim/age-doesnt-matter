/**
 * QA 02 — 커뮤니티 공개 접근 (인증 불필요)
 *
 * 검증 항목:
 *   - 게시판 목록 페이지 렌더링
 *   - 글 상세 접근 가능 여부
 *   - 댓글 목록 렌더링
 *   - 공감/스크랩 버튼 존재 (비로그인 시 로그인 유도 여부)
 *   - 글쓰기 버튼 — 비로그인 클릭 시 로그인 페이지로 이동
 */
import { test, expect } from '@playwright/test'

test.describe('커뮤니티 목록', { tag: ['@smoke', '@public'] }, () => {
  test('커뮤니티 홈 200 + 게시글 아이템 존재', async ({ page }) => {
    const res = await page.goto('/community')
    expect(res?.status()).toBeLessThan(400)
    await page.waitForLoadState('networkidle', { timeout: 15000 })

    const items = await page.locator('article, [class*="post"], [class*="card"], li[class*="item"]').count()
    expect(items).toBeGreaterThan(0)
  })

  test('게시판 탭 또는 카테고리 필터 존재', async ({ page }) => {
    await page.goto('/community')
    await page.waitForLoadState('networkidle')
    // 탭 또는 버튼 그룹 (role="group"은 카테고리 필터 그룹)
    const tabs = page.locator('[role="tab"], [role="group"], [class*="tab"], [class*="filter"], [class*="category"]').first()
    await expect(tabs).toBeVisible({ timeout: 10000 })
  })
})

test.describe('커뮤니티 글 상세', () => {
  test('첫 번째 게시글 클릭 → 상세 진입', async ({ page }) => {
    await page.goto('/community')
    await page.waitForLoadState('networkidle', { timeout: 15000 })

    // 실제 게시글 링크: /community/stories/[id] 또는 /community/humor/[id] 형식
    const firstLink = page
      .locator('a[href*="/community/stories/"], a[href*="/community/humor/"]')
      .first()

    const count = await firstLink.count()
    if (count === 0) {
      test.skip(true, '커뮤니티 게시글 없음 — 데이터 필요')
      return
    }

    await firstLink.click()
    await page.waitForLoadState('networkidle', { timeout: 15000 })

    // 상세 페이지 진입 확인
    expect(page.url()).toContain('/community/')
    await expect(page.locator('main, article').first()).toBeVisible()
  })

  test('글 상세 — 댓글 영역 렌더링', async ({ page }) => {
    await page.goto('/community')
    await page.waitForLoadState('networkidle', { timeout: 15000 })

    const firstLink = page
      .locator('a[href*="/community/stories/"], a[href*="/community/humor/"]')
      .first()

    if (await firstLink.count() === 0) {
      test.skip(true, '게시글 없음')
      return
    }
    await firstLink.click()
    await page.waitForLoadState('networkidle', { timeout: 15000 })

    // 댓글 영역 또는 "댓글" 텍스트
    const commentSection = page.locator(
      '[class*="comment"], [id*="comment"], section:has-text("댓글")',
    ).first()
    await expect(commentSection).toBeVisible({ timeout: 10000 })
  })

  test('글 상대 — 비로그인 공감 클릭 → 로그인 유도', async ({ page }) => {
    await page.goto('/community')
    await page.waitForLoadState('networkidle', { timeout: 15000 })

    const firstLink = page
      .locator('a[href*="/community/stories/"], a[href*="/community/humor/"]')
      .first()

    if (await firstLink.count() === 0) {
      test.skip(true, '게시글 없음')
      return
    }
    await firstLink.click()
    await page.waitForLoadState('networkidle', { timeout: 15000 })

    const likeBtn = page
      .locator('button')
      .filter({ hasText: /공감|좋아요|👍|❤️/ })
      .first()
    if (await likeBtn.count() === 0) return

    await likeBtn.click()
    // 로그인 모달 또는 로그인 페이지 이동
    await page.waitForTimeout(1500)
    const isLoginModal = await page.locator('[class*="modal"], [role="dialog"]').count()
    const isLoginPage = page.url().includes('/login') || page.url().includes('kakao')
    expect(isLoginModal > 0 || isLoginPage, '비로그인 공감 → 로그인 유도 없음').toBe(true)
  })
})

test.describe('글쓰기 버튼', () => {
  test('비로그인 — FAB 글쓰기 클릭 → 로그인 유도', async ({ page }) => {
    // FAB은 /community/stories 또는 /community/humor 에서만 렌더링됨
    await page.goto('/community/stories')
    await page.waitForLoadState('domcontentloaded', { timeout: 10000 })
    await page.waitForTimeout(1500)

    const fab = page
      .locator('button, a')
      .filter({ hasText: /글쓰기|✏️/ })
      .first()
    if (await fab.count() === 0) return

    await fab.click()
    await page.waitForTimeout(1500)
    const redirectedToLogin =
      page.url().includes('/login') ||
      page.url().includes('kakao') ||
      (await page.locator('[class*="modal"], [role="dialog"]').count()) > 0
    expect(redirectedToLogin, '비로그인 글쓰기 → 로그인 유도 없음').toBe(true)
  })
})
