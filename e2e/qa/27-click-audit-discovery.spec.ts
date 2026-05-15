/**
 * BATCH B — 콘텐츠 디스커버리 전체 클릭 감사 (2026-05-15)
 * 검증: 일자리 / 매거진 / 인기글 / 통합검색
 * 대상: qa-ios-webkit (390×844) / qa-galaxy (412×915) / qa-audit-user-full (1440×900)
 *
 * 실행:
 *   npx playwright test e2e/qa/27-click-audit-discovery.spec.ts \
 *     --project=qa-ios-webkit --project=qa-galaxy --project=qa-audit-user-full --reporter=line
 */
import { test, expect, type Page, type TestInfo } from '@playwright/test'
import path from 'path'
import fs from 'fs'

const BASE = process.env.QA_AUDIT_URL ?? 'https://www.age-doesnt-matter.com'
const USER_AUTH = path.join(process.cwd(), 'e2e/.auth/user.json')

async function ss(page: Page, name: string, testInfo: TestInfo) {
  const device = testInfo.project.name
  const dir = path.join(process.cwd(), 'e2e/screenshots/audit', device)
  fs.mkdirSync(dir, { recursive: true })
  await page.screenshot({ path: path.join(dir, `27-${name}.png`), fullPage: false })
}

// user.json 유효성 검증 (RISK-1)
test.beforeAll(async ({ browser }) => {
  if (!fs.existsSync(USER_AUTH)) {
    throw new Error(`[FATAL] user.json 없음 — npx tsx e2e/export-kakao-cookies.ts 실행 필요`)
  }
  const ctx = await browser.newContext({ storageState: USER_AUTH })
  const page = await ctx.newPage()
  const res = await page.goto(`${BASE}/my`, { waitUntil: 'domcontentloaded' })
  const url = res?.url() ?? page.url()
  await ctx.close()
  if (url.includes('/login')) {
    throw new Error('[FATAL] user.json 만료 — npx tsx e2e/export-kakao-cookies.ts 재실행 필요')
  }
})

// 상태 초기화 (RISK-3)
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    sessionStorage.clear()
    localStorage.removeItem('una-recent-searches')
  })
})

// ══════════════════════════════════════════════════════════════════
// 1. 일자리 — 퀵태그 + 지역 필터 토글
// ══════════════════════════════════════════════════════════════════
test('일자리 — 퀵태그 토글 + URL params', async ({ page }, testInfo) => {
  await page.goto(`${BASE}/jobs`, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('[class*="JobCard"], article, [class*="job"]', { timeout: 15000 }).catch(() => null)
  await ss(page, '01-jobs-initial', testInfo)

  // 퀵태그 버튼 (나이무관, 오전, 시간제 등 6개)
  const quickTags = page.locator('button[class*="tag"], button[class*="Tag"], button[class*="chip"]').filter({ hasText: /나이무관|오전|시간제|경력무관|주5일|재택/ })
  const tagCount = await quickTags.count()
  console.log(`[INFO] 퀵태그 버튼: ${tagCount}개`)

  if (tagCount > 0) {
    const firstTag = quickTags.first()
    const tagText = (await firstTag.textContent())?.trim()
    await firstTag.click()
    await page.waitForTimeout(500)
    const url = page.url()
    const ok = url.includes('tags') || url.includes('tag')
    console.log(`${ok ? '✅' : '⚠️'} 퀵태그 "${tagText}" → URL: ${url}`)

    // 토글 해제
    await firstTag.click()
    await page.waitForTimeout(300)
  }

  // 필터 버튼 (FilterPanel 열기)
  const filterBtn = page.locator('button[aria-label*="필터"], button:has-text("필터"), button:has-text("지역")').first()
  if (await filterBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
    await filterBtn.click()
    await page.waitForTimeout(600)
    await ss(page, '01-jobs-filter-panel', testInfo)

    // 필터 패널/모달 닫기 (ESC)
    await page.keyboard.press('Escape')
    await page.waitForTimeout(400)
    console.log('✅ 필터 패널 열기 + ESC 닫기')
  } else {
    console.warn('[INFO] 필터 버튼 미감지')
  }
})

// ══════════════════════════════════════════════════════════════════
// 2. 일자리 — JobCard 클릭 → 상세
// ══════════════════════════════════════════════════════════════════
test('일자리 — JobCard → 상세 + 지원하기 버튼', async ({ page }, testInfo) => {
  await page.goto(`${BASE}/jobs`, { waitUntil: 'networkidle' })
  await page.waitForSelector('[class*="JobCard"] a, article a, [class*="job"] a', { timeout: 10000 }).catch(() => null)

  const card = page.locator('[class*="JobCard"] a, article a, [class*="job-item"] a').first()
  if (!await card.isVisible({ timeout: 3000 }).catch(() => false)) {
    console.warn('[SKIP] JobCard 없음')
    return
  }

  const href = await card.getAttribute('href') ?? ''
  console.log(`[INFO] JobCard href: ${href}`)
  expect(href).toMatch(/\/jobs\//)

  await card.click()
  await page.waitForLoadState('networkidle')
  await ss(page, '02-job-detail', testInfo)

  // 지원하기 버튼 (외부 링크 target=_blank)
  const applyBtn = page.locator('a[target="_blank"]:has-text("지원"), button:has-text("지원하기"), a:has-text("지원하기")').first()
  if (await applyBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    const box = await applyBtn.boundingBox()
    const isLink = (await applyBtn.tagName()) === 'A'
    const target = await applyBtn.getAttribute('target')
    console.log(`✅ 지원하기: ${isLink ? 'a' : 'button'} target="${target}" ${box?.width?.toFixed(0)}×${box?.height?.toFixed(0)}px`)
  } else {
    console.warn('[INFO] 지원하기 버튼 미감지')
  }

  // 뒤로가기
  await page.goBack()
  await page.waitForLoadState('domcontentloaded')
  console.log(`✅ 뒤로가기 → ${page.url()}`)
})

// ══════════════════════════════════════════════════════════════════
// 3. 일자리 — 검색 + 페이지네이션
// ══════════════════════════════════════════════════════════════════
test('일자리 — 검색 입력 + 결과', async ({ page }, testInfo) => {
  await page.goto(`${BASE}/jobs`, { waitUntil: 'networkidle' })

  const searchInput = page.locator('input[type="search"], input[placeholder*="검색"]').first()
  if (!await searchInput.isVisible({ timeout: 3000 }).catch(() => false)) {
    console.warn('[SKIP] 일자리 검색 input 없음')
    return
  }

  await searchInput.fill('요양')
  await page.keyboard.press('Enter')
  await page.waitForLoadState('networkidle')
  const url = page.url()
  console.log(`${url.includes('q=') || url.includes('요양') ? '✅' : '⚠️'} 일자리 검색 URL: ${url}`)
  await ss(page, '03-jobs-search', testInfo)
})

// ══════════════════════════════════════════════════════════════════
// 4. 매거진 — 카테고리 탭 + MagazineCard
// ══════════════════════════════════════════════════════════════════
test('매거진 — 카테고리 탭 필터 + MagazineCard 링크', async ({ page }, testInfo) => {
  await page.goto(`${BASE}/magazine`, { waitUntil: 'networkidle' })
  await page.waitForSelector('[class*="MagazineCard"], [class*="magazine-card"], article', { timeout: 10000 }).catch(() => null)
  await ss(page, '04-magazine-initial', testInfo)

  // 카테고리 탭 (최대 9개)
  const catTabs = page.locator('[role="tab"], [class*="category"] button, [class*="tab"] button').filter({ hasText: /건강|여행|요리|재테크|일자리|관계|취미|자기계발|시사/ })
  const tabCount = await catTabs.count()
  console.log(`[INFO] 매거진 카테고리 탭: ${tabCount}개`)

  if (tabCount > 0) {
    const firstTab = catTabs.first()
    const tabText = (await firstTab.textContent())?.trim()
    await firstTab.click()
    await page.waitForLoadState('networkidle')
    const url = page.url()
    console.log(`${url.includes('category') ? '✅' : '⚠️'} 카테고리 "${tabText}" URL: ${url}`)
  }

  // MagazineCard 첫 번째 클릭
  const card = page.locator('[class*="MagazineCard"] a, article a, [class*="magazine"] a').first()
  if (!await card.isVisible({ timeout: 3000 }).catch(() => false)) {
    console.warn('[SKIP] MagazineCard 없음')
    return
  }
  const href = await card.getAttribute('href') ?? ''
  console.log(`[INFO] MagazineCard href: ${href}`)
  expect(href).toMatch(/\/magazine\//)
})

// ══════════════════════════════════════════════════════════════════
// 5. 매거진 상세 — CUID redirect + SeriesNav
// ══════════════════════════════════════════════════════════════════
test('매거진 상세 — CUID redirect + 이미지 로드', async ({ page }, testInfo) => {
  await page.goto(`${BASE}/magazine`, { waitUntil: 'networkidle' })
  await page.waitForSelector('[class*="MagazineCard"] a, article a', { timeout: 10000 }).catch(() => null)

  const card = page.locator('[class*="MagazineCard"] a, article a').first()
  if (!await card.isVisible({ timeout: 3000 }).catch(() => false)) {
    console.warn('[SKIP] MagazineCard 없음')
    return
  }

  await card.click()
  await page.waitForLoadState('networkidle')

  // CUID → slug redirect (RISK-5)
  await page.waitForURL(url => !url.pathname.match(/\/cl[a-z0-9]{24}$/), { timeout: 5000 }).catch(() => null)
  const finalUrl = page.url()
  console.log(`[INFO] 매거진 상세 최종 URL: ${finalUrl}`)
  expect(finalUrl).toContain('/magazine/')
  await ss(page, '05-magazine-detail', testInfo)

  // 이미지 로드 확인 (proxyMagazineImages — /_next/image 경유)
  const imgs = page.locator('article img, [class*="content"] img, main img')
  const imgCount = await imgs.count()
  if (imgCount > 0) {
    const naturalW = await imgs.first().evaluate((el: HTMLImageElement) => el.naturalWidth).catch(() => 0)
    console.log(`${naturalW > 0 ? '✅' : '❌ [P1]'} 매거진 이미지 로드: naturalWidth=${naturalW}`)
  }

  // SeriesNav 이전/다음 편
  const seriesNav = page.locator('[class*="SeriesNav"], [class*="series-nav"], [aria-label*="시리즈"]')
  if (await seriesNav.isVisible({ timeout: 2000 }).catch(() => false)) {
    const prevLink = seriesNav.locator('a').first()
    const href = await prevLink.getAttribute('href')
    console.log(`✅ SeriesNav 존재 | 첫 링크: ${href}`)
  } else {
    console.log('[INFO] SeriesNav 없음 (단독 매거진)')
  }
})

// ══════════════════════════════════════════════════════════════════
// 6. 인기글 — 탭 전환 (뜨는이야기 / 명예의전당)
// ══════════════════════════════════════════════════════════════════
test('인기글 — 탭 전환 + PostCard boardBadge', async ({ page }, testInfo) => {
  await page.goto(`${BASE}/best`, { waitUntil: 'networkidle' })
  await page.waitForSelector('[class*="PostCard"], article', { timeout: 10000 }).catch(() => null)
  await ss(page, '06-best-initial', testInfo)

  // 명예의전당 탭
  const fameTab = page.locator('a[href*="tab=fame"], button:has-text("명예의전당")').first()
  if (await fameTab.isVisible({ timeout: 3000 }).catch(() => false)) {
    await fameTab.click()
    await page.waitForLoadState('networkidle')
    const url = page.url()
    console.log(`${url.includes('tab=fame') ? '✅' : '⚠️'} 명예의전당 URL: ${url}`)
    await ss(page, '06-best-fame', testInfo)

    // 빈 상태 확인
    const empty = page.locator('text=뜨는이야기, text=게시글이 없, text=아직 없')
    if (await empty.first().isVisible({ timeout: 2000 }).catch(() => false)) {
      console.log('[INFO] 명예의전당 빈 상태 표시')
    }

    // 뜨는이야기 탭 복귀
    const hotTab = page.locator('a[href*="tab=hot"], a[href="/best"], button:has-text("뜨는이야기")').first()
    if (await hotTab.isVisible({ timeout: 2000 }).catch(() => false)) {
      await hotTab.click()
      await page.waitForLoadState('networkidle')
    }
  } else {
    console.warn('[INFO] 명예의전당 탭 미감지')
  }

  // PostCard boardBadge 포함 확인 (from=best param)
  const cards = page.locator('[class*="PostCard"] a, article a').filter({ hasNotText: '댓글' })
  if (await cards.first().isVisible({ timeout: 3000 }).catch(() => false)) {
    const href = await cards.first().getAttribute('href') ?? ''
    console.log(`${href.includes('from=best') ? '✅' : '⚠️'} /best PostCard from=best: ${href}`)
  }
})

// ══════════════════════════════════════════════════════════════════
// 7. 통합검색 — 검색 입력 + 최근검색어
// ══════════════════════════════════════════════════════════════════
test('통합검색 — 검색 입력 + 최근검색어 저장/삭제', async ({ page }, testInfo) => {
  await page.goto(`${BASE}/search`, { waitUntil: 'domcontentloaded' })
  await ss(page, '07-search-initial', testInfo)

  const input = page.locator('input[type="search"], input[aria-label*="검색"]').first()
  if (!await input.isVisible({ timeout: 3000 }).catch(() => false)) {
    console.warn('[SKIP] 검색 input 없음')
    return
  }

  // 1자 → 검색 안 됨 (2자 미만 무시)
  await input.fill('테')
  await page.keyboard.press('Enter')
  await page.waitForTimeout(500)
  const url1 = page.url()
  const noSearch = url1.includes('/search') && !url1.includes('q=')
  console.log(`${noSearch ? '✅' : '⚠️'} 1자 검색 무시: ${url1}`)

  // 2자+ 검색
  await input.fill('건강')
  await page.keyboard.press('Enter')
  await page.waitForLoadState('networkidle')
  const url2 = page.url()
  console.log(`${url2.includes('q=') ? '✅' : '❌ [P1]'} 2자 검색 URL: ${url2}`)
  await ss(page, '07-search-results', testInfo)

  // 뒤로가기 → 초기 검색 페이지
  await page.goto(`${BASE}/search`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(500)

  // 최근검색어 표시 확인
  const recentSection = page.locator('section:has-text("최근 검색어"), h3:has-text("최근 검색어")')
  if (await recentSection.first().isVisible({ timeout: 2000 }).catch(() => false)) {
    console.log('✅ 최근 검색어 섹션 표시')

    // ✕ 삭제 버튼
    const deleteBtn = page.locator('button[aria-label*="삭제"], button:has-text("✕")').first()
    if (await deleteBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
      await deleteBtn.click()
      await page.waitForTimeout(300)
      console.log('✅ 최근검색어 개별 삭제 완료')
    }
  } else {
    console.log('[INFO] 최근 검색어 없음 (첫 검색 또는 localStorage 비워짐)')
  }
  await ss(page, '07-search-recent', testInfo)
})

// ══════════════════════════════════════════════════════════════════
// 8. 통합검색 — 카테고리 퀵버튼 + 인기검색어
// ══════════════════════════════════════════════════════════════════
test('통합검색 — 카테고리 퀵버튼 + 인기/추천 검색어', async ({ page }) => {
  await page.goto(`${BASE}/search`, { waitUntil: 'domcontentloaded' })

  // 카테고리 퀵버튼 6개
  const catBtns = page.locator('section:has-text("카테고리") button, h3:has-text("카테고리") ~ div button')
  const catCount = await catBtns.count()
  console.log(`[INFO] 카테고리 퀵버튼: ${catCount}개`)

  if (catCount > 0) {
    const firstBtn = catBtns.first()
    const box = await firstBtn.boundingBox()
    const ok = (box?.height ?? 0) >= 52
    const text = (await firstBtn.textContent())?.trim()
    console.log(`${ok ? '✅' : '❌ [P2]'} 카테고리 퀵버튼 "${text}": h=${box?.height?.toFixed(0)}px`)
  }

  // 인기/추천 검색어 목록
  const popularSection = page.locator('section:has-text("인기 검색어"), section:has-text("추천 검색어"), ol')
  if (await popularSection.first().isVisible({ timeout: 2000 }).catch(() => false)) {
    const firstKw = page.locator('ol li button, ol li a').first()
    if (await firstKw.isVisible({ timeout: 1000 }).catch(() => false)) {
      const box = await firstKw.boundingBox()
      const ok = (box?.height ?? 0) >= 52
      const text = (await firstKw.textContent())?.trim()
      console.log(`${ok ? '✅' : '❌ [P2]'} 인기검색어 버튼 "${text}": h=${box?.height?.toFixed(0)}px`)
    }
  }
})

// ══════════════════════════════════════════════════════════════════
// 9. 통합검색 — 탭 전환 (전체/일자리/게시글/매거진)
// ══════════════════════════════════════════════════════════════════
test('통합검색 — 탭 전환 + 결과 카드 URL', async ({ page }, testInfo) => {
  await page.goto(`${BASE}/search?q=건강`, { waitUntil: 'networkidle' })
  await ss(page, '08-search-tabs', testInfo)

  const tabs = [
    { label: '일자리', param: 'tab=jobs' },
    { label: '게시글', param: 'tab=posts' },
    { label: '매거진', param: 'tab=magazine' },
  ]

  for (const { label, param } of tabs) {
    const tab = page.locator(`a[href*="${param}"], button:has-text("${label}")`).first()
    if (await tab.isVisible({ timeout: 2000 }).catch(() => false)) {
      await tab.click()
      await page.waitForLoadState('networkidle')
      const url = page.url()
      console.log(`${url.includes(param) ? '✅' : '⚠️'} "${label}" 탭 URL: ${url}`)
    } else {
      console.warn(`[INFO] "${label}" 탭 미감지`)
    }
  }

  // 전체 탭 복귀
  const allTab = page.locator('a[href*="q=건강"]:not([href*="tab="]), button:has-text("전체")').first()
  if (await allTab.isVisible({ timeout: 2000 }).catch(() => false)) {
    await allTab.click()
    await page.waitForLoadState('networkidle')
  }

  // 검색 결과 카드 클릭 테스트
  const resultCard = page.locator('[class*="PostCard"] a, [class*="JobCard"] a, [class*="MagazineCard"] a, [class*="result"] a').first()
  if (await resultCard.isVisible({ timeout: 3000 }).catch(() => false)) {
    const href = await resultCard.getAttribute('href') ?? ''
    const ok = /\/(community|jobs|magazine)\//.test(href)
    console.log(`${ok ? '✅' : '❌ [P1]'} 검색 결과 카드 href: ${href}`)
  } else {
    console.warn('[INFO] 검색 결과 카드 없음 ("건강" 검색 결과가 현재 없을 수 있음)')
  }
  await ss(page, '08-search-result-cards', testInfo)
})

// ══════════════════════════════════════════════════════════════════
// 10. 통합검색 — iOS Safari localStorage 실패 안전성 (RISK-10)
// ══════════════════════════════════════════════════════════════════
test('통합검색 — localStorage 사용 가능 여부 확인', async ({ page }) => {
  await page.goto(`${BASE}/search`, { waitUntil: 'domcontentloaded' })

  // WebKit에서 localStorage 사용 가능한지 확인 (RISK-10)
  const canUseLS = await page.evaluate(() => {
    try {
      localStorage.setItem('__test__', '1')
      localStorage.removeItem('__test__')
      return true
    } catch {
      return false
    }
  })
  console.log(`${canUseLS ? '✅' : '⚠️ [iOS 개인정보 모드]'} localStorage 사용 가능: ${canUseLS}`)

  if (!canUseLS) {
    console.warn('[WARN] localStorage 불가 — 검색기록 저장 안 됨 (SearchForm catch 처리 확인)')
  }
})
