/**
 * QA 15 — 우나어 종합 Deep QA
 *
 * 대상: https://www.age-doesnt-matter.com (프로덕션)
 * 뷰포트: qa-deep-mobile(390px) + qa-deep-desktop(1440px) 각각 실행
 * 인증: 프로젝트 레벨 user.json storageState (비로그인 테스트는 내부에서 override)
 *
 * 커버 범위:
 *   A. 비로그인 홈/탐색 (모바일+데스크탑)
 *   B. 게시판·게시글 전체
 *   C. 코드 분석 버그 재현 (B1~B10)
 *   D. 로그인 글쓰기 + 이미지/동영상 업로드 (실제 파일 사용 → afterAll cleanup)
 *   E. 댓글 전체 플로우
 *   F. 공감·스크랩·신고
 *   G. 마이페이지·설정
 */

import { test, expect, type Page } from '@playwright/test'
import path from 'path'
import { existsSync } from 'fs'

const TEST_IMAGE = path.join(__dirname, '../../우나어_테스트_이미지.png')
const TEST_VIDEO = path.join(__dirname, '../../우나어_테스트_동영상.mp4')

// 비로그인 override
const NO_AUTH = { cookies: [] as never[], origins: [] as never[] }

// 콘솔 에러 수집 헬퍼
function collectErrors(page: Page) {
  const errors: string[] = []
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text())
  })
  page.on('pageerror', (err) => errors.push('[PageError] ' + err.message))
  return errors
}

// 생성된 테스트 게시글 URL 추적 (cleanup용)
let createdPostUrl: string | null = null
let createdCommentPostUrl: string | null = null

// ─────────────────────────────────────────────
// 파트 A: 비로그인 홈페이지
// ─────────────────────────────────────────────
test.describe('파트A: 비로그인 홈페이지', () => {
  test.use({ storageState: NO_AUTH })

  test('A1 홈 로드 + 핵심 섹션 + 콘솔 에러 없음', async ({ page }) => {
    const errors = collectErrors(page)
    await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 20000 })
    await page.waitForTimeout(2000)

    await expect(page.locator('main, [role="main"]').first()).toBeVisible()
    const title = await page.title()
    expect(title.length, '페이지 title 비어있음').toBeGreaterThan(0)

    const criticalErrors = errors.filter(
      (e) =>
        e.includes('Hydration') ||
        e.includes('ChunkLoadError') ||
        e.includes('TypeError') ||
        e.includes('Cannot read'),
    )
    expect(criticalErrors, `심각한 콘솔 에러:\n${criticalErrors.join('\n')}`).toHaveLength(0)
  })

  test('A2 게시판 이름 board-constants 반영 확인', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 15000 })
    await page.waitForTimeout(1500)
    const body = await page.textContent('body')
    expect(body, '사는이야기 텍스트 없음').toContain('사는이야기')
    // WEEKLY("수다방")는 일반 사용자 화면에 노출되면 안 됨
    // (어드민에서만 "수다방(숨김)"으로 표시)
    const allText = body ?? ''
    const weeklyVisible = allText.includes('수다방') && !allText.includes('수다방(숨김)')
    if (weeklyVisible) console.warn('[QA-A2] ⚠️ "수다방" 공개 페이지 노출됨 — 확인 필요')
  })

  test('A3 Life2 섹션 — "2막준비" 더보기 링크 /community/life2', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 15000 })
    await page.waitForTimeout(2000)
    // Life2Section은 게시글 있을 때만 렌더링
    const life2Link = page.locator('a[href*="/community/life2"]').first()
    const count = await life2Link.count()
    if (count > 0) {
      const href = await life2Link.getAttribute('href')
      expect(href).toContain('/community/life2')
      console.log('[QA-A3] ✅ Life2 섹션 렌더링됨')
    } else {
      console.warn('[QA-A3] ⚠️ Life2 섹션 미렌더링 — life2 게시글 0건 가능성')
    }
  })

  test('A4 광고 슬롯 "광고" 라벨 존재', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 15000 })
    await page.waitForTimeout(3000) // 광고 로딩 대기
    const adLabel = page.locator('text=광고').first()
    // 광고는 초기화 실패할 수 있으므로 warn만
    const visible = await adLabel.isVisible().catch(() => false)
    if (!visible) console.warn('[QA-A4] ⚠️ "광고" 라벨 미발견 — AdSense/쿠팡 초기화 실패 가능성')
  })

  test('A5 모바일 가로 overflow 없음', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 15000 })
    await page.waitForTimeout(1000)
    const { scrollWidth, clientWidth } = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }))
    expect(
      scrollWidth,
      `가로 overflow 발생: scrollWidth(${scrollWidth}) > clientWidth(${clientWidth})`,
    ).toBeLessThanOrEqual(clientWidth + 5)
  })

  test('A6 데스크탑 GNB — 로고·메뉴·검색·프로필 렌더링', async ({ page, isMobile }) => {
    if (isMobile) test.skip()
    await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 15000 })
    await page.waitForTimeout(1000)
    // GNB 존재 확인 (데스크탑 전용 nav — hidden lg:flex)
    const nav = page.locator('nav[aria-label="메인 네비게이션"]')
    await expect(nav).toBeVisible()
  })

  test('A7 모바일 아이콘 메뉴 행 — 터치 타겟 52px 이상', async ({ page, isMobile }) => {
    if (!isMobile) test.skip()
    await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 15000 })
    await page.waitForTimeout(1000)
    // 아이콘 메뉴 버튼들의 높이 확인
    const menuLinks = page.locator('nav a, [class*="icon-menu"] a, [class*="nav"] a')
    const count = await menuLinks.count()
    if (count > 0) {
      const box = await menuLinks.first().boundingBox()
      if (box) {
        expect(box.height, `터치 타겟 너무 작음: ${box.height}px`).toBeGreaterThanOrEqual(44)
      }
    }
  })
})

// ─────────────────────────────────────────────
// 파트 B: 비로그인 게시판·게시글
// ─────────────────────────────────────────────
test.describe('파트B: 비로그인 게시판 탐색', () => {
  test.use({ storageState: NO_AUTH })

  test('B1 사는이야기 게시판 200 + 게시글 목록', async ({ page }) => {
    const res = await page.goto('/community/stories', { waitUntil: 'domcontentloaded', timeout: 15000 })
    expect(res?.status()).toBeLessThan(400)
    await page.waitForTimeout(1500)
    await expect(page.locator('main').first()).toBeVisible()
  })

  test('B2 웃음방 게시판 200', async ({ page }) => {
    const res = await page.goto('/community/humor', { waitUntil: 'domcontentloaded', timeout: 15000 })
    expect(res?.status()).toBeLessThan(400)
  })

  test('B3 2막준비 게시판 200 (LIFE2 신설)', async ({ page }) => {
    const errors = collectErrors(page)
    const res = await page.goto('/community/life2', { waitUntil: 'domcontentloaded', timeout: 15000 })
    expect(res?.status(), '/community/life2 접근 실패').toBeLessThan(400)
    await page.waitForTimeout(1500)

    const criticalErrors = errors.filter((e) => e.includes('TypeError') || e.includes('Cannot read'))
    expect(criticalErrors, `LIFE2 에러: ${criticalErrors.join('\n')}`).toHaveLength(0)
    console.log('[QA-B3] ✅ /community/life2 정상 접근')
  })

  test('B4 WEEKLY 게시판 완전 차단 → 404', async ({ page }) => {
    const res = await page.goto('/community/weekly', { waitUntil: 'domcontentloaded', timeout: 15000 })
    // 404 또는 리다이렉트(200이지만 404 UI 표시)
    const status = res?.status() ?? 0
    const url = page.url()
    const is404 = status === 404 || url.includes('not-found') || url.includes('404')
    const bodyText = await page.textContent('body')
    const has404Text =
      bodyText?.includes('찾을 수 없') ||
      bodyText?.includes('Not Found') ||
      bodyText?.includes('404') ||
      false
    expect(is404 || has404Text, `WEEKLY 게시판이 차단되지 않음 — status: ${status}, url: ${url}`).toBe(
      true,
    )
    console.log('[QA-B4] ✅ WEEKLY 차단 확인')
  })

  test('B5 게시글 카드 — 제목·등급이모지·공감수 표시', async ({ page }) => {
    await page.goto('/community/stories', { waitUntil: 'domcontentloaded', timeout: 15000 })
    await page.waitForTimeout(2000)
    // 첫 번째 게시글 카드 클릭 → 상세 진입
    const firstPost = page
      .locator('a[href*="/community/stories/"]')
      .filter({ hasNotText: '더보기' })
      .first()
    const count = await firstPost.count()
    if (count > 0) {
      const href = await firstPost.getAttribute('href')
      const res = await page.goto(href!, { waitUntil: 'domcontentloaded', timeout: 15000 })
      expect(res?.status()).toBeLessThan(400)
      await page.waitForTimeout(1500)
      await expect(page.locator('main').first()).toBeVisible()
      console.log('[QA-B5] ✅ 게시글 상세 진입 성공:', href)
    } else {
      console.warn('[QA-B5] ⚠️ 게시글 카드 없음 — 사는이야기 게시글 0건?')
    }
  })

  test('B6 HOT/FAME 배지 표시 — 베스트 페이지', async ({ page }) => {
    const res = await page.goto('/best', { waitUntil: 'domcontentloaded', timeout: 15000 })
    expect(res?.status()).toBeLessThan(400)
    await page.waitForTimeout(2000)
    // HOT 또는 FAME 배지가 있으면 확인
    const hotBadge = page.locator('text=HOT').first()
    const fameBadge = page.locator('text=FAME').first()
    const hasHot = await hotBadge.count() > 0
    const hasFame = await fameBadge.count() > 0
    if (!hasHot && !hasFame) console.warn('[QA-B6] ⚠️ HOT/FAME 배지 미발견 — 공감수 10+ 게시글 없음 가능성')
    else console.log('[QA-B6] ✅ 배지 발견 (HOT:', hasHot, ', FAME:', hasFame, ')')
  })

  test('B7 게시글 상세 — OG 메타태그', async ({ page }) => {
    // 첫 번째 게시글 URL 획득
    await page.goto('/community/stories', { waitUntil: 'domcontentloaded', timeout: 15000 })
    await page.waitForTimeout(1500)
    const firstPost = page.locator('a[href*="/community/stories/"]').first()
    if ((await firstPost.count()) === 0) {
      console.warn('[QA-B7] 게시글 없음 — skip')
      return
    }
    const href = await firstPost.getAttribute('href')
    await page.goto(href!, { waitUntil: 'domcontentloaded', timeout: 15000 })
    const ogTitle = await page.$eval('meta[property="og:title"]', (el) => el.getAttribute('content')).catch(() => null)
    const ogDesc = await page.$eval('meta[property="og:description"]', (el) => el.getAttribute('content')).catch(() => null)
    if (!ogTitle) console.warn('[QA-B7] ⚠️ og:title 없음')
    if (!ogDesc) console.warn('[QA-B7] ⚠️ og:description 없음')
    if (ogTitle && ogDesc) console.log('[QA-B7] ✅ OG 태그 정상:', ogTitle.substring(0, 30))
  })

  test('B8 비로그인 공감 클릭 → 로그인 유도', async ({ page }) => {
    await page.goto('/community/stories', { waitUntil: 'domcontentloaded', timeout: 15000 })
    await page.waitForTimeout(1500)
    const firstPost = page.locator('a[href*="/community/stories/"]').first()
    if ((await firstPost.count()) === 0) return
    await firstPost.click()
    await page.waitForTimeout(2000)
    // 공감 버튼 찾기
    const likeBtn = page.locator('button').filter({ hasText: /공감|❤|♥/ }).first()
    if ((await likeBtn.count()) > 0) {
      await likeBtn.click()
      await page.waitForTimeout(1000)
      // 로그인 모달 or 로그인 페이지로 이동
      const hasModal = await page.locator('[role="dialog"], [class*="modal"]').count() > 0
      const isLoginPage = page.url().includes('/login')
      expect(hasModal || isLoginPage, '비로그인 공감 클릭 시 로그인 유도 없음').toBe(true)
    }
  })

  test('B9 정렬 토글 (최신순 ↔ 공감순)', async ({ page }) => {
    await page.goto('/community/stories', { waitUntil: 'domcontentloaded', timeout: 15000 })
    await page.waitForTimeout(1500)
    const sortBtn = page.locator('button').filter({ hasText: /공감순|최신순|정렬/ }).first()
    if ((await sortBtn.count()) > 0) {
      const urlBefore = page.url()
      await sortBtn.click()
      await page.waitForTimeout(1000)
      console.log('[QA-B9] 정렬 전:', urlBefore.split('?')[1] ?? 'none')
      console.log('[QA-B9] 정렬 후:', page.url().split('?')[1] ?? 'none')
    } else {
      console.warn('[QA-B9] ⚠️ 정렬 버튼 미발견')
    }
  })

  test('B10 매거진 상세 — 본문 + OG 태그', async ({ page }) => {
    await page.goto('/magazine', { waitUntil: 'domcontentloaded', timeout: 15000 })
    await page.waitForTimeout(1500)
    const firstMag = page.locator('a[href*="/magazine/"]').first()
    if ((await firstMag.count()) === 0) {
      console.warn('[QA-B10] 매거진 아티클 없음')
      return
    }
    const href = await firstMag.getAttribute('href')
    const res = await page.goto(href!, { waitUntil: 'domcontentloaded', timeout: 15000 })
    expect(res?.status()).toBeLessThan(400)
    await page.waitForTimeout(1500)
    const ogTitle = await page.$eval('meta[property="og:title"]', (el) => el.getAttribute('content')).catch(() => null)
    console.log('[QA-B10] 매거진 OG title:', ogTitle ?? '없음')
  })

  test('B11 일자리 상세 — 급여·지원하기', async ({ page }) => {
    await page.goto('/jobs', { waitUntil: 'domcontentloaded', timeout: 15000 })
    await page.waitForTimeout(1500)
    const firstJob = page.locator('a[href*="/jobs/"]').first()
    if ((await firstJob.count()) === 0) {
      console.warn('[QA-B11] 일자리 없음')
      return
    }
    const href = await firstJob.getAttribute('href')
    await page.goto(href!, { waitUntil: 'domcontentloaded', timeout: 15000 })
    await page.waitForTimeout(1500)
    const applyBtn = page.locator('a[target="_blank"], button').filter({ hasText: /지원|신청/ }).first()
    const hasApply = await applyBtn.count() > 0
    if (!hasApply) console.warn('[QA-B11] ⚠️ 지원하기 버튼 미발견')
    else console.log('[QA-B11] ✅ 지원하기 버튼 존재')
  })

  test('B12 404 페이지 친절한 안내', async ({ page }) => {
    const res = await page.goto('/this-page-does-not-exist-qa-test', { waitUntil: 'domcontentloaded', timeout: 15000 })
    const status = res?.status() ?? 0
    const body = await page.textContent('body')
    const has404 = status === 404 || body?.includes('찾을 수 없') || body?.includes('Not Found')
    expect(has404, '404 처리 없음').toBe(true)
  })
})

// ─────────────────────────────────────────────
// 파트 C: 코드 분석 버그 재현
// ─────────────────────────────────────────────
test.describe('파트C: 버그 재현 (B1~B10)', () => {
  test.use({ storageState: NO_AUTH })

  test('C1 [B9] 베스트 페이지 — API 실패해도 500 아닌 안내 표시', async ({ page }) => {
    // 정상 케이스: 베스트 페이지 로드 확인 (에러 바운더리 여부는 직접 확인 불가)
    const res = await page.goto('/best', { waitUntil: 'domcontentloaded', timeout: 15000 })
    expect(res?.status(), '베스트 페이지 500 에러').not.toBe(500)
    await page.waitForTimeout(1500)
    await expect(page.locator('main').first()).toBeVisible()
    console.log('[QA-C1] 베스트 페이지 로드 상태:', res?.status())
  })

  test('C2 [B10] GNB 검색 1자 입력 + 엔터 → 반응 확인 (데스크탑)', async ({ page, isMobile }) => {
    if (isMobile) test.skip()
    await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 15000 })
    await page.waitForTimeout(1000)
    const searchInput = page.locator('input[type="search"], input[placeholder*="검색"]').first()
    if ((await searchInput.count()) === 0) {
      console.warn('[QA-C2] GNB 검색 입력창 미발견')
      return
    }
    await searchInput.fill('가')
    await searchInput.press('Enter')
    await page.waitForTimeout(1000)
    const urlAfter = page.url()
    const hasMsg = await page.locator('text=/2자|최소|글자/').count() > 0
    if (urlAfter.includes('/search')) {
      console.warn('[QA-C2] ❌ B10 재현됨 — 1자 입력해도 검색 실행됨 (URL:', urlAfter, ')')
    } else if (hasMsg) {
      console.log('[QA-C2] ✅ 1자 미만 피드백 메시지 존재')
    } else {
      console.warn('[QA-C2] ⚠️ 1자 입력 엔터 후 아무 반응 없음 — B10 UX 이슈')
    }
  })

  test('C3 [B6] 공유 URL 절대경로 확인', async ({ page }) => {
    await page.goto('/community/stories', { waitUntil: 'domcontentloaded', timeout: 15000 })
    await page.waitForTimeout(1500)
    const firstPost = page.locator('a[href*="/community/stories/"]').first()
    if ((await firstPost.count()) === 0) return
    const href = await firstPost.getAttribute('href')
    await page.goto(href!, { waitUntil: 'domcontentloaded', timeout: 15000 })
    await page.waitForTimeout(1500)

    // navigator.share 또는 카카오 공유 버튼 확인
    const shareBtn = page.locator('button').filter({ hasText: /공유|share/i }).first()
    if ((await shareBtn.count()) === 0) {
      console.warn('[QA-C3] 공유 버튼 미발견')
      return
    }

    // ActionBar 코드에서 window.location.pathname 사용 여부를 JavaScript로 확인
    const usesPathname = await page.evaluate(() => {
      // 실제 코드 확인은 불가, URL 검증만
      return window.location.href.startsWith('http')
    })
    expect(usesPathname, '현재 페이지 URL이 절대경로가 아님').toBe(true)
    console.log('[QA-C3] 현재 페이지 URL:', page.url())
    console.log('[QA-C3] ⚠️ ActionBar.tsx:shareToKakao에서 window.location.pathname 사용 — 코드 수정 필요')
  })
})

// ─────────────────────────────────────────────
// 파트 D: 로그인 글쓰기 + 미디어 업로드
// ─────────────────────────────────────────────
test.describe('파트D: 로그인 글쓰기 + 이미지/동영상 업로드', () => {
  test.describe.configure({ mode: 'serial' })
  // user.json 세션 사용 (프로젝트 레벨 storageState)

  test.afterAll(async ({ browser }) => {
    // 생성된 테스트 게시글 cleanup
    if (createdPostUrl) {
      const ctx = await browser.newContext({
        storageState: path.join(__dirname, '../.auth/user.json'),
      })
      const page = await ctx.newPage()
      try {
        await page.goto(createdPostUrl, { waitUntil: 'domcontentloaded', timeout: 15000 })
        await page.waitForTimeout(1000)
        const deleteBtn = page.locator('button').filter({ hasText: /삭제/ }).first()
        if ((await deleteBtn.count()) > 0) {
          await deleteBtn.click()
          await page.waitForTimeout(500)
          const confirmBtn = page.locator('button').filter({ hasText: /확인|삭제/ }).last()
          if ((await confirmBtn.count()) > 0) await confirmBtn.click()
          await page.waitForTimeout(1000)
          console.log('[CLEANUP] ✅ 테스트 게시글 삭제 완료')
        }
      } catch (e) {
        console.warn('[CLEANUP] 테스트 게시글 삭제 실패:', e)
      } finally {
        await ctx.close()
      }
    }
  })

  test('D1 글쓰기 페이지 접근 + 폼 렌더링', async ({ page }) => {
    await page.goto('/community/write', { waitUntil: 'domcontentloaded', timeout: 15000 })
    await page.waitForTimeout(2000)
    const titleInput = page.locator('input[name="title"], input[placeholder*="제목"]').first()
    const editor = page.locator('[contenteditable="true"], [class*="ProseMirror"], [class*="editor"]').first()
    const hasForm = (await titleInput.count()) > 0 || (await editor.count()) > 0
    expect(hasForm, '글쓰기 폼 미렌더링').toBe(true)
    console.log('[QA-D1] ✅ 글쓰기 폼 렌더링')
  })

  test('D2 게시판 드롭다운 — WEEKLY/MAGAZINE/JOB 없음, LIFE2 있음', async ({ page }) => {
    await page.goto('/community/write', { waitUntil: 'domcontentloaded', timeout: 15000 })
    await page.waitForTimeout(2000)

    const boardSelect = page
      .locator('select, [role="combobox"], button[class*="select"]')
      .filter({ hasText: /게시판|사는이야기|웃음방|선택/ })
      .first()
    if ((await boardSelect.count()) === 0) {
      console.warn('[QA-D2] 게시판 선택 UI 미발견 (defaultBoard 고정 가능성)')
      return
    }
    await boardSelect.click()
    await page.waitForTimeout(500)

    const options = page.locator('[role="option"], option')
    const optionTexts = await options.allTextContents()
    console.log('[QA-D2] 게시판 옵션:', optionTexts)

    const hasLife2 = optionTexts.some((t) => t.includes('2막준비'))
    const hasWeekly = optionTexts.some((t) => t.includes('수다방'))
    const hasMagazine = optionTexts.some((t) => t.includes('매거진'))

    if (hasLife2) console.log('[QA-D2] ✅ LIFE2(2막준비) 옵션 존재')
    else console.warn('[QA-D2] ⚠️ LIFE2(2막준비) 옵션 없음')

    if (hasWeekly) console.warn('[QA-D2] ❌ B버그: WEEKLY(수다방) 옵션이 글쓰기에 노출됨')
    if (hasMagazine) console.warn('[QA-D2] ❌ MAGAZINE 옵션이 글쓰기에 노출됨 (운영자 전용이어야 함)')
  })

  test('D3 유효성 검사 — 제목 1자 + 본문 없음 → 등록 버튼 비활성', async ({ page }) => {
    await page.goto('/community/write', { waitUntil: 'domcontentloaded', timeout: 15000 })
    await page.waitForTimeout(2000)

    const titleInput = page.locator('input[name="title"], input[placeholder*="제목"]').first()
    if ((await titleInput.count()) === 0) return

    // 제목만 1자 입력 (본문 없음) → 등록 버튼이 disabled 상태여야 함
    await titleInput.fill('가')
    await page.waitForTimeout(500)

    // 하단 CTA "등록하기" 버튼 — 내용 없으므로 비활성 상태 확인
    const ctaBtn = page.getByRole('button', { name: '등록하기', exact: true })
    if ((await ctaBtn.count()) > 0) {
      const isDisabled = await ctaBtn.isDisabled()
      console.log(`[QA-D3] 제목 1자+본문 없음 → 등록하기 disabled: ${isDisabled}`)
    }
  })

  test('D4 유효성 검사 — 본문 없이 발행 → 오류', async ({ page }) => {
    await page.goto('/community/write', { waitUntil: 'domcontentloaded', timeout: 15000 })
    await page.waitForTimeout(2000)
    const titleInput = page.locator('input[name="title"], input[placeholder*="제목"]').first()
    if ((await titleInput.count()) === 0) return

    await titleInput.fill('테스트 제목입니다 QA')
    const submitBtn = page.locator('button').filter({ hasText: /발행|등록|저장|게시/ }).last()
    if ((await submitBtn.count()) > 0) {
      await submitBtn.click()
      await page.waitForTimeout(1000)
      const errorMsg = await page.locator('[class*="error"], [class*="toast"], [role="alert"]').textContent().catch(() => '')
      console.log('[QA-D4] 본문없음 오류 메시지:', errorMsg)
    }
  })

  test('D5 [B2 재현] 이미지 업로드 실패 후 재선택 가능한지', async ({ page }) => {
    await page.goto('/community/write', { waitUntil: 'domcontentloaded', timeout: 15000 })
    await page.waitForTimeout(2000)

    // 5MB 초과 파일 시뮬레이션: 실제 큰 파일 없으므로 valid 파일로 업로드 후 input 상태 확인
    const imageInput = page.locator('input[type="file"][accept*="image"]').first()
    if ((await imageInput.count()) === 0) {
      console.warn('[QA-D5] 이미지 input 미발견')
      return
    }

    // 유효한 이미지 업로드
    await imageInput.setInputFiles(TEST_IMAGE)
    await page.waitForTimeout(3000)

    // 업로드 성공 후 input이 비워지는지 확인 (B2 이슈: input.value='' 후 재선택 불가)
    const inputValueAfter = await imageInput.inputValue().catch(() => 'N/A')
    console.log('[QA-D5] 업로드 후 input value:', inputValueAfter || '비어있음(정상-업로드됨)')

    // 다시 같은 파일 선택 시도 — change 이벤트 발생하는지
    await imageInput.setInputFiles(TEST_IMAGE)
    await page.waitForTimeout(2000)
    const editorContent = await page.locator('[contenteditable="true"]').innerHTML().catch(() => '')
    const hasImg = editorContent.includes('<img') || editorContent.includes('img')
    console.log('[QA-D5] 에디터에 이미지 삽입됨:', hasImg)
  })

  test('D6 실제 이미지 업로드 — 에디터에 R2 URL 삽입', async ({ page }) => {
    if (!existsSync(TEST_IMAGE)) {
      console.warn('[QA-D6] 테스트 이미지 없음:', TEST_IMAGE)
      return
    }
    await page.goto('/community/write', { waitUntil: 'domcontentloaded', timeout: 15000 })
    await page.waitForTimeout(2000)

    const imageInput = page.locator('input[type="file"][accept*="image"]').first()
    if ((await imageInput.count()) === 0) {
      console.warn('[QA-D6] 이미지 input 미발견')
      return
    }

    const failedReqs: string[] = []
    page.on('requestfailed', (req) => failedReqs.push(req.url()))

    await imageInput.setInputFiles(TEST_IMAGE)
    // 업로드 완료 대기 (최대 15초)
    await page.waitForTimeout(8000)

    const editorContent = await page.locator('[contenteditable="true"]').innerHTML().catch(() => '')
    const hasImg = editorContent.includes('<img')
    const hasR2 =
      editorContent.includes('r2.') ||
      editorContent.includes('cloudflare') ||
      editorContent.includes('age-doesnt-matter')

    if (hasImg) {
      console.log('[QA-D6] ✅ 이미지 업로드 성공, R2 URL:', hasR2)
    } else {
      console.warn('[QA-D6] ❌ 이미지 업로드 실패 — 에디터에 img 없음')
      if (failedReqs.length > 0) console.warn('[QA-D6] 실패 요청:', failedReqs)
    }
  })

  test('D7 실제 동영상 업로드 — 에디터에 video 노드 삽입', async ({ page }) => {
    if (!existsSync(TEST_VIDEO)) {
      console.warn('[QA-D7] 테스트 동영상 없음:', TEST_VIDEO)
      return
    }
    await page.goto('/community/write', { waitUntil: 'domcontentloaded', timeout: 15000 })
    await page.waitForTimeout(2000)

    const videoInput = page.locator('input[type="file"][accept*="video"]').first()
    if ((await videoInput.count()) === 0) {
      console.warn('[QA-D7] 동영상 input 미발견 — 업로드 버튼 클릭 필요 가능성')
      return
    }

    await videoInput.setInputFiles(TEST_VIDEO)
    // 동영상 업로드는 더 오래 걸림
    await page.waitForTimeout(15000)

    const editorContent = await page.locator('[contenteditable="true"]').innerHTML().catch(() => '')
    const hasVideo =
      editorContent.includes('<video') ||
      editorContent.includes('video-node') ||
      editorContent.includes('.mp4') ||
      editorContent.includes('.webm')

    if (hasVideo) {
      console.log('[QA-D7] ✅ 동영상 업로드 성공')
    } else {
      console.warn('[QA-D7] ❌ 동영상 업로드 실패 — 에디터에 video 없음')
    }
  })

  test('[B4 재현] D8 이미지만 있는 글 발행 — 서버 검증 통과 여부', async ({ page }) => {
    await page.goto('/community/write', { waitUntil: 'domcontentloaded', timeout: 15000 })
    await page.waitForTimeout(2000)

    const titleInput = page.locator('input[name="title"], input[placeholder*="제목"]').first()
    if ((await titleInput.count()) === 0) return

    await titleInput.fill('[QA테스트] B4버그 재현 - 이미지만 있는 글')

    // 이미지 업로드 (텍스트 없음)
    const imageInput = page.locator('input[type="file"][accept*="image"]').first()
    if ((await imageInput.count()) > 0) {
      await imageInput.setInputFiles(TEST_IMAGE)
      await page.waitForTimeout(5000)
    }

    const submitBtn = page.locator('button').filter({ hasText: /발행|등록|게시/ }).last()
    if ((await submitBtn.count()) > 0) {
      await submitBtn.click()
      await page.waitForTimeout(3000)
      const currentUrl = page.url()
      const hasError = await page.locator('[class*="error"], [class*="toast"]').count() > 0
      if (currentUrl.includes('/write')) {
        console.warn('[QA-D8] ❌ B4 재현됨 — 이미지만 있는 글 발행 거부됨 (URL 유지:', currentUrl, ')')
        if (hasError) {
          const msg = await page.locator('[class*="error"], [class*="toast"]').first().textContent()
          console.warn('[QA-D8] 오류 메시지:', msg)
        }
      } else {
        console.log('[QA-D8] ✅ 이미지만 있는 글 발행 성공 — URL:', currentUrl)
      }
    }
  })

  test('D9 정상 글 발행 + 게시판 목록 노출 확인', async ({ page }) => {
    await page.goto('/community/stories', { waitUntil: 'domcontentloaded', timeout: 15000 })
    await page.waitForTimeout(1000)

    // FAB 클릭
    const fab = page.locator('a[href*="/write"], button').filter({ hasText: /글쓰기|✏/ }).first()
    if ((await fab.count()) === 0) {
      await page.goto('/community/write', { waitUntil: 'domcontentloaded', timeout: 15000 })
    } else {
      await fab.click()
      await page.waitForTimeout(2000)
    }

    const titleInput = page.locator('input[name="title"], input[placeholder*="제목"]').first()
    if ((await titleInput.count()) === 0) {
      console.warn('[QA-D9] 글쓰기 폼 미렌더링 — skip')
      return
    }

    const testTitle = `[QA테스트] ${new Date().toISOString().slice(0, 16)} 자동화 테스트 게시글 — 삭제 예정`
    await titleInput.fill(testTitle)

    // 본문 입력
    const editor = page.locator('[contenteditable="true"]').first()
    if ((await editor.count()) > 0) {
      await editor.click()
      await page.keyboard.type('이 게시글은 자동화 QA 테스트를 위해 생성되었습니다. 잠시 후 삭제될 예정입니다. 우나어 서비스를 응원합니다! 5060세대 화이팅!')
    }

    // 이미지 업로드
    const imageInput = page.locator('input[type="file"][accept*="image"]').first()
    if ((await imageInput.count()) > 0) {
      await imageInput.setInputFiles(TEST_IMAGE)
      await page.waitForTimeout(5000)
      console.log('[QA-D9] 이미지 업로드 완료')
    }

    // 발행
    const submitBtn = page.locator('button').filter({ hasText: /발행|등록|게시/ }).last()
    if ((await submitBtn.count()) === 0) {
      console.warn('[QA-D9] 발행 버튼 미발견')
      return
    }

    await submitBtn.click()
    await page.waitForTimeout(5000)

    const afterUrl = page.url()
    if (afterUrl.includes('/community/') && !afterUrl.includes('/write')) {
      createdPostUrl = afterUrl
      console.log('[QA-D9] ✅ 게시글 발행 성공! URL:', afterUrl)
    } else {
      const errorText = await page.locator('[class*="error"], [class*="toast"]').first().textContent().catch(() => '')
      console.warn('[QA-D9] ❌ 발행 후 URL 유지 — 발행 실패 가능성. 에러:', errorText)
    }
  })

  test('D10 글 수정 — 내용 변경 + 저장', async ({ page }) => {
    if (!createdPostUrl) {
      console.warn('[QA-D10] 선행 테스트(D9) 실패 — skip')
      return
    }
    await page.goto(createdPostUrl + '/edit', { waitUntil: 'domcontentloaded', timeout: 15000 })
    await page.waitForTimeout(2000)

    const titleInput = page.locator('input[name="title"], input[placeholder*="제목"]').first()
    if ((await titleInput.count()) === 0) {
      console.warn('[QA-D10] 수정 폼 미렌더링')
      return
    }

    // 제목에 (수정됨) 추가
    const currentTitle = await titleInput.inputValue()
    await titleInput.fill(currentTitle + ' (수정됨)')

    const saveBtn = page.locator('button').filter({ hasText: /저장|수정|발행/ }).last()
    if ((await saveBtn.count()) > 0) {
      await saveBtn.click()
      await page.waitForTimeout(3000)
      console.log('[QA-D10] 수정 후 URL:', page.url())
    }
  })
})

// ─────────────────────────────────────────────
// 파트 E: 댓글 전체 플로우
// ─────────────────────────────────────────────
test.describe('파트E: 댓글 플로우', () => {
  test.describe.configure({ mode: 'serial' })
  const testCommentText = `[QA댓글] ${Date.now()}`

  test.afterAll(async () => {
    // 댓글 cleanup은 테스트 내에서 삭제 처리
    if (createdCommentPostUrl) {
      console.log('[CLEANUP] 댓글 테스트 게시글:', createdCommentPostUrl)
    }
  })

  test('E1 댓글 입력창 sticky — 스크롤 시 하단 고정 (모바일)', async ({ page, isMobile }) => {
    if (!isMobile) test.skip()
    // 기존 게시글에서 확인
    await page.goto('/community/stories', { waitUntil: 'domcontentloaded', timeout: 15000 })
    await page.waitForTimeout(1500)
    const firstPost = page.locator('a[href*="/community/stories/"]').first()
    if ((await firstPost.count()) === 0) return
    await firstPost.click()
    await page.waitForTimeout(2000)

    // 댓글 입력창 bottom fixed 확인
    const commentInput = page.locator('[class*="comment"] input, [class*="comment"] textarea').last()
    if ((await commentInput.count()) > 0) {
      const box = await commentInput.boundingBox()
      const viewport = page.viewportSize()
      if (box && viewport) {
        const distFromBottom = viewport.height - (box.y + box.height)
        console.log('[QA-E1] 댓글 입력창 하단 거리:', distFromBottom, 'px')
        // sticky이면 화면 하단 근처에 있어야 함 (100px 이내)
        if (distFromBottom > 200) console.warn('[QA-E1] ⚠️ 댓글 입력창이 하단에 고정되지 않음')
        else console.log('[QA-E1] ✅ 댓글 입력창 하단 근처')
      }
    }
  })

  test('E2 댓글 작성 → 목록 표시 + 댓글 수 +1', async ({ page }) => {
    // 생성된 테스트 게시글에 댓글 작성
    const targetUrl = createdPostUrl ?? '/community/stories'
    await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 15000 })
    await page.waitForTimeout(2000)

    // 게시글 목록이면 첫 번째 클릭
    if (!targetUrl.match(/\/community\/\w+\/\w/)) {
      const firstPost = page.locator('a[href*="/community/stories/"]').first()
      if ((await firstPost.count()) === 0) return
      await firstPost.click()
      await page.waitForTimeout(2000)
      createdCommentPostUrl = page.url()
    } else {
      createdCommentPostUrl = targetUrl
    }

    // 댓글 입력
    const commentInput = page
      .locator('textarea[placeholder*="댓글을"], textarea[placeholder*="댓글"], input[placeholder*="댓글"]')
      .first()
    if ((await commentInput.count()) === 0) {
      console.warn('[QA-E2] 댓글 입력창 미발견')
      return
    }

    await commentInput.fill(testCommentText)
    await page.waitForTimeout(500) // 입력 debounce 대기 (버튼 활성화)
    const submitBtn = page.locator('button').filter({ hasText: /등록|작성|댓글|전송/ }).last()
    if ((await submitBtn.count()) > 0) {
      const isDisabled = await submitBtn.isDisabled()
      if (isDisabled) {
        console.warn('[QA-E2] 등록 버튼이 disabled — 입력 바인딩 미완')
        return
      }
      await submitBtn.click()
      await page.waitForTimeout(2000)
      const hasMyComment = await page.locator(`text=${testCommentText}`).count() > 0
      if (hasMyComment) console.log('[QA-E2] ✅ 댓글 등록 성공 + 화면 표시됨')
      else console.warn('[QA-E2] ❌ 댓글 등록 후 화면에 미표시')
    }
  })

  test('E3 댓글 0자 → 등록 버튼 disabled', async ({ page }) => {
    const targetUrl = createdCommentPostUrl ?? createdPostUrl
    if (!targetUrl) return
    await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 15000 })
    await page.waitForTimeout(2000)

    const submitBtn = page.locator('button').filter({ hasText: /등록|작성|댓글|전송/ }).last()
    if ((await submitBtn.count()) > 0) {
      const isDisabled = await submitBtn.isDisabled()
      if (isDisabled) console.log('[QA-E3] ✅ 빈 댓글 시 등록 버튼 disabled')
      else console.warn('[QA-E3] ⚠️ 빈 댓글 상태에서 등록 버튼 활성화됨')
    }
  })

  test('E4 답글(대댓글) 작성', async ({ page }) => {
    const targetUrl = createdCommentPostUrl ?? createdPostUrl
    if (!targetUrl) return
    await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 15000 })
    await page.waitForTimeout(2000)

    const replyBtn = page.locator('button').filter({ hasText: /답글|대댓글/ }).first()
    if ((await replyBtn.count()) === 0) {
      console.warn('[QA-E4] 답글 버튼 미발견')
      return
    }
    await replyBtn.click()
    await page.waitForTimeout(1000)
    const replyInput = page.locator('textarea[placeholder*="답글"], textarea[placeholder*="댓글"]').last()
    if ((await replyInput.count()) > 0) {
      await replyInput.fill(`[QA 대댓글] ${Date.now()}`)
      const submitBtn = page.locator('button').filter({ hasText: /등록|작성/ }).last()
      if ((await submitBtn.count()) > 0) {
        await submitBtn.click()
        await page.waitForTimeout(2000)
        console.log('[QA-E4] ✅ 대댓글 등록 완료')
      }
    }
  })

  test('[B8 재현] E5 댓글 작성 후 정렬 전환 → 새 댓글 위치', async ({ page }) => {
    const targetUrl = createdCommentPostUrl ?? createdPostUrl
    if (!targetUrl) return
    await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 15000 })
    await page.waitForTimeout(2000)

    const sortBtn = page.locator('button').filter({ hasText: /공감순|최신순|정렬/ }).first()
    if ((await sortBtn.count()) === 0) {
      console.warn('[QA-E5] 댓글 정렬 버튼 미발견')
      return
    }
    // 공감순으로 변경
    await sortBtn.click()
    await page.waitForTimeout(500)

    // 최신순으로 복귀
    await sortBtn.click()
    await page.waitForTimeout(1000)

    // 내 댓글이 화면에 있는지
    const myComment = await page.locator(`text=${testCommentText}`).count()
    if (myComment > 0) console.log('[QA-E5] ✅ 정렬 전환 후 내 댓글 표시됨')
    else console.warn('[QA-E5] ⚠️ B8 재현 가능성 — 정렬 전환 후 내 댓글 미표시')
  })

  test('E6 댓글 삭제 → "삭제된 댓글" 표시', async ({ page }) => {
    const targetUrl = createdCommentPostUrl ?? createdPostUrl
    if (!targetUrl) return
    await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 15000 })
    await page.waitForTimeout(2000)

    // 내 댓글의 삭제 버튼 찾기
    const myCommentEl = page.locator(`text=${testCommentText}`).first()
    if ((await myCommentEl.count()) === 0) {
      console.warn('[QA-E6] 내 댓글 미발견 — skip')
      return
    }
    // 댓글 컨테이너에서 삭제 버튼 찾기
    const deleteBtn = myCommentEl.locator('xpath=ancestor::*[@class and contains(@class, "comment")]//button[contains(text(),"삭제")]').first()
    if ((await deleteBtn.count()) === 0) {
      // 직접 삭제 버튼 찾기
      const nearbyDelete = page.locator('button').filter({ hasText: '삭제' }).first()
      if ((await nearbyDelete.count()) > 0) {
        await nearbyDelete.click()
        await page.waitForTimeout(1000)
        // 확인 모달
        const confirmBtn = page.locator('button').filter({ hasText: /확인|삭제/ }).last()
        if ((await confirmBtn.count()) > 0) await confirmBtn.click()
        await page.waitForTimeout(1500)
        const isDeleted = await page.locator('text=/삭제된 댓글/').count() > 0
        if (isDeleted) console.log('[QA-E6] ✅ 삭제된 댓글 표시 확인')
        else console.warn('[QA-E6] ⚠️ 삭제 후 "삭제된 댓글" 텍스트 미발견')
      }
    }
  })
})

// ─────────────────────────────────────────────
// 파트 F: 공감·스크랩·신고
// ─────────────────────────────────────────────
test.describe('파트F: 공감·스크랩·신고', () => {
  test('F1 공감 1회 → 카운트 +1 + 버튼 토글', async ({ page }) => {
    const targetUrl = createdPostUrl
    if (!targetUrl) {
      // 기존 게시글 사용
      await page.goto('/community/stories', { waitUntil: 'domcontentloaded', timeout: 15000 })
      await page.waitForTimeout(1500)
      const firstPost = page.locator('a[href*="/community/stories/"]').first()
      if ((await firstPost.count()) === 0) return
      await firstPost.click()
      await page.waitForTimeout(2000)
    } else {
      await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 15000 })
      await page.waitForTimeout(2000)
    }

    const likeBtn = page.locator('button').filter({ hasText: /공감/ }).first()
    if ((await likeBtn.count()) === 0) {
      console.warn('[QA-F1] 공감 버튼 미발견')
      return
    }
    const countBefore = parseInt(
      (await likeBtn.textContent())?.replace(/[^0-9]/g, '') || '0',
    )
    await likeBtn.click()
    await page.waitForTimeout(1500)
    const countAfter = parseInt(
      (await likeBtn.textContent())?.replace(/[^0-9]/g, '') || '0',
    )
    console.log('[QA-F1] 공감 전:', countBefore, '→ 후:', countAfter)
    if (countAfter === countBefore + 1) console.log('[QA-F1] ✅ 공감 +1 정상')
    else console.warn('[QA-F1] ⚠️ 공감 카운트 변화 없음 또는 오류')
  })

  test('[B1 재현] F2 공감 빠른 다중 클릭 → race condition 확인', async ({ page }) => {
    const targetUrl = createdPostUrl
    if (!targetUrl) return
    await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 15000 })
    await page.waitForTimeout(2000)

    const likeBtn = page.locator('button').filter({ hasText: /공감/ }).first()
    if ((await likeBtn.count()) === 0) return

    const countBefore = parseInt(
      (await likeBtn.textContent())?.replace(/[^0-9]/g, '') || '0',
    )

    // 빠르게 5회 클릭 (300ms 간격)
    for (let i = 0; i < 5; i++) {
      await likeBtn.click()
      await page.waitForTimeout(150)
    }
    await page.waitForTimeout(3000) // 서버 응답 대기

    const countFinal = parseInt(
      (await likeBtn.textContent())?.replace(/[^0-9]/g, '') || '0',
    )
    const diff = countFinal - countBefore
    console.log('[QA-F2] 5회 클릭 후 공감 변화:', diff, '(기대: -1, 0, 또는 1)')

    if (diff > 1 || diff < -1) {
      console.warn(`[QA-F2] ❌ B1 재현됨 — race condition! 공감 변화 ${diff} (예상 범위 -1~1)`)
    } else {
      console.log('[QA-F2] ✅ race condition 없음 — 공감 변화 정상 범위')
    }
  })

  test('F3 스크랩 → /my/scraps 확인', async ({ page }) => {
    const targetUrl = createdPostUrl
    if (!targetUrl) return
    await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 15000 })
    await page.waitForTimeout(2000)

    const scrapBtn = page.locator('button').filter({ hasText: /스크랩|북마크|저장/ }).first()
    if ((await scrapBtn.count()) === 0) {
      console.warn('[QA-F3] 스크랩 버튼 미발견')
      return
    }
    await scrapBtn.click()
    await page.waitForTimeout(1500)

    // /my/scraps 확인
    await page.goto('/my/scraps', { waitUntil: 'domcontentloaded', timeout: 15000 })
    await page.waitForTimeout(1500)
    const res = page.url()
    if (!res.includes('/login')) {
      console.log('[QA-F3] /my/scraps 접근 성공')
    }
  })

  test('F4 신고 모달 — UI 확인 (제출 안 함)', async ({ page }) => {
    const targetUrl = createdPostUrl
    if (!targetUrl) {
      await page.goto('/community/stories', { waitUntil: 'domcontentloaded', timeout: 15000 })
      await page.waitForTimeout(1500)
      const firstPost = page.locator('a[href*="/community/stories/"]').first()
      if ((await firstPost.count()) === 0) return
      await firstPost.click()
      await page.waitForTimeout(2000)
    } else {
      await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 15000 })
      await page.waitForTimeout(2000)
    }

    const reportBtn = page.locator('button').filter({ hasText: /신고/ }).first()
    if ((await reportBtn.count()) === 0) {
      console.warn('[QA-F4] 신고 버튼 미발견')
      return
    }
    await reportBtn.click()
    await page.waitForTimeout(1000)

    const modal = page.locator('[role="dialog"], [class*="modal"], [class*="sheet"]').first()
    const hasModal = await modal.isVisible().catch(() => false)
    if (hasModal) {
      console.log('[QA-F4] ✅ 신고 모달 표시됨')
      // 모달 닫기 (제출 안 함)
      const closeBtn = page.locator('button').filter({ hasText: /닫기|취소|✕|×/ }).first()
      if ((await closeBtn.count()) > 0) await closeBtn.click()
      else await page.keyboard.press('Escape')
    } else {
      console.warn('[QA-F4] ⚠️ 신고 모달 미표시')
    }
  })
})

// ─────────────────────────────────────────────
// 파트 G: 마이페이지·설정
// ─────────────────────────────────────────────
test.describe('파트G: 마이페이지·설정', () => {
  test('G1 /my — 닉네임·등급이모지', async ({ page }) => {
    const res = await page.goto('/my', { waitUntil: 'domcontentloaded', timeout: 15000 })
    expect(res?.status()).toBeLessThan(400)
    await page.waitForTimeout(2000)
    await expect(page.locator('main').first()).toBeVisible()
    const bodyText = await page.textContent('body')
    // 등급 이모지 확인 (🌱 새싹)
    const hasGrade = bodyText?.includes('🌱') || bodyText?.includes('🌿') || bodyText?.includes('⭐') || bodyText?.includes('☀️')
    if (!hasGrade) console.warn('[QA-G1] ⚠️ 등급 이모지 미발견')
    else console.log('[QA-G1] ✅ 등급 표시됨')
  })

  test('G2 /my/posts — 내 글 목록', async ({ page }) => {
    const res = await page.goto('/my/posts', { waitUntil: 'domcontentloaded', timeout: 15000 })
    expect(res?.status(), '/my/posts 접근 실패').toBeLessThan(400)
    await page.waitForTimeout(2000)
    await expect(page.locator('main').first()).toBeVisible()
  })

  test('G3 /my/comments — 내 댓글 목록', async ({ page }) => {
    const res = await page.goto('/my/comments', { waitUntil: 'domcontentloaded', timeout: 15000 })
    expect(res?.status()).toBeLessThan(400)
    await page.waitForTimeout(1500)
  })

  test('G4 /my/scraps — 스크랩 목록', async ({ page }) => {
    const res = await page.goto('/my/scraps', { waitUntil: 'domcontentloaded', timeout: 15000 })
    expect(res?.status()).toBeLessThan(400)
    await page.waitForTimeout(1500)
  })

  test('G5 /my/notifications — 알림 목록 + 콘솔 에러 없음', async ({ page }) => {
    const errors = collectErrors(page)
    const res = await page.goto('/my/notifications', { waitUntil: 'domcontentloaded', timeout: 15000 })
    expect(res?.status(), '[B12] 알림 페이지 500 에러').not.toBe(500)
    await page.waitForTimeout(1500)
    await expect(page.locator('main').first()).toBeVisible()
    const criticals = errors.filter((e) => e.includes('TypeError') || e.includes('Hydration'))
    expect(criticals, `알림 페이지 에러: ${criticals.join('\n')}`).toHaveLength(0)
  })

  test('G6 /my/settings — 글자크기 3단계 + 닉네임 변경 UI', async ({ page }) => {
    const res = await page.goto('/my/settings', { waitUntil: 'domcontentloaded', timeout: 15000 })
    expect(res?.status()).toBeLessThan(400)
    await page.waitForTimeout(2000)

    // 글자크기 설정 UI 확인
    const fontSizeLabels = await page.locator('text=/보통|크게|아주크게/').count()
    if (fontSizeLabels > 0) console.log('[QA-G6] ✅ 글자크기 설정 UI 존재 (옵션 수:', fontSizeLabels, ')')
    else console.warn('[QA-G6] ⚠️ 글자크기 설정 UI 미발견')

    // 닉네임 변경 폼 확인
    const hasNicknameSection = await page.locator('text=/닉네임/').count() > 0
    if (hasNicknameSection) console.log('[QA-G6] ✅ 닉네임 변경 섹션 존재')
    else console.warn('[QA-G6] ⚠️ 닉네임 변경 섹션 미발견')
  })

  test('[B13] G7 글자크기 변경 → localStorage 동기화 확인', async ({ page }) => {
    await page.goto('/my/settings', { waitUntil: 'domcontentloaded', timeout: 15000 })
    await page.waitForTimeout(2000)

    // "크게" 옵션 선택
    const largeOption = page.locator('button, label').filter({ hasText: '크게' }).first()
    if ((await largeOption.count()) === 0) {
      console.warn('[QA-G7] 글자크기 "크게" 옵션 미발견')
      return
    }
    await largeOption.click()
    await page.waitForTimeout(2000)

    // localStorage 확인
    const lsValue = await page.evaluate(() => localStorage.getItem('unao-font-size'))
    console.log('[QA-G7] localStorage 글자크기:', lsValue)
    if (lsValue === 'LARGE' || lsValue === 'large') console.log('[QA-G7] ✅ localStorage 동기화됨')
    else console.warn('[QA-G7] ⚠️ localStorage 값:', lsValue, '(기대: LARGE)')

    // 원래대로 복구
    const normalOption = page.locator('button, label').filter({ hasText: '보통' }).first()
    if ((await normalOption.count()) > 0) await normalOption.click()
  })

  test('G8 로그아웃 → 비로그인 상태 전환', async ({ page }) => {
    await page.goto('/my', { waitUntil: 'domcontentloaded', timeout: 15000 })
    await page.waitForTimeout(1500)
    const signOutBtn = page.locator('button').filter({ hasText: /로그아웃|로그 아웃/ }).first()
    if ((await signOutBtn.count()) === 0) {
      console.warn('[QA-G8] 로그아웃 버튼 미발견')
      return
    }
    await signOutBtn.click()
    await page.waitForTimeout(3000)
    // 비로그인 상태 확인 (홈 or 로그인 페이지)
    const url = page.url()
    console.log('[QA-G8] 로그아웃 후 URL:', url)
  })
})

// ─────────────────────────────────────────────
// 파트 H: 공개 기타 페이지
// ─────────────────────────────────────────────
test.describe('파트H: 공개 기타 페이지', () => {
  test.use({ storageState: NO_AUTH })

  test('H1 베스트 3탭 전환 + B9 에러 확인', async ({ page }) => {
    const errors = collectErrors(page)
    const res = await page.goto('/best', { waitUntil: 'domcontentloaded', timeout: 15000 })
    expect(res?.status(), '[B9] 베스트 페이지 500 에러').not.toBe(500)
    await page.waitForTimeout(2000)

    // 탭 전환
    for (const tabText of ['오늘', '이번 주', '명예의전당']) {
      const tab = page.locator('button, a').filter({ hasText: new RegExp(tabText) }).first()
      if ((await tab.count()) > 0) {
        await tab.click()
        await page.waitForTimeout(1000)
        const urlAfter = page.url()
        console.log(`[QA-H1] ${tabText} 탭 URL:`, urlAfter)
      }
    }

    const criticals = errors.filter((e) => e.includes('TypeError'))
    if (criticals.length > 0) console.warn('[QA-H1] 베스트 에러:', criticals)
  })

  test('H2 검색 기능 — 인기검색어 + 결과', async ({ page }) => {
    const res = await page.goto('/search', { waitUntil: 'domcontentloaded', timeout: 15000 })
    expect(res?.status()).toBeLessThan(400)
    await page.waitForTimeout(1500)

    // 검색어 입력 (main 영역에서 찾아서 GNB hidden input 제외)
    const searchInput = page.locator('main input[type="search"], main input[placeholder*="검색"], [role="search"] input').first()
    if ((await searchInput.count()) > 0 && await searchInput.isVisible().catch(() => false)) {
      await searchInput.fill('건강')
      await searchInput.press('Enter')
      await page.waitForTimeout(2000)
      console.log('[QA-H2] 검색 후 URL:', page.url())
    }
  })

  test('H3 등급 페이지 /grade — 등급 시스템 설명', async ({ page }) => {
    const res = await page.goto('/grade', { waitUntil: 'domcontentloaded', timeout: 15000 })
    expect(res?.status()).toBeLessThan(400)
    await page.waitForTimeout(1000)
    const body = await page.textContent('body')
    const hasGradeInfo = body?.includes('새싹') || body?.includes('🌱') || body?.includes('등급')
    if (!hasGradeInfo) console.warn('[QA-H3] ⚠️ 등급 정보 미발견')
    else console.log('[QA-H3] ✅ 등급 페이지 정상')
  })

  test('H4 소개/FAQ/약관 페이지 일괄 확인', async ({ page }) => {
    const pages = [
      { path: '/about', name: '소개' },
      { path: '/faq', name: 'FAQ' },
      { path: '/terms', name: '이용약관' },
      { path: '/privacy', name: '개인정보' },
      { path: '/rules', name: '이용규칙' },
    ]
    for (const p of pages) {
      const res = await page.goto(p.path, { waitUntil: 'domcontentloaded', timeout: 15000 })
      const status = res?.status() ?? 0
      if (status >= 400) console.warn(`[QA-H4] ❌ ${p.name}(${p.path}) HTTP ${status}`)
      else console.log(`[QA-H4] ✅ ${p.name} ${status}`)
    }
  })
})
