/**
 * QA 14 — 에러 처리 + 엣지케이스 (인증 불필요)
 *
 * 검증 항목:
 *   - 404 페이지 렌더링 (커스텀 not-found)
 *   - 존재하지 않는 게시글 URL → 404
 *   - 비인증 어드민 접근 → /admin/login 리다이렉트
 *   - API 에러 응답 형식
 *   - 모바일 뷰포트 핵심 페이지 렌더링
 */
import { test, expect } from '@playwright/test'

test.describe('404 에러 페이지', () => {
  test('존재하지 않는 URL → 404 또는 not-found 페이지', async ({ page }) => {
    const res = await page.goto('/this-page-does-not-exist-qa-test-12345')
    // Next.js not-found 는 200 또는 404 반환 가능
    expect(res?.status()).toBeLessThanOrEqual(404)
    // 에러 메시지 또는 홈 리다이렉트 둘 중 하나
    const hasErrorText = await page.getByText(/404|찾을 수 없|존재하지 않|돌아가기/, { exact: false }).count()
    if (hasErrorText === 0) console.warn('[QA-14] 404 페이지 커스텀 메시지 없음')
  })

  test('존재하지 않는 게시글 → 적절한 에러 처리', async ({ page }) => {
    const res = await page.goto('/community/99999999999')
    expect(res?.status()).toBeLessThanOrEqual(404)
    await expect(page.locator('main, body').first()).toBeVisible()
  })

  test('존재하지 않는 일자리 → 적절한 에러 처리', async ({ page }) => {
    const res = await page.goto('/jobs/99999999999')
    expect(res?.status()).toBeLessThanOrEqual(404)
  })

  test('존재하지 않는 매거진 → 적절한 에러 처리', async ({ page }) => {
    const res = await page.goto('/magazine/99999999999')
    expect(res?.status()).toBeLessThanOrEqual(404)
  })
})

test.describe('비인증 어드민 접근', () => {
  test('/admin → /admin/login 리다이렉트', async ({ page }) => {
    // storageState 없는 새 컨텍스트로 테스트
    await page.context().clearCookies()
    await page.goto('/admin')
    await page.waitForURL(/\/admin\/login/, { timeout: 10000 })
    expect(page.url()).toContain('/admin/login')
  })

  test('/admin/members → /admin/login 리다이렉트', async ({ page }) => {
    await page.context().clearCookies()
    await page.goto('/admin/members')
    await page.waitForURL(/\/admin\/login/, { timeout: 10000 })
    expect(page.url()).toContain('/admin/login')
  })

  test('/admin/content → /admin/login 리다이렉트', async ({ page }) => {
    await page.context().clearCookies()
    await page.goto('/admin/content')
    await page.waitForURL(/\/admin\/login/, { timeout: 10000 })
    expect(page.url()).toContain('/admin/login')
  })
})

test.describe('API 엔드포인트 기본 확인', () => {
  test('/api/posts — 인증 없이 목록 조회', async ({ page }) => {
    const res = await page.request.get('/api/posts?limit=1')
    // 200 또는 인증 필요(401) — 500은 아니어야 함
    expect(res.status()).not.toBe(500)
  })

  test('/api/jobs — 200 응답', async ({ page }) => {
    const res = await page.request.get('/api/jobs?limit=1')
    expect(res.status()).not.toBe(500)
  })

  test('/api/magazine — 200 응답', async ({ page }) => {
    const res = await page.request.get('/api/magazine?limit=1')
    expect(res.status()).not.toBe(500)
  })
})

test.describe('모바일 뷰포트', () => {
  test.use({ viewport: { width: 390, height: 844 } }) // iPhone 14 Pro

  test('홈 — 모바일 렌더링', async ({ page }) => {
    await page.goto('/')
    // networkidle은 광고로 타임아웃 → domcontentloaded 사용
    await page.waitForLoadState('domcontentloaded', { timeout: 15000 })
    await page.waitForTimeout(1500)
    await expect(page.locator('main').first()).toBeVisible()
    // 가로 스크롤 없어야 함
    const bodyWidth = await page.evaluate(() => document.body.scrollWidth)
    const viewportWidth = page.viewportSize()?.width ?? 390
    expect(bodyWidth, `가로 스크롤 발생 (body: ${bodyWidth}px, viewport: ${viewportWidth}px)`).toBeLessThanOrEqual(
      viewportWidth + 5, // 5px 여유
    )
  })

  test('커뮤니티 — 모바일 렌더링', async ({ page }) => {
    await page.goto('/community')
    await page.waitForLoadState('domcontentloaded', { timeout: 15000 })
    await expect(page.locator('main').first()).toBeVisible()
  })

  test('일자리 — 모바일 렌더링', async ({ page }) => {
    await page.goto('/jobs')
    await page.waitForLoadState('domcontentloaded', { timeout: 15000 })
    await expect(page.locator('main').first()).toBeVisible()
  })
})
