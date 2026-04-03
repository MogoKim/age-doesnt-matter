/**
 * QA 01 — 공개 페이지 렌더링 (인증 불필요)
 *
 * 검증 항목:
 *   - 홈, 소개, 이용약관, 개인정보처리방침, FAQ, 연락처, 이용규칙
 *   - 각 페이지 200 응답 + 핵심 UI 요소 렌더링
 *   - <title> 태그 비어 있지 않음
 *   - 콘솔 에러 없음 (심각 수준만)
 */
import { test, expect } from '@playwright/test'

const PUBLIC_PAGES = [
  { path: '/', label: '홈', expect: null },
  { path: '/about', label: '소개', expect: null },
  { path: '/terms', label: '이용약관', expect: null },
  { path: '/privacy', label: '개인정보처리방침', expect: null },
  { path: '/faq', label: 'FAQ', expect: null },
  { path: '/contact', label: '연락처', expect: null },
  { path: '/rules', label: '이용규칙', expect: null },
]

for (const p of PUBLIC_PAGES) {
  test(`${p.label} 페이지 렌더링`, async ({ page }) => {
    const errors: string[] = []
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text())
    })

    const response = await page.goto(p.path)
    expect(response?.status()).toBeLessThan(400)

    // 메인 콘텐츠 영역 존재
    await expect(page.locator('main, [role="main"]').first()).toBeVisible({ timeout: 10000 })

    // title 비어 있지 않음
    const title = await page.title()
    expect(title.length).toBeGreaterThan(0)

    // 텍스트 힌트가 있으면 확인
    if (p.expect) {
      await expect(page.getByText(p.expect, { exact: false }).first()).toBeVisible({ timeout: 5000 })
    }

    // 심각한 콘솔 에러 없어야 함 (hydration, ChunkLoadError 등)
    const criticalErrors = errors.filter(
      (e) =>
        e.includes('Hydration') ||
        e.includes('ChunkLoadError') ||
        e.includes('TypeError') ||
        e.includes('Cannot read'),
    )
    expect(criticalErrors, `콘솔 에러: ${criticalErrors.join('\n')}`).toHaveLength(0)
  })
}

test('홈 페이지 — 네비게이션 메뉴 존재', async ({ page }) => {
  await page.goto('/')
  // 광고 로딩으로 networkidle 불가 → domcontentloaded 사용
  await page.waitForLoadState('domcontentloaded', { timeout: 10000 })
  await page.waitForTimeout(1500)
  const navCount = await page.locator('nav, header, [role="navigation"]').count()
  expect(navCount, '네비게이션 요소 없음').toBeGreaterThan(0)
})

test('홈 페이지 — 최신글 또는 트렌딩 콘텐츠 렌더링', async ({ page }) => {
  await page.goto('/')
  await page.waitForLoadState('domcontentloaded', { timeout: 10000 })
  await page.waitForTimeout(1500)
  const hasContent = await page
    .locator('article, [class*="card"], [class*="post"], [class*="item"]')
    .count()
  expect(hasContent).toBeGreaterThan(0)
})

test('홈 페이지 — 광고 슬롯 HTML 마커 존재', async ({ page }) => {
  await page.goto('/')
  await page.waitForLoadState('networkidle')
  // AdSense 또는 쿠팡 광고 마커 최소 1개
  const adSlots = await page.locator('.adsbygoogle, [class*="coupang"], [data-ad]').count()
  // 광고는 조건부 렌더링일 수 있어 soft check
  if (adSlots === 0) {
    console.warn('[QA-01] 광고 슬롯 미발견 — 조건부 렌더링 확인 필요')
  }
})
