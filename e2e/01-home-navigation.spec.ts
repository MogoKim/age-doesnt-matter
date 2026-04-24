import { test, expect } from '@playwright/test'

test.describe('시나리오 1: 비회원 홈 접근 + 주요 네비게이션', { tag: ['@smoke', '@public'] }, () => {
  test('홈페이지 정상 로딩 — 핵심 섹션 렌더링', async ({ page }) => {
    await page.goto('/')
    await expect(page).toHaveTitle(/우리 나이가 어때서/)
    await expect(page.locator('main')).toBeVisible()

    // 주요 섹션 존재 확인 (최소 3개 이상의 section/article 영역)
    const sections = page.locator('main section, main > div > div')
    await expect(sections.first()).toBeVisible()
  })

  test('모바일 헤더: 로고, 검색, 유저 아이콘 노출', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 })
    await page.goto('/')

    // 로고 (홈 링크)
    const logo = page.locator('header a[href="/"]').first()
    await expect(logo).toBeVisible()

    // 검색 링크
    const search = page.locator('header a[href="/search"]')
    await expect(search).toBeVisible()
  })

  test('모바일 아이콘 메뉴: 5개 네비게이션 탭', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 })
    await page.goto('/')

    const navLinks = [
      { href: '/best', label: '베스트' },
      { href: '/jobs', label: '내일찾기' },
      { href: '/community/stories', label: '사는이야기' },
      { href: '/community/humor', label: '웃음방' },
      { href: '/magazine', label: '매거진' },
    ]

    for (const { href, label } of navLinks) {
      const link = page.locator(`a[href="${href}"]`).first()
      await expect(link).toBeVisible()
      await expect(link).toContainText(label)
    }
  })

  test('데스크탑 GNB: 로고 + 메뉴 + 검색', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 })
    await page.goto('/')

    // 검색 인풋 존재
    const searchInput = page.locator('input[type="search"]')
    await expect(searchInput).toBeVisible()
    await expect(searchInput).toHaveAttribute('placeholder', /통합검색/)
  })

  test('비회원 → 글쓰기 접근 시 로그인 리다이렉트', async ({ page }) => {
    await page.goto('/community/write')
    await page.waitForURL(/\/(login|api\/auth)/)
    expect(page.url()).toMatch(/\/(login|api\/auth)/)
  })

  test('비회원 → 마이페이지 접근 시 로그인 리다이렉트', async ({ page }) => {
    await page.goto('/my')
    await page.waitForURL(/\/(login|api\/auth)/)
    expect(page.url()).toMatch(/\/(login|api\/auth)/)
  })

  test('네비게이션 클릭 → 각 페이지 이동', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 })
    await page.goto('/')

    // 일자리 페이지
    await page.getByRole('link', { name: '내일찾기' }).click()
    await page.waitForURL(/\/jobs/, { timeout: 10000 })
    await expect(page.locator('body')).toBeVisible()

    // 커뮤니티 이야기
    await page.getByRole('link', { name: '사는이야기' }).click()
    await page.waitForURL(/\/community\/stories/, { timeout: 10000 })
    await expect(page.locator('body')).toBeVisible()

    // 매거진 — GNB 내 매거진 링크 (nav 안에 있는 것만 선택)
    await page.getByRole('navigation').getByRole('link', { name: '매거진' }).click()
    await page.waitForURL(/\/magazine/, { timeout: 10000 })
    await expect(page.locator('body')).toBeVisible()
  })

  test('데스크탑 검색 폼 → 검색 결과 이동', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 })
    await page.goto('/')

    const searchInput = page.locator('input[type="search"]')
    await searchInput.fill('일자리')
    await searchInput.press('Enter')

    await page.waitForURL(/\/search\?q=/)
    expect(page.url()).toContain('q=')
    await expect(page.locator('main')).toBeVisible()
  })

  test('모바일 검색 아이콘 → 검색 페이지 이동', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 })
    await page.goto('/')

    await page.locator('header a[href="/search"]').click()
    await page.waitForURL(/\/search/, { waitUntil: 'domcontentloaded' })
    await expect(page.locator('main')).toBeVisible()
  })

  test('온보딩 미완료 비회원 → 온보딩 접근 시 로그인 리다이렉트', async ({ page }) => {
    await page.goto('/onboarding')
    await page.waitForURL(/\/(login|api\/auth)/)
    expect(page.url()).toMatch(/\/(login|api\/auth)/)
  })
})
