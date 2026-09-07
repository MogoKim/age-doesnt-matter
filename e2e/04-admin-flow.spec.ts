import { test, expect } from './fixtures/first-party-header'

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
  // ⚠️ `/community/write` 는 여기 없다. 비회원도 폼을 열고 글을 쓸 수 있는 것이
  //    현재 정책이고(`src/middleware.ts` PROTECTED_PATHS 는 `/my` 뿐),
  //    막아야 하는 쪽은 진입이 아니라 저장이다. 경계 검증은 아래 별도 테스트에서 한다.
  const protectedUserRoutes = [
    '/my',
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

  /**
   * 글쓰기의 인증 경계 — 진입은 열려 있고 저장이 막힌다.
   *
   * 비회원을 입구에서 쫓아내면 "쓰다가 로그인" 동선이 사라진다. 그래서 폼은 열어 두고,
   * 등록을 누르는 순간 로그인을 요청한다(`PostWriteForm` — createPost 를 호출하지 않고
   * 로컬 임시저장 후 안내를 띄운다). 서버 쪽 `createPost` 도 첫 줄에서 세션을 확인한다.
   *
   * 이 테스트는 글을 만들지 않는다 — 클라이언트가 저장 호출 전에 멈추는 지점까지만 본다.
   */
  test('비회원 → /community/write 진입은 허용, 등록 시 로그인 경계 유지', async ({ page }) => {
    await page.goto('/community/write?board=stories')

    // 1) 로그인으로 튕기지 않는다
    await expect(page).toHaveURL(/\/community\/write/)
    const titleInput = page.getByPlaceholder('제목을 입력해 주세요')
    await expect(titleInput).toBeVisible({ timeout: 15000 })

    // 2) 비회원도 실제로 작성할 수 있다
    await titleInput.fill('E2E 인증 경계 확인용 제목')
    const editor = page.locator('[contenteditable="true"]').first()
    await expect(editor).toBeVisible({ timeout: 20000 })
    await editor.click()
    await editor.pressSequentially('비회원 등록 경계를 확인하는 본문입니다 저장되지 않습니다', { delay: 20 })

    const submit = page.getByRole('button', { name: '등록하기', exact: true })
    await expect(submit).toBeEnabled({ timeout: 10000 })

    // 3) 등록을 누르면 로그인을 요구하고, 글은 만들어지지 않는다
    await submit.click()
    await expect(page.getByRole('dialog', { name: '로그인하고 등록' })).toBeVisible({ timeout: 10000 })
    await expect(page, '글이 생성되면 상세로 이동했을 것이다').toHaveURL(/\/community\/write/)
  })
})
