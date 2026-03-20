import { test, expect } from '@playwright/test'

test.describe('시나리오 5: 어드민 로그인 → 대시보드', () => {
  test('어드민 로그인 페이지 접근', async ({ page }) => {
    await page.goto('/admin/login')
    await expect(page.locator('main, form')).toBeVisible()
  })

  test('비인증 상태에서 어드민 패널 접근 → 로그인 리다이렉트', async ({ page }) => {
    await page.goto('/admin')
    // 로그인 페이지로 리다이렉트
    await expect(page).toHaveURL(/\/admin\/login/)
  })

  test('비인증 상태에서 어드민 콘텐츠 → 로그인 리다이렉트', async ({ page }) => {
    await page.goto('/admin/content')
    await expect(page).toHaveURL(/\/admin\/login/)
  })

  test('비인증 상태에서 어드민 회원관리 → 로그인 리다이렉트', async ({ page }) => {
    await page.goto('/admin/members')
    await expect(page).toHaveURL(/\/admin\/login/)
  })

  test('비인증 상태에서 어드민 신고관리 → 로그인 리다이렉트', async ({ page }) => {
    await page.goto('/admin/reports')
    await expect(page).toHaveURL(/\/admin\/login/)
  })

  test('비인증 상태에서 어드민 배너관리 → 로그인 리다이렉트', async ({ page }) => {
    await page.goto('/admin/banners')
    await expect(page).toHaveURL(/\/admin\/login/)
  })

  test('비인증 상태에서 어드민 설정 → 로그인 리다이렉트', async ({ page }) => {
    await page.goto('/admin/settings')
    await expect(page).toHaveURL(/\/admin\/login/)
  })

  test('비인증 상태에서 어드민 분석 → 로그인 리다이렉트', async ({ page }) => {
    await page.goto('/admin/analytics')
    await expect(page).toHaveURL(/\/admin\/login/)
  })
})
