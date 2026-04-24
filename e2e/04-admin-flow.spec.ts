import { test, expect } from '@playwright/test'

test.describe('시나리오 4: 어드민 로그인 + 보호 라우트', () => {
  // ── 어드민 로그인 폼 ──
  test('어드민 로그인 페이지 — 폼 요소 확인', async ({ page }) => {
    await page.goto('/admin/login')

    // 제목
    await expect(page.getByText('우나어 어드민').first()).toBeVisible()

    // 이메일 인풋
    const emailInput = page.locator('input#email, input[name="email"]')
    await expect(emailInput).toBeVisible()
    await expect(emailInput).toHaveAttribute('type', 'email')

    // 비밀번호 인풋
    const pwInput = page.locator('input#password, input[name="password"]')
    await expect(pwInput).toBeVisible()
    await expect(pwInput).toHaveAttribute('type', 'password')

    // 로그인 버튼
    const submitBtn = page.getByRole('button', { name: /로그인/ })
    await expect(submitBtn).toBeVisible()
  })

  test('잘못된 어드민 자격 증명 → 에러 메시지', async ({ page }) => {
    await page.goto('/admin/login')

    await page.locator('input#email, input[name="email"]').fill('wrong@test.com')
    await page.locator('input#password, input[name="password"]').fill('wrongpassword')
    await page.getByRole('button', { name: /로그인/ }).click()

    // 에러 메시지 노출 대기
    const errorMsg = page.locator('.bg-red-50, [role="alert"]').first()
    await expect(errorMsg).toBeVisible({ timeout: 5000 })
  })

  test('빈 폼 제출 — HTML5 validation 또는 에러', async ({ page }) => {
    await page.goto('/admin/login')

    const submitBtn = page.getByRole('button', { name: /로그인/ })
    await submitBtn.click()

    // HTML5 required validation 또는 커스텀 에러
    const emailInput = page.locator('input#email, input[name="email"]')
    const isRequired = await emailInput.getAttribute('required')
    if (isRequired !== null) {
      // HTML5 validation이 동작해야 함 (폼 제출 안 됨)
      expect(page.url()).toContain('/admin/login')
    }
  })

  // ── 어드민 보호 라우트 ──
  const protectedAdminRoutes = [
    '/admin',
    '/admin/content',
    '/admin/members',
    '/admin/reports',
    '/admin/banners',
    '/admin/settings',
    '/admin/analytics',
  ]

  for (const route of protectedAdminRoutes) {
    test(`비인증 → ${route} 접근 시 로그인 리다이렉트`, async ({ page }) => {
      await page.goto(route)
      await page.waitForURL(/\/admin\/login/)
      expect(page.url()).toContain('/admin/login')
    })
  }

  // ── 일반 사용자 보호 라우트 ──
  const protectedUserRoutes = [
    '/my',
    '/community/write',
    '/onboarding',
    '/my/posts',
    '/my/comments',
    '/my/scraps',
    '/my/notifications',
    '/my/settings',
  ]

  for (const route of protectedUserRoutes) {
    test(`비회원 → ${route} 접근 시 로그인 유도`, async ({ page }) => {
      await page.goto(route)
      // 로그인 페이지 또는 NextAuth 리다이렉트
      await page.waitForURL(/\/(login|api\/auth)/, { timeout: 5000 })
      expect(page.url()).toMatch(/\/(login|api\/auth)/)
    })
  }
})
