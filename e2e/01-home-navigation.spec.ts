import { test, expect } from '@playwright/test'

test.describe('시나리오 1: 비회원 홈 접근 + 주요 네비게이션', () => {
  test('홈페이지 정상 로딩', async ({ page }) => {
    await page.goto('/')
    await expect(page).toHaveTitle(/우리 나이가 어때서/)
    // 주요 섹션 렌더링 확인
    await expect(page.locator('main')).toBeVisible()
  })

  test('비회원 → 커뮤니티 목록 접근 가능', async ({ page }) => {
    await page.goto('/community/stories')
    await expect(page.locator('main')).toBeVisible()
  })

  test('비회원 → 글쓰기 페이지 접근 시 로그인 유도', async ({ page }) => {
    await page.goto('/community/write')
    // 로그인 필요 메시지 또는 리다이렉트 확인
    const content = await page.textContent('body')
    const isRedirected = page.url().includes('/api/auth')
    const hasLoginPrompt = content?.includes('로그인') ?? false
    expect(isRedirected || hasLoginPrompt).toBeTruthy()
  })

  test('비회원 → 마이페이지 접근 시 로그인 유도', async ({ page }) => {
    await page.goto('/my')
    const content = await page.textContent('body')
    const isRedirected = page.url().includes('/api/auth')
    const hasLoginPrompt = content?.includes('로그인') ?? false
    expect(isRedirected || hasLoginPrompt).toBeTruthy()
  })

  test('일자리 목록 페이지 접근', async ({ page }) => {
    await page.goto('/jobs')
    await expect(page.locator('main')).toBeVisible()
  })

  test('매거진 목록 페이지 접근', async ({ page }) => {
    await page.goto('/magazine')
    await expect(page.locator('main')).toBeVisible()
  })

  test('소개 페이지 접근', async ({ page }) => {
    await page.goto('/about')
    await expect(page.locator('main')).toBeVisible()
  })

  test('검색 페이지 접근', async ({ page }) => {
    await page.goto('/search')
    await expect(page.locator('main')).toBeVisible()
  })
})
