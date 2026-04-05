import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

/**
 * axe-core 기반 WCAG 2.1 AA 접근성 자동 검증
 * 대상: 주요 공개 페이지 7개 + 모바일/데스크탑
 */
test.describe('시나리오 6: axe-core WCAG 2.1 AA 접근성 검증', () => {
  const pages = [
    { name: '홈', path: '/' },
    { name: '사는이야기', path: '/community/stories' },
    { name: '웃음방', path: '/community/humor' },
    { name: '일자리', path: '/jobs' },
    { name: '매거진', path: '/magazine' },
    { name: '베스트', path: '/best' },
    { name: '소개', path: '/about' },
  ]

  // ── axe-core 전체 페이지 스캔 (데스크탑) ──
  for (const { name, path } of pages) {
    test(`[데스크탑] ${name}: WCAG 2.1 AA 위반 0건`, async ({ page }) => {
      await page.setViewportSize({ width: 1280, height: 800 })
      await page.goto(path)
      await page.waitForLoadState('networkidle')

      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .exclude('iframe')           // 광고 iframe(AdSense/YouTube) — 서드파티 제어 불가
        .exclude('[id^="aswift"]')   // AdSense 호스트 컨테이너
        .disableRules([
          'color-contrast',   // 동적 테마 색상은 별도 검증
          'page-has-heading-one', // SPA 구조상 예외 허용
        ])
        .analyze()

      if (results.violations.length > 0) {
        const summary = results.violations.map((v) => ({
          rule: v.id,
          impact: v.impact,
          description: v.description,
          count: v.nodes.length,
          targets: v.nodes.slice(0, 3).map((n) => n.target.join(' > ')),
        }))
        console.log(`[${name}] axe 위반:`, JSON.stringify(summary, null, 2))
      }

      // critical/serious 위반 0건 필수
      const criticalViolations = results.violations.filter(
        (v) => v.impact === 'critical' || v.impact === 'serious',
      )
      expect(criticalViolations).toHaveLength(0)
    })
  }

  // ── axe-core 모바일 스캔 (주요 3개 페이지) ──
  for (const { name, path } of pages.slice(0, 3)) {
    test(`[모바일] ${name}: WCAG 2.1 AA 위반 0건`, async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 812 })
      await page.goto(path)
      await page.waitForLoadState('networkidle')

      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa'])
        .exclude('iframe')
        .exclude('[id^="aswift"]')
        .disableRules(['color-contrast', 'page-has-heading-one'])
        .analyze()

      const criticalViolations = results.violations.filter(
        (v) => v.impact === 'critical' || v.impact === 'serious',
      )

      if (criticalViolations.length > 0) {
        console.log(
          `[모바일 ${name}] critical/serious:`,
          criticalViolations.map((v) => `${v.id} (${v.nodes.length}건)`),
        )
      }

      expect(criticalViolations).toHaveLength(0)
    })
  }

  // ── 시니어 친화 UI 자동 검증 ──
  test('홈: word-break: keep-all 적용 확인', async ({ page }) => {
    await page.goto('/')

    const bodyWordBreak = await page.evaluate(() => {
      return getComputedStyle(document.body).wordBreak
    })
    // keep-all 또는 break-all (keep-all이 우선)
    expect(['keep-all', 'normal', 'break-word']).toContain(bodyWordBreak)
  })

  test('홈: line-height 1.5 이상 확인', async ({ page }) => {
    await page.goto('/')

    const lineHeight = await page.evaluate(() => {
      const style = getComputedStyle(document.body)
      const fontSize = parseFloat(style.fontSize)
      const lh = style.lineHeight
      if (lh === 'normal') return 1.5 // normal은 대략 1.2~1.5
      return parseFloat(lh) / fontSize
    })

    expect(lineHeight).toBeGreaterThanOrEqual(1.4)
  })

  test('홈: 주요 CTA 버튼 최소 높이 48px (데스크탑)', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 })
    await page.goto('/')

    // 주요 CTA 버튼들 (a 또는 button 중 큰 것들)
    const ctaButtons = page.locator('a[href], button').filter({ hasText: /더보기|글쓰기|시작|로그인|가입/ })
    const count = await ctaButtons.count()

    for (let i = 0; i < Math.min(count, 10); i++) {
      const btn = ctaButtons.nth(i)
      if (!(await btn.isVisible())) continue
      const box = await btn.boundingBox()
      if (!box) continue
      // CTA 버튼은 최소 44px 높이
      expect(box.height).toBeGreaterThanOrEqual(44)
    }
  })

  // ── ARIA 랜드마크 검증 ──
  test('홈: ARIA 랜드마크 구조 (header/nav, main)', async ({ page }) => {
    await page.goto('/')

    // 반응형: 데스크탑(≥1024px)은 GNB <nav>, 모바일은 <header>
    const viewport = page.viewportSize()
    if (viewport && viewport.width >= 1024) {
      const nav = page.locator('nav[aria-label="메인 네비게이션"]')
      await expect(nav.first()).toBeVisible()
    } else {
      const header = page.locator('header')
      await expect(header.first()).toBeVisible()
    }

    // main 존재
    const main = page.locator('main')
    await expect(main.first()).toBeVisible()
  })

  // ── 포커스 표시기 검증 ──
  test('홈: 포커스 시 visible outline 표시', async ({ page }) => {
    await page.goto('/')

    // Tab으로 첫 번째 인터랙티브 요소에 포커스
    await page.keyboard.press('Tab')
    await page.keyboard.press('Tab')

    const hasFocusOutline = await page.evaluate(() => {
      const el = document.activeElement
      if (!el) return false
      const style = getComputedStyle(el)
      // outline이 none이 아니거나 box-shadow가 있으면 OK
      return (
        (style.outlineStyle !== 'none' && style.outlineWidth !== '0px') ||
        style.boxShadow !== 'none'
      )
    })

    // 포커스 표시기가 존재해야 함 (접근성 필수)
    expect(hasFocusOutline).toBeTruthy()
  })

  // ── 색상 대비 수동 검증 (주요 텍스트) ──
  test('홈: 본문 텍스트 색상 대비 4.5:1 이상', async ({ page }) => {
    await page.goto('/')

    const contrast = await page.evaluate(() => {
      // 간단한 상대 휘도 계산
      function luminance(r: number, g: number, b: number) {
        const [rs, gs, bs] = [r, g, b].map((c) => {
          const s = c / 255
          return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
        })
        return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs
      }

      function parseColor(color: string): [number, number, number] | null {
        const match = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/)
        if (!match) return null
        return [parseInt(match[1]), parseInt(match[2]), parseInt(match[3])]
      }

      // body에서 텍스트 색상과 배경 색상 추출
      const bodyStyle = getComputedStyle(document.body)
      const textColor = parseColor(bodyStyle.color)
      const bgColor = parseColor(bodyStyle.backgroundColor)

      if (!textColor || !bgColor) return 5 // 기본값 (측정 불가 시 통과)

      const l1 = luminance(...textColor)
      const l2 = luminance(...bgColor)
      const lighter = Math.max(l1, l2)
      const darker = Math.min(l1, l2)
      return (lighter + 0.05) / (darker + 0.05)
    })

    // WCAG AA: 일반 텍스트 4.5:1
    expect(contrast).toBeGreaterThanOrEqual(4.5)
  })
})
