/**
 * BATCH C — 마이페이지 전체 클릭 감사 (2026-05-15)
 * 검증: /my / /my/settings / /my/posts / /my/comments / /my/scraps / /my/notifications
 * 대상: qa-ios-webkit (390×844) / qa-galaxy (412×915) / qa-audit-user-full (1440×900)
 *
 * 실행:
 *   npx playwright test e2e/qa/28-click-audit-account.spec.ts \
 *     --project=qa-ios-webkit --project=qa-galaxy --project=qa-audit-user-full --reporter=line
 */
import { test, type Page, type TestInfo } from '@playwright/test'
import path from 'path'
import fs from 'fs'

const BASE = process.env.QA_AUDIT_URL ?? 'https://www.age-doesnt-matter.com'
const USER_AUTH = path.join(process.cwd(), 'e2e/.auth/user.json')

async function ss(page: Page, name: string, testInfo: TestInfo) {
  const device = testInfo.project.name
  const dir = path.join(process.cwd(), 'e2e/screenshots/audit', device)
  fs.mkdirSync(dir, { recursive: true })
  await page.screenshot({ path: path.join(dir, `28-${name}.png`), fullPage: false })
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
  await page.addInitScript(() => { sessionStorage.clear() })
})

// ══════════════════════════════════════════════════════════════════
// 1. 비로그인 — /my middleware redirect
// ══════════════════════════════════════════════════════════════════
test('비로그인 — /my middleware redirect', async ({ browser }) => {
  const ctx = await browser.newContext()
  const page = await ctx.newPage()
  await page.goto(`${BASE}/my`, { waitUntil: 'domcontentloaded' })
  const url = page.url()
  if (url.includes('/login')) {
    console.log(`✅ 비로그인 /my → /login redirect 정상`)
  } else {
    console.error(`❌ [P0 CRITICAL] 비로그인 /my 미들웨어 미보호! 현재 URL: ${url}`)
  }
  await ctx.close()
})

// ══════════════════════════════════════════════════════════════════
// 2. 마이페이지 — 메뉴 링크 + 등급 배지
// ══════════════════════════════════════════════════════════════════
test('마이페이지 — 메뉴 링크 전체', async ({ page }, testInfo) => {
  await page.goto(`${BASE}/my`, { waitUntil: 'networkidle' })
  await ss(page, '01-my-initial', testInfo)

  const menus = [
    { label: '내가 쓴 글', href: '/my/posts' },
    { label: '내 댓글', href: '/my/comments' },
    { label: '스크랩', href: '/my/scraps' },
    { label: '알림', href: '/my/notifications' },
    { label: '설정', href: '/my/settings' },
  ]

  for (const { label, href } of menus) {
    const link = page.locator(`a[href="${href}"]`).first()
    const visible = await link.isVisible({ timeout: 2000 }).catch(() => false)
    if (visible) {
      const box = await link.boundingBox()
      const ok = (box?.height ?? 0) >= 52
      console.log(`${ok ? '✅' : '❌ [P2]'} "${label}" 링크: h=${box?.height?.toFixed(0)}px`)
    } else {
      // 텍스트로 재탐색
      const textLink = page.locator(`a:has-text("${label}")`).first()
      const textVisible = await textLink.isVisible({ timeout: 1000 }).catch(() => false)
      console.log(`${textVisible ? '✅' : '⚠️'} "${label}" 링크 (text 탐색): visible=${textVisible}`)
    }
  }

  // 등급 배지 → /grade 링크
  const gradeLink = page.locator('a[href="/grade"]').first()
  if (await gradeLink.isVisible({ timeout: 2000 }).catch(() => false)) {
    console.log('✅ 등급 배지 /grade 링크 존재')
  }
})

// ══════════════════════════════════════════════════════════════════
// 3. 마이페이지 — 각 메뉴 진입 + 빈 상태 확인
// ══════════════════════════════════════════════════════════════════
test('마이페이지 — 내 글/댓글/스크랩 진입', async ({ page }, testInfo) => {
  const subPages = [
    { path: '/my/posts', label: '내 글', emptyText: '첫 글' },
    { path: '/my/comments', label: '내 댓글', emptyText: '댓글' },
    { path: '/my/scraps', label: '스크랩', emptyText: '스크랩' },
  ]

  for (const { path: subPath, label, emptyText } of subPages) {
    await page.goto(`${BASE}${subPath}`, { waitUntil: 'networkidle' })
    await ss(page, `02-my-${label}`, testInfo)

    // 카드 또는 빈 상태
    const cards = page.locator('[class*="PostCard"], [class*="CommentCard"], article')
    const cardCount = await cards.count()

    if (cardCount > 0) {
      const firstCard = cards.first()
      const link = firstCard.locator('a').first()
      if (await link.isVisible({ timeout: 1000 }).catch(() => false)) {
        const href = await link.getAttribute('href') ?? ''
        console.log(`✅ "${label}" 카드 href: ${href}`)
      } else {
        console.log(`✅ "${label}" 카드 ${cardCount}개 존재`)
      }
    } else {
      const empty = page.locator(`text=/${emptyText}/i, [class*="empty"], [class*="Empty"]`)
      const emptyVisible = await empty.first().isVisible({ timeout: 2000 }).catch(() => false)
      console.log(`${emptyVisible ? '✅' : '⚠️'} "${label}" 빈 상태 안내 표시: ${emptyVisible}`)
    }
  }
})

// ══════════════════════════════════════════════════════════════════
// 4. 알림 — 목록 + 모두읽음
// ══════════════════════════════════════════════════════════════════
test('알림 — 목록 + 모두읽음 버튼', async ({ page }, testInfo) => {
  await page.goto(`${BASE}/my/notifications`, { waitUntil: 'networkidle' })
  await ss(page, '03-notifications', testInfo)

  const notifications = page.locator('[class*="notification"], [class*="Notification"], li[class*="item"]')
  const count = await notifications.count()
  console.log(`[INFO] 알림 개수: ${count}개`)

  if (count === 0) {
    const empty = page.locator('text=알림이 없, text=아직 알림')
    const emptyVisible = await empty.first().isVisible({ timeout: 2000 }).catch(() => false)
    console.log(`${emptyVisible ? '✅' : '⚠️'} 알림 빈 상태 안내: ${emptyVisible}`)
    return
  }

  // 모두읽음 버튼
  const readAllBtn = page.locator('button:has-text("모두 읽음"), button[aria-label*="모두"]').first()
  if (await readAllBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
    await readAllBtn.click()
    await page.waitForTimeout(600)
    console.log('✅ 모두읽음 클릭 완료')
  } else {
    console.log('[INFO] 모두읽음 버튼 없음 (미읽 알림 없거나 버전 차이)')
  }

  // 첫 번째 알림 클릭 → 이동
  const firstNotif = notifications.first()
  if (await firstNotif.isVisible({ timeout: 2000 }).catch(() => false)) {
    const link = firstNotif.locator('a').first()
    if (await link.isVisible({ timeout: 1000 }).catch(() => false)) {
      const href = await link.getAttribute('href') ?? ''
      console.log(`[INFO] 첫 알림 링크: ${href}`)
    }
  }
})

// ══════════════════════════════════════════════════════════════════
// 5. 설정 — 닉네임 변경 유효성
// ══════════════════════════════════════════════════════════════════
test('설정 — 닉네임 유효성 (1자/13자 차단)', async ({ page }, testInfo) => {
  await page.goto(`${BASE}/my/settings`, { waitUntil: 'networkidle' })
  await ss(page, '04-settings-initial', testInfo)

  const nicknameInput = page.locator('input[placeholder*="닉네임"], input[aria-label*="닉네임"]').first()
  if (!await nicknameInput.isVisible({ timeout: 3000 }).catch(() => false)) {
    console.warn('[SKIP] 닉네임 input 없음')
    return
  }

  // 30일 제한으로 disabled 처리된 경우 skip
  const isEnabled = await nicknameInput.isEnabled().catch(() => false)
  if (!isEnabled) {
    console.log('✅ 닉네임 입력 비활성화 (30일 제한 적용 중)')
    return
  }

  // 1자 → 버튼 비활성화
  await nicknameInput.fill('테')
  await page.waitForTimeout(400)
  const submitBtn = page.locator('button:has-text("변경"), button:has-text("저장")').first()
  const disabled1 = !await submitBtn.isEnabled().catch(() => true)
  console.log(`${disabled1 ? '✅' : '❌ [P1]'} 닉네임 1자 → 변경 버튼 비활성화`)

  // 13자 → maxLength=12 차단
  await nicknameInput.fill('가'.repeat(13))
  const val = await nicknameInput.inputValue()
  console.log(`${val.length <= 12 ? '✅' : '❌ [P1]'} 닉네임 maxLength=12 (실제 ${val.length}자)`)

  await ss(page, '04-settings-nickname', testInfo)
})

// ══════════════════════════════════════════════════════════════════
// 6. 설정 — 글자크기 라디오 3개
// ══════════════════════════════════════════════════════════════════
test('설정 — 글자크기 라디오 + localStorage', async ({ page }) => {
  await page.goto(`${BASE}/my/settings`, { waitUntil: 'networkidle' })

  const fontRadios = page.locator('input[type="radio"][name*="font"], input[type="radio"][value*="font"], label:has-text("크게"), label:has-text("기본"), label:has-text("최대")')
  const count = await fontRadios.count()
  console.log(`[INFO] 글자크기 라디오: ${count}개`)

  if (count === 0) {
    // 버튼형 글자크기 UI
    const fontBtns = page.locator('button:has-text("기본"), button:has-text("크게"), button:has-text("최대")')
    const btnCount = await fontBtns.count()
    if (btnCount > 0) {
      await fontBtns.nth(1).click()
      await page.waitForTimeout(300)
      const stored = await page.evaluate(() => localStorage.getItem('fontSize') ?? localStorage.getItem('una-font-size') ?? '없음')
      console.log(`✅ 글자크기 버튼 클릭 → localStorage: ${stored}`)
    } else {
      console.warn('[INFO] 글자크기 UI 미감지')
    }
    return
  }

  // 라디오형
  await fontRadios.first().click()
  await page.waitForTimeout(300)
  console.log('✅ 글자크기 라디오 클릭')
})

// ══════════════════════════════════════════════════════════════════
// 7. 설정 — 성별/지역 공개 토글
// ══════════════════════════════════════════════════════════════════
test('설정 — 성별/지역 공개 토글', async ({ page }, testInfo) => {
  await page.goto(`${BASE}/my/settings`, { waitUntil: 'networkidle' })
  await ss(page, '05-settings-privacy', testInfo)

  const toggles = page.locator('button[role="switch"], input[type="checkbox"][aria-label*="공개"]')
  const toggleCount = await toggles.count()
  console.log(`[INFO] 프라이버시 토글: ${toggleCount}개`)

  for (let i = 0; i < Math.min(toggleCount, 2); i++) {
    const toggle = toggles.nth(i)
    const label = await toggle.getAttribute('aria-label') ?? `토글${i + 1}`
    const beforeChecked = await toggle.isChecked().catch(() =>
      toggle.getAttribute('aria-checked').then(v => v === 'true')
    )
    await toggle.click({ force: true })
    await page.waitForTimeout(800)
    const afterChecked = await toggle.isChecked().catch(() =>
      toggle.getAttribute('aria-checked').then(v => v === 'true')
    )
    const toggled = beforeChecked !== afterChecked
    console.log(`${toggled ? '✅' : '⚠️'} "${label}" 토글: ${beforeChecked} → ${afterChecked}`)
    // 롤백 (원복)
    await toggle.click({ force: true })
    await page.waitForTimeout(400)
  }
})

// ══════════════════════════════════════════════════════════════════
// 8. 설정 — 차단 사용자 목록
// ══════════════════════════════════════════════════════════════════
test('설정 — 차단 사용자 목록 렌더링', async ({ page }) => {
  await page.goto(`${BASE}/my/settings`, { waitUntil: 'networkidle' })

  const blockedSection = page.locator('section:has-text("차단"), h3:has-text("차단"), h2:has-text("차단")')
  if (!await blockedSection.first().isVisible({ timeout: 3000 }).catch(() => false)) {
    console.warn('[INFO] 차단 섹션 없음 — 설정 페이지 구조 확인 필요')
    return
  }

  const blockedUsers = page.locator('[class*="blocked"], button:has-text("차단 해제")')
  const count = await blockedUsers.count()
  console.log(`[INFO] 차단 사용자: ${count}명`)

  if (count === 0) {
    console.log('✅ 차단 목록 비어있음 (정상)')
  } else {
    const unblockBtn = page.locator('button:has-text("차단 해제")').first()
    if (await unblockBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
      const box = await unblockBtn.boundingBox()
      const ok = (box?.height ?? 0) >= 52
      console.log(`${ok ? '✅' : '❌ [P2]'} 차단 해제 버튼: h=${box?.height?.toFixed(0)}px`)
    }
  }
})

// ══════════════════════════════════════════════════════════════════
// 9. 설정 — 회원탈퇴 모달 (실제 탈퇴 실행 안 함)
// ══════════════════════════════════════════════════════════════════
test('설정 — 회원탈퇴 모달 열기 + 취소', async ({ page }, testInfo) => {
  await page.goto(`${BASE}/my/settings`, { waitUntil: 'networkidle' })
  await ss(page, '06-settings-withdraw', testInfo)

  const withdrawBtn = page.locator('button:has-text("탈퇴"), button:has-text("회원탈퇴"), button[aria-label*="탈퇴"]').first()
  if (!await withdrawBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    console.warn('[INFO] 회원탈퇴 버튼 없음 (스크롤 아래 있을 수 있음)')
    return
  }

  await withdrawBtn.click()
  await page.waitForTimeout(600)

  // 탈퇴 확인 모달/UI 표시
  const modal = page.locator('[role="dialog"], [class*="modal"], [class*="Modal"]')
  const confirmText = page.locator('text=탈퇴, text=정말, text=확인')
  const modalVisible = await modal.first().isVisible({ timeout: 2000 }).catch(() => false)
  const textVisible = await confirmText.first().isVisible({ timeout: 2000 }).catch(() => false)

  console.log(`${modalVisible || textVisible ? '✅' : '⚠️'} 탈퇴 확인 UI 표시`)
  await ss(page, '06-settings-withdraw-modal', testInfo)

  // 취소 클릭 (실제 탈퇴 실행 금지)
  const cancelBtn = page.locator('button:has-text("취소"), button:has-text("아니오"), button[aria-label*="취소"]').first()
  if (await cancelBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
    await cancelBtn.click()
    await page.waitForTimeout(400)
    console.log('✅ 탈퇴 취소 클릭 — 모달 닫힘')
  } else {
    await page.keyboard.press('Escape')
    console.log('✅ ESC로 탈퇴 모달 닫기')
  }
})

// ══════════════════════════════════════════════════════════════════
// 10. 마이페이지 — 로그아웃 (confirm 있으면 취소, 없으면 스킵)
// ══════════════════════════════════════════════════════════════════
test('마이페이지 — 로그아웃 버튼 존재 확인', async ({ page }, testInfo) => {
  await page.goto(`${BASE}/my`, { waitUntil: 'networkidle' })

  const logoutBtn = page.locator('button:has-text("로그아웃"), a:has-text("로그아웃")').first()
  if (!await logoutBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    // 하단 스크롤 후 재탐색
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
    await page.waitForTimeout(300)
  }

  if (await logoutBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
    const box = await logoutBtn.boundingBox()
    console.log(`✅ 로그아웃 버튼 존재: ${box?.width?.toFixed(0)}×${box?.height?.toFixed(0)}px`)
    // 실제 클릭 안 함 — user.json 세션 보호
  } else {
    console.warn('[INFO] 로그아웃 버튼 미감지')
  }
  await ss(page, '07-my-logout', testInfo)
})
