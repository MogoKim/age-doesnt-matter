/**
 * BATCH A — 홈 + 커뮤니티 전체 클릭 감사 (2026-05-15)
 * 검증: 홈 / 게시판 / 게시글상세 / 글쓰기
 * 대상: qa-ios-webkit (390×844) / qa-galaxy (412×915) / qa-audit-user-full (1440×900)
 *
 * 실행:
 *   npx playwright test e2e/qa/26-click-audit-community.spec.ts \
 *     --project=qa-ios-webkit --project=qa-galaxy --project=qa-audit-user-full --reporter=line
 */
import { test, expect, type Page, type TestInfo } from '@playwright/test'
import path from 'path'
import fs from 'fs'

const BASE = process.env.QA_AUDIT_URL ?? 'https://www.age-doesnt-matter.com'
const USER_AUTH = path.join(process.cwd(), 'e2e/.auth/user.json')

// ── 헬퍼 ──────────────────────────────────────────────────────────
async function ss(page: Page, name: string, testInfo: TestInfo) {
  const device = testInfo.project.name
  const dir = path.join(process.cwd(), 'e2e/screenshots/audit', device)
  fs.mkdirSync(dir, { recursive: true })
  await page.screenshot({ path: path.join(dir, `26-${name}.png`), fullPage: false })
}

async function dismissDraft(page: Page) {
  const newBtn = page.locator('button', { hasText: '새로 작성하기' })
  if (await newBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
    await newBtn.click()
    await page.waitForTimeout(400)
  }
}

async function getFirstPostCard(page: Page) {
  await page.waitForSelector('[class*="PostCard"] a, article a', { timeout: 10000 }).catch(() => null)
  return page.locator('[class*="PostCard"] a, article a').filter({ hasNotText: '댓글' }).first()
}

// ── user.json 유효성 검증 (RISK-1) ───────────────────────────────
test.beforeAll(async ({ browser }) => {
  if (!fs.existsSync(USER_AUTH)) {
    throw new Error(`[FATAL] user.json 없음: ${USER_AUTH}\n→ npx tsx e2e/export-kakao-cookies.ts 실행 필요`)
  }
  const ctx = await browser.newContext({ storageState: USER_AUTH })
  const page = await ctx.newPage()
  const res = await page.goto(`${BASE}/my`, { waitUntil: 'domcontentloaded' })
  const finalUrl = res?.url() ?? page.url()
  await ctx.close()
  if (finalUrl.includes('/login')) {
    throw new Error('[FATAL] user.json 만료 — npx tsx e2e/export-kakao-cookies.ts 재실행 필요')
  }
})

// ── 상태 초기화 (RISK-3) ──────────────────────────────────────────
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    sessionStorage.clear()
    localStorage.removeItem('una-recent-searches')
    Object.keys(localStorage)
      .filter(k => k.startsWith('draft-'))
      .forEach(k => localStorage.removeItem(k))
  })
})

// ══════════════════════════════════════════════════════════════════
// 1. 홈 — HeroSlider dot + 화살표
// ══════════════════════════════════════════════════════════════════
test('홈 — HeroSlider dot + 화살표', async ({ page, viewport }, testInfo) => {
  await page.goto(BASE, { waitUntil: 'networkidle' })
  await page.waitForSelector(
    '[class*="HeroSlider"], [class*="hero"], [aria-label*="슬라이더"], [class*="slider"]',
    { timeout: 10000 }
  ).catch(() => null)
  await ss(page, '01-home-hero', testInfo)

  const isMobile = (viewport?.width ?? 1440) < 768

  // 화살표(이전/다음)는 제외하고 dot 인디케이터만 선택
  const dots = page.locator(
    'button[aria-label*="슬라이드"]:not([aria-label*="이전"]):not([aria-label*="다음"]), [class*="dot"] button, [class*="indicator"] button'
  )
  const dotCount = await dots.count()
  if (dotCount >= 2) {
    const secondDot = dots.nth(1)
    const isVisible = await secondDot.isVisible({ timeout: 2000 }).catch(() => false)
    if (!isVisible) {
      console.warn('[SKIP] dot(2) 화면에서 숨겨져 있음 (모바일에서 화살표 버튼 — CSS hidden)')
      return
    }
    await secondDot.click({ force: true })
    await page.waitForTimeout(600)
    await ss(page, '01-home-hero-dot2', testInfo)
    console.log(`✅ HeroSlider dot(2) 클릭 | dots=${dotCount}개`)
  } else {
    console.warn(`[SKIP] HeroSlider dot ${dotCount}개 — 슬라이드 데이터 확인 필요`)
  }

  // 데스크탑 화살표 크기 (P2 — w-10 h-10 = 40px, 기준 48px)
  if (!isMobile) {
    const nextBtn = page.locator('button[aria-label*="다음"], button[aria-label*="next"]').first()
    if (await nextBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      const box = await nextBtn.boundingBox()
      const ok = (box?.width ?? 0) >= 48 && (box?.height ?? 0) >= 48
      console.log(`${ok ? '✅' : '❌ [P2]'} HeroSlider 화살표: ${box?.width?.toFixed(0)}×${box?.height?.toFixed(0)}px (기준 48px)`)
      await nextBtn.click({ force: true })
      await page.waitForTimeout(400)
    }
  }
})

// ══════════════════════════════════════════════════════════════════
// 2. 홈 — TrendingSection + PersonalGreeting
// ══════════════════════════════════════════════════════════════════
test('홈 — TrendingSection + PersonalGreeting 크기', async ({ page, viewport }, testInfo) => {
  await page.goto(BASE, { waitUntil: 'networkidle' })
  await page.waitForSelector('text=지금 뜨는 이야기', { timeout: 15000 }).catch(() => null)
  await ss(page, '02-home-personal', testInfo)

  // PersonalGreeting "둘러보기" (P2 — h-[48px], 모바일 52px 기준)
  const browseLink = page.locator('a[href="/community/stories"]').first()
  if (await browseLink.isVisible({ timeout: 3000 }).catch(() => false)) {
    const box = await browseLink.boundingBox()
    const isMobile = (viewport?.width ?? 1440) < 768
    const minPx = isMobile ? 52 : 48
    const ok = (box?.height ?? 0) >= minPx
    console.log(`${ok ? '✅' : '❌ [P2]'} PersonalGreeting 둘러보기: h=${box?.height?.toFixed(0)}px (기준 ${minPx}px)`)
  }

  // TrendingSection 존재 확인 (RISK-2 — posts 없으면 섹션 null)
  const trending = page.locator('section').filter({ hasText: '지금 뜨는 이야기' }).first()
  if (!await trending.isVisible({ timeout: 5000 }).catch(() => false)) {
    console.warn('[SKIP] TrendingSection 없음 — hot posts 0개일 수 있음')
    return
  }

  // "더보기" 링크 크기
  const moreLink = page.locator('a[href="/best"]').first()
  if (await moreLink.isVisible({ timeout: 2000 }).catch(() => false)) {
    const box = await moreLink.boundingBox()
    const ok = (box?.width ?? 0) >= 52 && (box?.height ?? 0) >= 52
    console.log(`${ok ? '✅' : '❌ [P2]'} TrendingSection 더보기: ${box?.width?.toFixed(0)}×${box?.height?.toFixed(0)}px`)
  }

  // PostCard href 패턴
  const postCard = page.locator('[class*="PostCard"] a, article a').filter({ hasNotText: '댓글' }).first()
  if (await postCard.isVisible({ timeout: 3000 }).catch(() => false)) {
    const href = await postCard.getAttribute('href') ?? ''
    const ok = /\/(community|magazine|jobs|best)\//.test(href)
    console.log(`${ok ? '✅' : '❌ [P1]'} TrendingSection PostCard href: ${href}`)
  }
})

// ══════════════════════════════════════════════════════════════════
// 3. 홈 — GNB 링크 + 검색/마이 버튼 크기
// ══════════════════════════════════════════════════════════════════
test('홈 — GNB 링크 + 검색/마이 버튼 크기', async ({ page, viewport }, testInfo) => {
  await page.goto(BASE, { waitUntil: 'domcontentloaded' })
  await ss(page, '03-home-gnb', testInfo)

  const isMobile = (viewport?.width ?? 1440) < 768

  if (!isMobile) {
    const gnbLinks = [
      { label: '베스트', href: '/best' },
      { label: '사는이야기', href: '/community/stories' },
      { label: '2막준비', href: '/community/life2' },
      { label: '웃음방', href: '/community/humor' },
      { label: '매거진', href: '/magazine' },
      { label: '내일찾기', href: '/jobs' },
    ]
    for (const { label, href } of gnbLinks) {
      // GNB는 header/nav 내 위치가 구현마다 다를 수 있어 전역 a[href]로 탐색
      const link = page.locator(`a[href="${href}"]`).first()
      const visible = await link.isVisible({ timeout: 1000 }).catch(() => false)
      console.log(`${visible ? '✅' : '⚠️'} GNB "${label}" → ${href}`)
    }

    // 검색 버튼 크기 (P2 — w-[44px] h-[44px], 기준 48px)
    const searchBtn = page.locator('header button[type="submit"], header button[aria-label*="검색"]').first()
    if (await searchBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      const box = await searchBtn.boundingBox()
      const ok = (box?.width ?? 0) >= 48 && (box?.height ?? 0) >= 48
      console.log(`${ok ? '✅' : '❌ [P2]'} GNB 검색 버튼: ${box?.width?.toFixed(0)}×${box?.height?.toFixed(0)}px (기준 48px)`)
    }

    // /my 링크 크기 (P2 — w-10 h-10 = 40px, 기준 48px)
    const myLink = page.locator('header a[href="/my"]').first()
    if (await myLink.isVisible({ timeout: 2000 }).catch(() => false)) {
      const box = await myLink.boundingBox()
      const ok = (box?.width ?? 0) >= 48 && (box?.height ?? 0) >= 48
      console.log(`${ok ? '✅' : '❌ [P2]'} GNB /my 링크: ${box?.width?.toFixed(0)}×${box?.height?.toFixed(0)}px (기준 48px)`)
    }
  } else {
    // 모바일 IconMenu 검색 아이콘
    const searchIcon = page.locator('a[href="/search"], button[aria-label*="검색"]').first()
    if (await searchIcon.isVisible({ timeout: 2000 }).catch(() => false)) {
      const box = await searchIcon.boundingBox()
      const ok = (box?.width ?? 0) >= 52 && (box?.height ?? 0) >= 52
      console.log(`${ok ? '✅' : '❌ [P2]'} IconMenu 검색: ${box?.width?.toFixed(0)}×${box?.height?.toFixed(0)}px`)
    }
  }
})

// ══════════════════════════════════════════════════════════════════
// 4. 홈 — TopPromoBanner 닫기 + sessionStorage 유지
// ══════════════════════════════════════════════════════════════════
test('홈 — TopPromoBanner 닫기 + 새로고침 유지', async ({ page }, testInfo) => {
  await page.goto(BASE, { waitUntil: 'domcontentloaded' })
  await ss(page, '04-banner-before', testInfo)

  const banner = page.locator('[role="banner"][aria-label="프로모션 배너"]')
  if (!await banner.isVisible({ timeout: 3000 }).catch(() => false)) {
    console.warn('[SKIP] TopPromoBanner 없음 (로그인 상태 guest 배너 미표시이거나 현재 미설정)')
    return
  }

  const closeBtn = banner.locator('button[aria-label="배너 닫기"]')
  const box = await closeBtn.boundingBox()
  const ok = (box?.width ?? 0) >= 52 && (box?.height ?? 0) >= 52
  console.log(`${ok ? '✅' : '❌ [P2]'} 배너 닫기 버튼: ${box?.width?.toFixed(0)}×${box?.height?.toFixed(0)}px`)

  await closeBtn.click()
  await expect(banner).not.toBeVisible({ timeout: 2000 })

  const stored = await page.evaluate(() =>
    Object.keys(sessionStorage).filter(k => k.startsWith('top-promo-'))
  )
  expect(stored.length).toBeGreaterThan(0)
  console.log(`✅ 배너 닫힘 + sessionStorage: ${stored.join(', ')}`)
  await ss(page, '04-banner-after', testInfo)
  // 주의: addInitScript가 reload 시 sessionStorage.clear()를 재실행하므로
  // reload 후 숨김 유지 검증은 실기기 수동 테스트로 보완
})

// ══════════════════════════════════════════════════════════════════
// 5. 홈 — FAB 글쓰기 버튼 (로그인)
// ══════════════════════════════════════════════════════════════════
test('홈 — FAB 글쓰기 존재 + 크기', async ({ page }, testInfo) => {
  await page.goto(`${BASE}/community/stories`, { waitUntil: 'domcontentloaded' })
  await ss(page, '05-fab', testInfo)

  const fab = page.locator(
    'a[href*="/community/write"], button[aria-label*="글쓰기"], [aria-label*="글쓰기"]'
  ).first()
  if (!await fab.isVisible({ timeout: 5000 }).catch(() => false)) {
    console.warn('[SKIP] FAB 없음 — stories 보드 로그인 상태 확인 필요')
    return
  }
  const box = await fab.boundingBox()
  const ok = (box?.width ?? 0) >= 52 && (box?.height ?? 0) >= 52
  console.log(`${ok ? '✅' : '❌ [P2]'} FAB 글쓰기: ${box?.width?.toFixed(0)}×${box?.height?.toFixed(0)}px`)
  const href = await fab.getAttribute('href')
  console.log(`[INFO] FAB href: ${href}`)
})

// ══════════════════════════════════════════════════════════════════
// 6. 비로그인 — FAB → LoginPromptModal 또는 /login redirect (RISK-6)
// ══════════════════════════════════════════════════════════════════
test('비로그인 — FAB → 로그인 유도', async ({ browser }) => {
  const ctx = await browser.newContext()
  const page = await ctx.newPage()
  await page.addInitScript(() => { sessionStorage.clear() })
  await page.goto(`${BASE}/community/stories`, { waitUntil: 'domcontentloaded' })

  const fab = page.locator(
    'a[href*="/community/write"], button[aria-label*="글쓰기"]'
  ).first()
  if (!await fab.isVisible({ timeout: 5000 }).catch(() => false)) {
    console.warn('[SKIP] FAB 없음 (비로그인)')
    await ctx.close()
    return
  }

  await fab.click({ force: true })
  await page.waitForTimeout(1000)

  const modal = page.locator('[role="dialog"]')
  const url = page.url()

  if (await modal.isVisible({ timeout: 1500 }).catch(() => false)) {
    console.log('✅ 비로그인 FAB → LoginPromptModal 표시')
    const kakaoBtn = modal.locator('button').first()
    const box = await kakaoBtn.boundingBox()
    console.log(`[INFO] LoginPromptModal 버튼: h=${box?.height?.toFixed(0)}px`)
  } else if (url.includes('/login')) {
    console.log('✅ 비로그인 FAB → /login redirect')
  } else {
    console.warn(`[INFO] FAB 클릭 후 URL: ${url}`)
  }
  await ctx.close()
})

// ══════════════════════════════════════════════════════════════════
// 7. 게시판 — 카테고리 필터 + 정렬 버튼 크기 (RISK-2)
// ══════════════════════════════════════════════════════════════════
test('게시판 — 카테고리 필터 + 정렬 버튼', async ({ page, viewport }, testInfo) => {
  await page.goto(`${BASE}/community/stories`, { waitUntil: 'networkidle' })
  await page.waitForSelector('[class*="PostCard"], article', { timeout: 10000 }).catch(() => null)
  await ss(page, '06-board-stories', testInfo)

  // 카테고리 필터 (categories.length > 1일 때만 표시)
  const catBtns = page.locator('[class*="category"] button, [aria-label*="카테고리"] button').filter({ hasText: /^[가-힣]/ })
  const catCount = await catBtns.count()
  if (catCount > 1) {
    const catText = (await catBtns.nth(1).textContent())?.trim() ?? ''
    await catBtns.nth(1).click()
    await page.waitForLoadState('networkidle')
    const url = page.url()
    console.log(`${url.includes('category') ? '✅' : '⚠️'} 카테고리 "${catText}" 필터 URL: ${url}`)
    // 전체 복귀
    await catBtns.first().click()
    await page.waitForLoadState('networkidle')
  } else {
    console.warn(`[INFO] 카테고리 버튼 ${catCount}개 (1개 이하면 필터 미표시)`)
  }

  // 정렬 버튼 크기 (SortToggle P2 — lg:min-h-[44px])
  const sortBtns = page.locator('button:has-text("공감순"), button:has-text("최신순")')
  for (let i = 0; i < await sortBtns.count(); i++) {
    const box = await sortBtns.nth(i).boundingBox()
    const isDesktop = (viewport?.width ?? 1440) >= 1024
    const minPx = isDesktop ? 48 : 52
    const ok = (box?.height ?? 0) >= minPx
    const text = (await sortBtns.nth(i).textContent())?.trim()
    console.log(`${ok ? '✅' : '❌ [P2]'} 정렬 "${text}": h=${box?.height?.toFixed(0)}px (기준 ${minPx}px)`)
  }

  // 공감순 정렬 클릭
  const likeSort = page.locator('button:has-text("공감순")').first()
  if (await likeSort.isVisible({ timeout: 2000 }).catch(() => false)) {
    await likeSort.click()
    await page.waitForLoadState('networkidle')
    const url = page.url()
    console.log(`${url.includes('sort=likes') || url.includes('sort') ? '✅' : '⚠️'} 공감순 URL: ${url}`)
  }
})

// ══════════════════════════════════════════════════════════════════
// 8. 게시판 — PostCard 클릭 → 상세 이동 (RISK-5 slug/CUID)
// ══════════════════════════════════════════════════════════════════
test('게시판 — PostCard → 상세 이동 + slug redirect', async ({ page }, testInfo) => {
  await page.goto(`${BASE}/community/stories`, { waitUntil: 'networkidle' })
  const card = await getFirstPostCard(page)

  if (!await card.isVisible({ timeout: 3000 }).catch(() => false)) {
    console.warn('[SKIP] PostCard 없음')
    return
  }

  const href = await card.getAttribute('href') ?? ''
  console.log(`[INFO] PostCard href: ${href}`)
  expect(href).toMatch(/\/community\/stories\//)

  await card.click()
  await page.waitForLoadState('domcontentloaded')

  // CUID → slug redirect 대기 (RISK-5)
  await page.waitForURL(url => !url.pathname.match(/\/cl[a-z0-9]{24}$/), { timeout: 5000 }).catch(() => null)
  console.log(`[INFO] 상세 최종 URL: ${page.url()}`)
  expect(page.url()).toContain('/community/stories/')
  await ss(page, '07-post-detail', testInfo)
})

// ══════════════════════════════════════════════════════════════════
// 9. 게시글 상세 — 공감 + 스크랩 버튼 동작
// ══════════════════════════════════════════════════════════════════
test('게시글 상세 — 공감 + 스크랩 버튼', async ({ page }, testInfo) => {
  await page.goto(`${BASE}/community/stories`, { waitUntil: 'networkidle' })
  const card = await getFirstPostCard(page)
  if (!await card.isVisible({ timeout: 3000 }).catch(() => false)) {
    console.warn('[SKIP] PostCard 없음')
    return
  }
  await card.click()
  await page.waitForLoadState('networkidle')
  await ss(page, '08-post-actions', testInfo)

  // 공감 버튼
  const likeBtn = page.locator('button[aria-label*="공감"], button:has-text("공감")').first()
  if (await likeBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    const before = await likeBtn.textContent()
    await likeBtn.click({ force: true })
    await page.waitForTimeout(700)
    const after = await likeBtn.textContent()
    console.log(`✅ 공감: "${before?.trim()}" → "${after?.trim()}"`)
    // 되돌리기 (낙관적 업데이트 토글)
    await likeBtn.click({ force: true })
    await page.waitForTimeout(300)
  } else {
    console.warn('[INFO] 공감 버튼 미감지 — selector 확인 필요')
  }

  // 스크랩 버튼
  const scrapBtn = page.locator('button[aria-label*="스크랩"], button:has-text("스크랩")').first()
  if (await scrapBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
    await scrapBtn.click({ force: true })
    await page.waitForTimeout(600)
    console.log('✅ 스크랩 클릭 → 되돌리기')
    await scrapBtn.click({ force: true })
    await page.waitForTimeout(300)
  }
})

// ══════════════════════════════════════════════════════════════════
// 10. 게시글 상세 — 공유 → 링크복사 토스트
// ══════════════════════════════════════════════════════════════════
test('게시글 상세 — 공유 → 링크복사', async ({ page }, testInfo) => {
  await page.goto(`${BASE}/community/stories`, { waitUntil: 'networkidle' })
  const card = await getFirstPostCard(page)
  if (!await card.isVisible({ timeout: 3000 }).catch(() => false)) {
    console.warn('[SKIP] PostCard 없음')
    return
  }
  await card.click()
  await page.waitForLoadState('networkidle')

  const shareBtn = page.locator('button[aria-label*="공유"], button:has-text("공유")').first()
  if (!await shareBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    console.warn('[SKIP] 공유 버튼 없음')
    return
  }
  await shareBtn.click()
  await page.waitForTimeout(500)
  await ss(page, '09-share-menu', testInfo)

  const copyBtn = page.locator('button:has-text("링크 복사"), button[aria-label*="링크"], button[aria-label*="복사"]').first()
  if (await copyBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
    await copyBtn.click({ force: true })
    await page.waitForTimeout(400)
    const toast = page.locator('[class*="toast"], [class*="Toast"], [role="status"]').first()
    const toastText = await toast.textContent().catch(() => '')
    console.log(`✅ 링크복사 완료 (토스트: "${toastText?.trim() || '미감지'}")`)
  } else {
    console.warn('[INFO] 링크복사 버튼 미감지')
  }
})

// ══════════════════════════════════════════════════════════════════
// 11. 게시글 상세 — from=best 뒤로가기 href 검증 (RISK-5)
// ══════════════════════════════════════════════════════════════════
test('게시글 상세 — from=best 뒤로가기 href', async ({ page }, testInfo) => {
  await page.goto(`${BASE}/best`, { waitUntil: 'networkidle' })
  await page.waitForSelector('[class*="PostCard"] a, article a', { timeout: 10000 }).catch(() => null)

  const card = page.locator('[class*="PostCard"] a, article a').filter({ hasNotText: '댓글' }).first()
  if (!await card.isVisible({ timeout: 3000 }).catch(() => false)) {
    console.warn('[SKIP] /best PostCard 없음')
    return
  }

  const href = await card.getAttribute('href') ?? ''
  const hasFFrom = href.includes('from=best')
  console.log(`${hasFFrom ? '✅' : '⚠️'} /best PostCard from=best 포함: ${href}`)

  await card.click()
  await page.waitForLoadState('domcontentloaded')
  await ss(page, '10-from-best', testInfo)

  const backBtn = page.locator('a[href="/best"], button[aria-label*="뒤로"], a[aria-label*="뒤로"]').first()
  if (await backBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    const backHref = await backBtn.getAttribute('href')
    console.log(`${backHref === '/best' ? '✅' : '❌ [P1]'} 뒤로가기 href: "${backHref}" (기대: /best)`)
  } else {
    console.warn('[INFO] 뒤로가기 버튼 미감지')
  }
})

// ══════════════════════════════════════════════════════════════════
// 12. 게시판 — 페이지네이션 (RISK-5 params 보존)
// ══════════════════════════════════════════════════════════════════
test('게시판 — 페이지네이션 page=2 이동', async ({ page }, testInfo) => {
  await page.goto(`${BASE}/community/stories`, { waitUntil: 'networkidle' })
  await page.waitForSelector('[class*="PostCard"], article', { timeout: 10000 }).catch(() => null)

  const page2Link = page.locator('a[href*="page=2"], nav a:has-text("2")').first()
  if (!await page2Link.isVisible({ timeout: 3000 }).catch(() => false)) {
    console.warn('[SKIP] 페이지네이션 page=2 없음 — 게시글 수 부족')
    return
  }
  await page2Link.click()
  await page.waitForLoadState('networkidle')
  const url = page.url()
  console.log(`${url.includes('page=2') ? '✅' : '❌ [P1]'} 페이지네이션 URL: ${url}`)
  await ss(page, '11-pagination-p2', testInfo)
})

// ══════════════════════════════════════════════════════════════════
// 13. 글쓰기 — 비로그인 /login redirect
// ══════════════════════════════════════════════════════════════════
test('글쓰기 — 비로그인 접근 보호 확인', async ({ browser }, testInfo) => {
  const ctx = await browser.newContext()
  const page = await ctx.newPage()
  await page.goto(`${BASE}/community/write?board=stories`, { waitUntil: 'networkidle' })
  const url = page.url()
  await ss(page, '11-write-guest-access', testInfo)

  if (url.includes('/login')) {
    console.log(`✅ [P0 OK] 비로그인 → /login redirect`)
  } else {
    // 미들웨어 미보호: 클라이언트 렌더링 수준에서 로그인 유도 UI 있는지 확인
    const loginPrompt = page.locator('[role="dialog"], text=로그인, text=가입, a[href*="/login"]')
    const hasPrompt = await loginPrompt.first().isVisible({ timeout: 3000 }).catch(() => false)
    if (hasPrompt) {
      console.warn(`⚠️ [P1] 비로그인 write — 미들웨어 redirect 없음, 클라이언트 로그인 유도 UI만 있음 → ${url}`)
    } else {
      console.error(`❌ [P1] 비로그인 write — 접근 보호 없음! URL: ${url} (미들웨어 + 클라이언트 모두 미보호)`)
    }
  }
  await ctx.close()
})

// ══════════════════════════════════════════════════════════════════
// 14. 글쓰기 — 카테고리 BottomSheet + 제목 유효성
// ══════════════════════════════════════════════════════════════════
test('글쓰기 — 카테고리 BottomSheet + 제목 maxLength', async ({ page }, testInfo) => {
  await page.goto(`${BASE}/community/write?board=stories`, { waitUntil: 'networkidle' })
  await dismissDraft(page)
  await ss(page, '12-write-initial', testInfo)

  const catBtn = page.locator('button', { hasText: '카테고리를 선택해주세요' })
  if (await catBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    await catBtn.click()
    await page.waitForTimeout(600)
    await ss(page, '12-write-category-sheet', testInfo)

    const sheet = page.locator('[role="dialog"][data-state="open"]').last()
    if (await sheet.isVisible({ timeout: 2000 }).catch(() => false)) {
      const firstCat = sheet.locator('button').first()
      if (await firstCat.isVisible({ timeout: 1000 }).catch(() => false)) {
        await firstCat.click({ force: true })
        await page.waitForTimeout(400)
        console.log('✅ 카테고리 선택 완료')
      }
    }
  }

  const titleInput = page.locator('input[placeholder*="제목"]').first()
  if (!await titleInput.isVisible({ timeout: 3000 }).catch(() => false)) {
    console.warn('[SKIP] 제목 input 없음')
    return
  }

  // 1자 → 등록 버튼 비활성화
  await titleInput.fill('테')
  await page.waitForTimeout(200)
  const submitBtn = page.locator('button', { hasText: '등록하기' }).last()
  const disabled1 = !await submitBtn.isEnabled().catch(() => true)
  console.log(`${disabled1 ? '✅' : '❌ [P1]'} 제목 1자 → 등록 버튼 비활성화`)

  // 정상 입력
  await titleInput.fill('테스트 제목입니다')
  await page.waitForTimeout(200)
  const counter = page.locator('text=/\\d+\\/40/')
  if (await counter.isVisible({ timeout: 1000 }).catch(() => false)) {
    console.log(`✅ 글자수 카운터: ${(await counter.textContent())?.trim()}`)
  }

  // 41자 → maxLength=40 차단
  await titleInput.fill('가'.repeat(41))
  const val = await titleInput.inputValue()
  console.log(`${val.length <= 40 ? '✅' : '❌ [P1]'} maxLength=40 (실제 ${val.length}자)`)
  await ss(page, '12-write-title-valid', testInfo)
})

// ══════════════════════════════════════════════════════════════════
// 15. 글쓰기 — 등록 버튼 활성화 확인 (미제출)
// ══════════════════════════════════════════════════════════════════
test('글쓰기 — 완전 입력 후 등록 버튼 활성화 (미제출)', async ({ page }, testInfo) => {
  await page.goto(`${BASE}/community/write?board=stories`, { waitUntil: 'networkidle' })
  await dismissDraft(page)

  // 카테고리
  const catBtn = page.locator('button', { hasText: '카테고리를 선택해주세요' })
  if (await catBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    await catBtn.click()
    await page.waitForTimeout(500)
    const sheet = page.locator('[role="dialog"][data-state="open"]').last()
    const firstCat = sheet.locator('button').first()
    if (await firstCat.isVisible({ timeout: 1000 }).catch(() => false)) {
      await firstCat.click({ force: true })
      await page.waitForTimeout(300)
    }
  }

  // 제목
  const titleInput = page.locator('input[placeholder*="제목"]').first()
  if (await titleInput.isVisible({ timeout: 2000 }).catch(() => false)) {
    await titleInput.fill('QA 자동화 테스트 제목')
  }

  // 본문
  const editor = page.locator('.ProseMirror, [contenteditable="true"]').first()
  if (await editor.isVisible({ timeout: 3000 }).catch(() => false)) {
    await editor.fill('QA 자동화 테스트 본문입니다. 열 자 이상 필수.')
    await page.waitForTimeout(300)
  }

  await page.keyboard.press('Escape')
  await page.waitForTimeout(400)
  await ss(page, '13-write-ready', testInfo)

  // 등록 버튼 활성화 확인만 — 클릭하지 않음 (프로덕션 데이터 보호)
  const submitBtn = page.locator('button', { hasText: '등록하기' }).last()
  const isEnabled = await submitBtn.isEnabled().catch(() => false)
  const box = await submitBtn.boundingBox()
  console.log(`${isEnabled ? '✅' : '❌ [P1]'} 등록 버튼 활성화: ${isEnabled}`)
  console.log(`[INFO] 등록 버튼: ${box?.width?.toFixed(0)}×${box?.height?.toFixed(0)}px`)
})
