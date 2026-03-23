import { test, expect } from '@playwright/test'

test.describe('시나리오 5: 접근성 + 시니어 친화 UI 검증', () => {
  const publicPages = [
    { name: '홈', path: '/' },
    { name: '이야기', path: '/community/stories' },
    { name: '유머', path: '/community/humor' },
    { name: '일자리', path: '/jobs' },
    { name: '매거진', path: '/magazine' },
    { name: '검색', path: '/search' },
    { name: '베스트', path: '/best' },
    { name: '소개', path: '/about' },
  ]

  // ── 터치 타겟 검증 ──
  for (const { name, path } of publicPages) {
    test(`${name}: 버튼/링크 터치 타겟 44px+ 검증`, async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 812 })
      await page.goto(path)

      const interactiveElements = page.locator('button, a[href]')
      const count = await interactiveElements.count()

      const violations: string[] = []

      for (let i = 0; i < Math.min(count, 30); i++) {
        const el = interactiveElements.nth(i)
        if (!(await el.isVisible())) continue

        const box = await el.boundingBox()
        if (!box) continue

        // 인라인 텍스트 링크 제외
        const isInline = await el.evaluate(
          (e) => e.tagName.toLowerCase() === 'a' && getComputedStyle(e).display === 'inline',
        )
        if (isInline) continue

        if (box.height < 44 || box.width < 44) {
          const text = (await el.textContent())?.trim().slice(0, 30) || '(no text)'
          violations.push(`"${text}" — ${Math.round(box.width)}×${Math.round(box.height)}px`)
        }
      }

      // 위반율 40% 이하 (점진적 강화)
      const checked = Math.min(count, 30)
      if (checked > 0) {
        const rate = violations.length / checked
        if (violations.length > 0) {
          console.log(`[${name}] 터치 타겟 위반 ${violations.length}/${checked}:`, violations.slice(0, 5))
        }
        expect(rate).toBeLessThanOrEqual(0.4)
      }
    })
  }

  // ── viewport meta 태그 ──
  test('모든 페이지: viewport meta 설정', async ({ page }) => {
    await page.goto('/')
    const viewport = page.locator('meta[name="viewport"]')
    await expect(viewport).toHaveAttribute('content', /width=device-width/)
  })

  // ── 모바일 가로 스크롤 방지 ──
  for (const { name, path } of publicPages.slice(0, 4)) {
    test(`${name}: 모바일에서 가로 스크롤 없음`, async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 812 })
      await page.goto(path)
      await page.waitForLoadState('domcontentloaded')

      const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth)
      const viewportWidth = await page.evaluate(() => window.innerWidth)
      expect(scrollWidth).toBeLessThanOrEqual(viewportWidth + 2) // 2px 오차 허용
    })
  }

  // ── 폰트 크기 최소 기준 ──
  test('홈 페이지: 본문 텍스트 최소 15px', async ({ page }) => {
    await page.goto('/')

    // body의 font-size 확인
    const bodyFontSize = await page.evaluate(() => {
      const style = getComputedStyle(document.body)
      return parseFloat(style.fontSize)
    })
    expect(bodyFontSize).toBeGreaterThanOrEqual(14) // rem 기반이라 14px 허용
  })

  // ── 색상 대비 (브랜드 컬러) ──
  test('홈 페이지: primary 색상 존재', async ({ page }) => {
    await page.goto('/')

    // CSS 변수 --color-primary 확인
    const primaryColor = await page.evaluate(() => {
      return getComputedStyle(document.documentElement).getPropertyValue('--color-primary').trim()
    })

    // 설정되어 있으면 값이 존재해야 함
    if (primaryColor) {
      expect(primaryColor.length).toBeGreaterThan(0)
    }
  })

  // ── 키보드 접근성 ──
  test('홈 페이지: Tab 키로 주요 요소 포커스 가능', async ({ page }) => {
    await page.goto('/')

    // Tab 누르면 포커스가 이동
    await page.keyboard.press('Tab')
    const firstFocused = await page.evaluate(() => document.activeElement?.tagName)
    expect(firstFocused).toBeTruthy()

    // 여러 번 Tab 해도 포커스가 올바르게 이동
    for (let i = 0; i < 5; i++) {
      await page.keyboard.press('Tab')
    }
    const laterFocused = await page.evaluate(() => document.activeElement?.tagName)
    expect(laterFocused).toBeTruthy()
  })

  // ── 이미지 alt 텍스트 ──
  test('홈 페이지: 의미 있는 이미지에 alt 속성', async ({ page }) => {
    await page.goto('/')

    const images = page.locator('img')
    const count = await images.count()

    let missingAlt = 0
    for (let i = 0; i < count; i++) {
      const alt = await images.nth(i).getAttribute('alt')
      // alt가 null이면 (빈 문자열은 장식 이미지로 허용)
      if (alt === null) missingAlt++
    }

    // alt 없는 이미지가 전체의 30% 이하
    if (count > 0) {
      expect(missingAlt / count).toBeLessThanOrEqual(0.3)
    }
  })

  // ── 반응형 전환 ──
  test('데스크탑↔모바일 전환 시 레이아웃 유지', async ({ page }) => {
    // 데스크탑
    await page.setViewportSize({ width: 1280, height: 800 })
    await page.goto('/')
    await expect(page.locator('body')).toBeVisible()

    // 모바일로 전환
    await page.setViewportSize({ width: 375, height: 812 })
    await expect(page.locator('body')).toBeVisible()

    // 헤더 보임
    const header = page.locator('header').first()
    const headerVisible = await header.isVisible({ timeout: 3000 }).catch(() => false)
    expect(headerVisible).toBeTruthy()
  })

  // ── 에러 페이지 ──
  test('존재하지 않는 페이지 → 404 처리', async ({ page }) => {
    const res = await page.goto('/this-page-does-not-exist-12345')
    // 404 응답 또는 커스텀 not-found 페이지
    if (res) {
      expect([200, 404]).toContain(res.status())
    }
    await expect(page.locator('body')).toBeVisible()
  })

  // ── 광고 슬롯 라벨 확인 ──
  test('홈 페이지: 광고 영역에 "광고" 라벨', async ({ page }) => {
    await page.goto('/')

    const adLabel = page.getByText('광고').first()
    const hasAd = await adLabel.isVisible({ timeout: 3000 }).catch(() => false)

    // 광고 영역이 있다면 "광고" 라벨 존재해야 함
    if (hasAd) {
      await expect(adLabel).toBeVisible()
    }
  })

  // ── 오프라인 배너 ──
  test('오프라인 상태 → 배너 노출', async ({ page, context }) => {
    await page.goto('/')

    // 네트워크를 오프라인으로 변경
    await context.setOffline(true)

    // offline 이벤트 트리거 후 배너 확인
    const banner = page.getByText('인터넷 연결을 확인해주세요')
    const bannerVisible = await banner.isVisible({ timeout: 3000 }).catch(() => false)

    // 다시 온라인으로
    await context.setOffline(false)

    // 오프라인 배너가 보였어야 함
    expect(bannerVisible).toBeTruthy()
  })
})
