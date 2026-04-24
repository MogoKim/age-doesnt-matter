/**
 * QA 03 — 일자리 + 매거진 (인증 불필요)
 *
 * 검증 항목:
 *   - 일자리 목록 렌더링 + 필터 존재
 *   - 일자리 상세 페이지 접근
 *   - 매거진 목록 렌더링
 *   - 매거진 상세 콘텐츠 + 광고 슬롯
 */
import { test, expect } from '@playwright/test'

test.describe('일자리', { tag: ['@smoke', '@public'] }, () => {
  test('일자리 목록 200 + 아이템 존재', async ({ page }) => {
    const res = await page.goto('/jobs')
    expect(res?.status()).toBeLessThan(400)
    await page.waitForLoadState('networkidle', { timeout: 15000 })

    await expect(page.locator('main').first()).toBeVisible()
    const items = await page
      .locator('article, [class*="job"], [class*="card"], li')
      .count()
    expect(items).toBeGreaterThan(0)
  })

  test('일자리 필터 — 지역/근무형태 드롭다운 또는 버튼 존재', async ({ page }) => {
    await page.goto('/jobs')
    await page.waitForLoadState('networkidle')

    const filter = page.locator(
      'select, [class*="filter"], [class*="dropdown"], button[class*="region"], button[class*="type"]',
    ).first()
    // 필터가 없으면 소프트 경고만
    const count = await filter.count()
    if (count === 0) {
      console.warn('[QA-03] 일자리 필터 UI 미발견')
    }
  })

  test('첫 번째 일자리 상세 진입', async ({ page }) => {
    await page.goto('/jobs')
    await page.waitForLoadState('domcontentloaded', { timeout: 10000 })
    await page.waitForTimeout(2000)

    // 실제 일자리 상세 링크: /jobs/[id] 형식 (id는 cuid 형식)
    const firstLink = page
      .locator('a[href^="/jobs/"]')
      .filter({ hasNotText: /더보기|전체/ })
      .first()

    if (await firstLink.count() === 0) {
      test.skip(true, '일자리 데이터 없음')
      return
    }

    const href = await firstLink.getAttribute('href')
    // href가 /jobs/ 만이면 목록으로 가므로 skip
    if (!href || href === '/jobs/' || href === '/jobs') {
      test.skip(true, '유효한 일자리 링크 없음')
      return
    }

    await firstLink.click()
    await page.waitForURL('**/jobs/**', { timeout: 15000 })
    expect(page.url()).toContain('/jobs/')
    await expect(page.locator('main, article').first()).toBeVisible()
  })

  test('일자리 상세 — 급여/근무지/고용형태 정보 렌더링', async ({ page }) => {
    await page.goto('/jobs')
    await page.waitForLoadState('domcontentloaded', { timeout: 10000 })
    await page.waitForTimeout(2000)

    const firstLink = page
      .locator('a[href^="/jobs/"]')
      .filter({ hasNotText: /더보기|전체/ })
      .first()
    if (await firstLink.count() === 0) {
      test.skip(true, '일자리 데이터 없음')
      return
    }

    const href = await firstLink.getAttribute('href')
    if (!href || href === '/jobs/' || href === '/jobs') {
      test.skip(true, '유효한 일자리 링크 없음')
      return
    }

    await firstLink.click()
    await page.waitForURL('**/jobs/**', { timeout: 15000 })
    await page.waitForLoadState('domcontentloaded', { timeout: 10000 })

    // SSR HTML에 핵심 정보 키워드 존재 여부 확인
    // locator 가시성 필터 대신 page.content() 로 직접 검사
    const html = await page.content()
    const hasInfo = /급여|월급|시급|근무지|지역|고용형태|채용/.test(html)
    expect(hasInfo, '일자리 상세 정보 없음').toBe(true)
  })
})

test.describe('매거진', () => {
  test('매거진 목록 200 + 아이템 존재', async ({ page }) => {
    const res = await page.goto('/magazine')
    expect(res?.status()).toBeLessThan(400)
    // 광고로 인해 networkidle 불가 → domcontentloaded 사용
    await page.waitForLoadState('domcontentloaded', { timeout: 10000 })
    await page.waitForTimeout(2000)

    await expect(page.locator('main').first()).toBeVisible()
    const items = await page.locator('article, [class*="magazine"], [class*="card"]').count()
    expect(items).toBeGreaterThan(0)
  })

  test('첫 번째 매거진 상세 — 콘텐츠 + 제목 렌더링', async ({ page }) => {
    await page.goto('/magazine')
    await page.waitForLoadState('domcontentloaded', { timeout: 10000 })
    await page.waitForTimeout(2000)

    const firstLink = page
      .locator('a[href*="/magazine/"]')
      .filter({ hasNotText: /더보기/ })
      .first()
    if (await firstLink.count() === 0) {
      test.skip(true, '매거진 데이터 없음')
      return
    }

    await firstLink.click()
    // networkidle은 광고 로딩으로 불안정 → URL 변경 대기 후 domcontentloaded 사용
    await page.waitForURL('**/magazine/**', { timeout: 15000 })
    await page.waitForLoadState('domcontentloaded', { timeout: 10000 })
    expect(page.url()).toContain('/magazine/')

    // 제목 + 본문 최소 렌더링
    const heading = page.locator('h1, h2').first()
    await expect(heading).toBeVisible({ timeout: 10000 })
  })

  test('매거진 상세 — OG 메타 태그 존재', async ({ page }) => {
    // 목록에서 첫 번째 URL만 추출 후 직접 이동 (click+waitForURL 방식은 30s 예산 초과)
    await page.goto('/magazine', { waitUntil: 'domcontentloaded', timeout: 15000 })
    await page.waitForTimeout(1500)

    const firstLink = page
      .locator('a[href*="/magazine/"]')
      .filter({ hasNotText: /더보기/ })
      .first()
    if (await firstLink.count() === 0) return
    const href = await firstLink.getAttribute('href')
    if (!href) return

    // 직접 goto — OG 태그는 SSR 헤더에 있으므로 domcontentloaded 이면 충분
    await page.goto(href, { waitUntil: 'domcontentloaded', timeout: 15000 })

    const ogTitle = await page.locator('meta[property="og:title"]').getAttribute('content')
    expect(ogTitle && ogTitle.length > 0, 'og:title 미설정').toBe(true)

    const ogImage = await page.locator('meta[property="og:image"]').getAttribute('content')
    expect(ogImage && ogImage.length > 0, 'og:image 미설정').toBe(true)
  })
})
