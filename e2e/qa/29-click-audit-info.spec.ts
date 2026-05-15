/**
 * BATCH D — 인증·온보딩·정보·법적 페이지 전체 클릭 감사 (2026-05-15)
 * 검증: /login / /onboarding / /about / /faq / /grade / /contact / /landing / 법적 유틸
 * 대상: qa-ios-webkit (390×844) / qa-galaxy (412×915) / qa-audit-user-full (1440×900)
 *
 * 실행:
 *   npx playwright test e2e/qa/29-click-audit-info.spec.ts \
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
  await page.screenshot({ path: path.join(dir, `29-${name}.png`), fullPage: false })
}

// user.json 유효성 검증 (RISK-1) — 일부 테스트에서만 사용
test.beforeAll(async ({ browser }) => {
  if (!fs.existsSync(USER_AUTH)) {
    console.warn('[WARN] user.json 없음 — 비로그인 테스트만 실행')
    return
  }
  const ctx = await browser.newContext({ storageState: USER_AUTH })
  const page = await ctx.newPage()
  const res = await page.goto(`${BASE}/my`, { waitUntil: 'domcontentloaded' })
  const url = res?.url() ?? page.url()
  await ctx.close()
  if (url.includes('/login')) {
    console.warn('[WARN] user.json 만료 — 인증 필요 테스트 실패 예상')
  }
})

// 상태 초기화 (RISK-3)
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => { sessionStorage.clear() })
})

// ══════════════════════════════════════════════════════════════════
// 1. /login — 페이지 렌더링 + 카카오 버튼 크기
// ══════════════════════════════════════════════════════════════════
test('로그인 — 카카오 버튼 존재 + 둘러보기 링크', async ({ browser }, testInfo) => {
  const ctx = await browser.newContext()
  const page = await ctx.newPage()
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' })
  await ss(page, '01-login', testInfo)

  // 카카오 로그인 버튼 (실제 클릭 금지 — OAuth 외부 리다이렉트)
  const kakaoBtn = page.locator('button:has-text("카카오"), button[aria-label*="카카오"], a:has-text("카카오로 시작")').first()
  if (await kakaoBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    const box = await kakaoBtn.boundingBox()
    const ok = (box?.height ?? 0) >= 52
    console.log(`${ok ? '✅' : '❌ [P2]'} 카카오 버튼: h=${box?.height?.toFixed(0)}px`)
  } else {
    console.warn('[INFO] 카카오 버튼 미감지 — selector 확인 필요')
  }

  // "먼저 둘러볼게요" 링크 → /
  const browseLink = page.locator('a[href="/"], a:has-text("둘러"), button:has-text("둘러")').first()
  if (await browseLink.isVisible({ timeout: 2000 }).catch(() => false)) {
    const href = await browseLink.getAttribute('href')
    console.log(`✅ 둘러보기: href="${href}"`)
  } else {
    console.warn('[INFO] 둘러보기 링크 없음')
  }
  await ctx.close()
})

// ══════════════════════════════════════════════════════════════════
// 2. /onboarding — Step 1 닉네임 유효성
// ══════════════════════════════════════════════════════════════════
test('온보딩 — Step 1 닉네임 유효성 + debounce', async ({ page }, testInfo) => {
  await page.goto(`${BASE}/onboarding`, { waitUntil: 'networkidle' })
  await ss(page, '02-onboarding-step1', testInfo)

  const nicknameInput = page.locator('input[placeholder*="닉네임"], input[type="text"]').first()
  if (!await nicknameInput.isVisible({ timeout: 5000 }).catch(() => false)) {
    // 온보딩은 로그인 + 미완료 상태에서만 접근 가능
    const url = page.url()
    console.warn(`[SKIP] 온보딩 input 없음 (이미 완료됐거나 접근 불가) — URL: ${url}`)
    return
  }

  // 1자 → "다음" 버튼 비활성화
  await nicknameInput.fill('테')
  await page.waitForTimeout(400)
  const nextBtn = page.locator('button:has-text("다음"), button:has-text("확인")').first()
  const disabled1 = !await nextBtn.isEnabled().catch(() => true)
  console.log(`${disabled1 ? '✅' : '❌ [P1]'} 닉네임 1자 → 다음 버튼 비활성화`)

  // 특수문자 → 에러
  await nicknameInput.fill('테스트!')
  await page.waitForTimeout(400)
  const errorMsg = page.locator('[class*="error"], [class*="Error"], text=허용되지 않는, text=한글, text=영문')
  if (await errorMsg.first().isVisible({ timeout: 1000 }).catch(() => false)) {
    console.log(`✅ 특수문자 → 에러 메시지 표시`)
  }

  // 정상 닉네임 (2~10자 한글)
  await nicknameInput.fill('테스트닉네임')
  await page.waitForTimeout(500) // debounce 300ms + 서버 응답
  await ss(page, '02-onboarding-nickname-valid', testInfo)

  // 중복 여부는 서버에 따라 다름 — 상태만 로깅
  const validIcon = page.locator('[class*="valid"], [class*="success"], text=사용 가능')
  const dupError = page.locator('text=이미 사용, text=중복, text=사용할 수 없')
  if (await validIcon.first().isVisible({ timeout: 2000 }).catch(() => false)) {
    console.log('✅ 닉네임 중복 확인: 사용 가능')
  } else if (await dupError.first().isVisible({ timeout: 2000 }).catch(() => false)) {
    console.log('[INFO] 닉네임 중복 — 다른 닉네임 필요')
  } else {
    console.log('[INFO] 닉네임 유효성 상태 미감지 (checking 중)')
  }
})

// ══════════════════════════════════════════════════════════════════
// 3. /onboarding — Step 2 약관 체크박스 (미완료 유저만 접근)
// ══════════════════════════════════════════════════════════════════
test('온보딩 — Step 2 약관 전체동의 + 보기 링크', async ({ page }, testInfo) => {
  await page.goto(`${BASE}/onboarding`, { waitUntil: 'networkidle' })

  const nicknameInput = page.locator('input[placeholder*="닉네임"], input[type="text"]').first()
  if (!await nicknameInput.isVisible({ timeout: 3000 }).catch(() => false)) {
    console.warn('[SKIP] 온보딩 접근 불가 (이미 완료)')
    return
  }

  // Step 1 → Step 2 이동
  await nicknameInput.fill('QA테스터임시')
  await page.waitForTimeout(600)
  const nextBtn = page.locator('button:has-text("다음")').first()
  if (await nextBtn.isEnabled({ timeout: 3000 }).catch(() => false)) {
    await nextBtn.click()
    await page.waitForTimeout(500)
    await ss(page, '03-onboarding-step2', testInfo)
  } else {
    console.warn('[SKIP] 닉네임 유효성 통과 안 됨 — Step 2 진입 불가')
    return
  }

  // 전체 동의 체크박스
  const allCheck = page.locator('input[type="checkbox"]:first-of-type, label:has-text("전체 동의")').first()
  if (await allCheck.isVisible({ timeout: 3000 }).catch(() => false)) {
    await allCheck.click({ force: true })
    await page.waitForTimeout(300)

    const allChecked = await page.locator('input[type="checkbox"]').evaluateAll(
      (els: HTMLInputElement[]) => els.every(el => el.checked)
    ).catch(() => false)
    console.log(`${allChecked ? '✅' : '⚠️'} 전체동의 → 모든 체크박스 체크됨: ${allChecked}`)
  }

  // 이용약관/개인정보 "보기" 링크 크기
  const viewLinks = page.locator('a[href*="/terms"], a:has-text("보기")').filter({ hasNotText: '개인' })
  const viewCount = await viewLinks.count()
  if (viewCount > 0) {
    const box = await viewLinks.first().boundingBox()
    const ok = (box?.width ?? 0) >= 52 && (box?.height ?? 0) >= 52
    console.log(`${ok ? '✅' : '❌ [P2]'} 약관 보기 링크: ${box?.width?.toFixed(0)}×${box?.height?.toFixed(0)}px`)
  }

  // "완료" 버튼 활성화 확인 (클릭 안 함 — 실제 가입 방지)
  const completeBtn = page.locator('button:has-text("완료"), button:has-text("시작")').first()
  const enabled = await completeBtn.isEnabled().catch(() => false)
  console.log(`${enabled ? '✅' : '❌ [P1]'} 완료 버튼 활성화 (필수 동의 후)`)
})

// ══════════════════════════════════════════════════════════════════
// 4. /about — CTA 버튼 + FAQ 아코디언
// ══════════════════════════════════════════════════════════════════
test('어바웃 — CTA 버튼 + FAQ 아코디언', async ({ page }, testInfo) => {
  await page.goto(`${BASE}/about`, { waitUntil: 'networkidle' })
  await ss(page, '04-about-initial', testInfo)

  // CTA 버튼 (로그인 시 커뮤니티 바로가기, 비로그인 시 카카오 가입)
  const ctaBtn = page.locator(
    'a[href="/community/stories"], button:has-text("가입"), button:has-text("커뮤니티"), button:has-text("카카오")'
  ).first()
  if (await ctaBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    const box = await ctaBtn.boundingBox()
    const ok = (box?.height ?? 0) >= 52
    const text = (await ctaBtn.textContent())?.trim()
    console.log(`${ok ? '✅' : '❌ [P2]'} about CTA "${text}": h=${box?.height?.toFixed(0)}px`)
  }

  // FAQ 아코디언 7개 펼침/접힘
  const faqItems = page.locator('[class*="accordion"], [class*="Accordion"], details, [class*="faq"]')
  const faqCount = await faqItems.count()
  console.log(`[INFO] FAQ 항목: ${faqCount}개`)

  if (faqCount > 0) {
    const firstItem = faqItems.first()
    // 클릭해서 열기
    const trigger = firstItem.locator('button, summary').first()
    if (await trigger.isVisible({ timeout: 1000 }).catch(() => false)) {
      await trigger.click()
      await page.waitForTimeout(400)
      await ss(page, '04-about-faq-open', testInfo)

      // 내용 표시 확인
      const content = firstItem.locator('[class*="content"], [class*="Content"], [class*="answer"]')
      const contentVisible = await content.first().isVisible({ timeout: 1000 }).catch(() => false)
      console.log(`${contentVisible ? '✅' : '⚠️'} FAQ 펼침 → 내용 표시`)

      // 다시 클릭 → 접힘
      await trigger.click()
      await page.waitForTimeout(300)
    }
  }

  // VALUE_CARDS 4개 링크
  const valueLinks = page.locator('a[href*="/community"], a[href*="/magazine"], a[href*="/jobs"], a[href*="/best"]')
  const linkCount = await valueLinks.count()
  console.log(`[INFO] about 가치 카드 링크: ${linkCount}개`)
})

// ══════════════════════════════════════════════════════════════════
// 5. /faq — 9개 아코디언 + 문의하기 버튼
// ══════════════════════════════════════════════════════════════════
test('FAQ — 아코디언 펼침/접힘 + 문의 버튼', async ({ page }, testInfo) => {
  await page.goto(`${BASE}/faq`, { waitUntil: 'networkidle' })
  await ss(page, '05-faq-initial', testInfo)

  const faqItems = page.locator('[class*="accordion"], [class*="Accordion"], details, [data-state]')
  const count = await faqItems.count()
  console.log(`[INFO] FAQ 아코디언: ${count}개`)

  // 첫 번째 항목 펼침
  if (count > 0) {
    const trigger = faqItems.first().locator('button, summary').first()
    if (await trigger.isVisible({ timeout: 2000 }).catch(() => false)) {
      await trigger.click()
      await page.waitForTimeout(400)
      await ss(page, '05-faq-open', testInfo)
      console.log('✅ FAQ 첫 번째 항목 펼침')
    }
  }

  // 문의하기 버튼 → BottomSheet
  const contactBtn = page.locator('button:has-text("문의"), a[href="/contact"]').first()
  if (await contactBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    const box = await contactBtn.boundingBox()
    const ok = (box?.height ?? 0) >= 52
    console.log(`${ok ? '✅' : '❌ [P2]'} 문의하기 버튼: h=${box?.height?.toFixed(0)}px`)
  }
})

// ══════════════════════════════════════════════════════════════════
// 6. /grade — 등급 카드 + 글쓰러 가기 CTA
// ══════════════════════════════════════════════════════════════════
test('등급 안내 — 카드 표시 + 글쓰러 가기 CTA', async ({ page }, testInfo) => {
  await page.goto(`${BASE}/grade`, { waitUntil: 'networkidle' })
  await ss(page, '06-grade', testInfo)

  // 4등급 카드
  const gradeCards = page.locator('[class*="grade"], [class*="Grade"], [class*="card"]').filter({ hasText: /씨앗|새싹|열매|나무|별|등급/ })
  const cardCount = await gradeCards.count()
  console.log(`[INFO] 등급 카드: ${cardCount}개`)

  // 글쓰러 가기 CTA
  const writeLink = page.locator('a[href*="/community/write"], a:has-text("글쓰러"), button:has-text("글쓰러")').first()
  if (await writeLink.isVisible({ timeout: 3000 }).catch(() => false)) {
    const box = await writeLink.boundingBox()
    const ok = (box?.height ?? 0) >= 52
    console.log(`${ok ? '✅' : '❌ [P2]'} 글쓰러 가기 CTA: h=${box?.height?.toFixed(0)}px`)
  } else {
    console.warn('[INFO] 글쓰러 가기 CTA 없음')
  }
})

// ══════════════════════════════════════════════════════════════════
// 7. /contact — 문의 BottomSheet + 유효성
// ══════════════════════════════════════════════════════════════════
test('문의 — BottomSheet 열기 + 10자 미만 비활성화', async ({ page }, testInfo) => {
  await page.goto(`${BASE}/contact`, { waitUntil: 'networkidle' })
  await ss(page, '07-contact-initial', testInfo)

  const contactBtn = page.locator('button:has-text("서비스 문의"), button:has-text("문의하기")').first()
  if (!await contactBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    console.warn('[SKIP] 문의하기 버튼 없음')
    return
  }

  const box = await contactBtn.boundingBox()
  const ok = (box?.height ?? 0) >= 52
  console.log(`${ok ? '✅' : '❌ [P2]'} 문의하기 버튼: h=${box?.height?.toFixed(0)}px`)

  await contactBtn.click()
  await page.waitForTimeout(600)
  await ss(page, '07-contact-sheet', testInfo)

  // 시트 내 textarea
  const textarea = page.locator('[role="dialog"] textarea, [data-state="open"] textarea').first()
  if (!await textarea.isVisible({ timeout: 3000 }).catch(() => false)) {
    console.warn('[INFO] 문의 textarea 없음')
    return
  }

  // 9자 → 전송 버튼 비활성화
  await textarea.fill('짧은문의')
  await page.waitForTimeout(200)
  const sendBtn = page.locator('button:has-text("보내기"), button:has-text("전송"), button:has-text("문의 보내기")').last()
  const disabled9 = !await sendBtn.isEnabled().catch(() => true)
  console.log(`${disabled9 ? '✅' : '❌ [P1]'} 9자 이하 → 전송 버튼 비활성화`)

  // 10자+ → 활성화
  await textarea.fill('문의드립니다. 이 내용은 열 자 이상입니다.')
  await page.waitForTimeout(200)
  const enabled10 = await sendBtn.isEnabled().catch(() => false)
  console.log(`${enabled10 ? '✅' : '❌ [P1]'} 10자 이상 → 전송 버튼 활성화`)
  // 실제 전송 안 함
  await page.keyboard.press('Escape')
})

// ══════════════════════════════════════════════════════════════════
// 8. /landing — t 파라미터 + 비로그인 공감/댓글 → SignupModal (RISK-6)
// ══════════════════════════════════════════════════════════════════
test('랜딩 — t 파라미터 바리에이션 + 공감 → SignupModal', async ({ browser }, testInfo) => {
  test.setTimeout(90_000)
  const ctx = await browser.newContext()
  const page = await ctx.newPage()
  page.setDefaultTimeout(8000)
  await page.addInitScript(() => { sessionStorage.clear() })

  try {
    await page.goto(`${BASE}/landing?t=relation`, { waitUntil: 'domcontentloaded', timeout: 20000 })
    const h1 = page.locator('h1, h2, [class*="title"]').first()
    const titleText = await h1.textContent({ timeout: 5000 }).catch(() => '')
    console.log(`✅ landing?t=relation — 헤드라인: "${titleText?.trim().substring(0, 30)}"`)

    // 공감하기 버튼 → SignupModal (P2 — h-[44px])
    const likeBtn = page.locator('button:has-text("공감하기")').first()
    if (await likeBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      const box = await likeBtn.boundingBox()
      const ok = (box?.height ?? 0) >= 52
      console.log(`${ok ? '✅' : '❌ [P2]'} 공감하기 버튼: h=${box?.height?.toFixed(0)}px (기준 52px)`)

      await likeBtn.click({ force: true })
      await page.waitForTimeout(400)
      const modal = page.locator('[role="dialog"], [class*="SignupModal"], [class*="modal"]')
      if (await modal.first().isVisible({ timeout: 2000 }).catch(() => false)) {
        console.log('✅ 비로그인 공감 → SignupModal 표시')
        const closeBtn = modal.first().locator('button[aria-label*="닫기"], button:has-text("×"), button:has-text("✕")').first()
        if (await closeBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
          const closeBtnBox = await closeBtn.boundingBox()
          const closeOk = (closeBtnBox?.height ?? 0) >= 52
          console.log(`${closeOk ? '✅' : '❌ [P2]'} SignupModal 닫기 버튼: h=${closeBtnBox?.height?.toFixed(0)}px`)
          await closeBtn.click()
        } else {
          await page.keyboard.press('Escape')
        }
      } else {
        console.warn('[INFO] SignupModal 미감지 (구현 방식 다를 수 있음)')
      }
    }
    await ss(page, '08-landing', testInfo)
  } finally {
    await ctx.close()
  }
})

// ══════════════════════════════════════════════════════════════════
// 9. 법적 유틸 페이지 200 + 렌더링 확인
// ══════════════════════════════════════════════════════════════════
test('법적 유틸 페이지 — 200 응답 + 콘텐츠 렌더링', async ({ browser }, testInfo) => {
  const ctx = await browser.newContext()
  const page = await ctx.newPage()

  const pages = [
    { path: '/privacy', check: 'table, [class*="table"], p' },
    { path: '/terms', check: 'ul, ol, p' },
    { path: '/rules', check: 'ul, ol, p' },
    { path: '/offline', check: 'button:has-text("다시 시도")' },
    { path: '/auth/error', check: 'button, a:has-text("로그인")' },
  ]

  for (const { path: pagePath, check } of pages) {
    const res = await page.goto(`${BASE}${pagePath}`, { waitUntil: 'domcontentloaded' })
    const status = res?.status() ?? 0
    const content = page.locator(check)
    const contentVisible = await content.first().isVisible({ timeout: 3000 }).catch(() => false)
    console.log(`${status === 200 ? '✅' : '❌ [P0]'} ${pagePath}: HTTP ${status} | 콘텐츠: ${contentVisible ? '있음' : '없음'}`)
  }

  // /community → 308 /community/stories redirect
  await page.goto(`${BASE}/community`, { waitUntil: 'domcontentloaded' })
  const finalUrl = page.url()
  console.log(`${finalUrl.includes('/community/stories') ? '✅' : '❌ [P1]'} /community → ${finalUrl}`)

  await ss(page, '09-legal-pages', testInfo)
  await ctx.close()
})

// ══════════════════════════════════════════════════════════════════
// 10. /offline — 다시 시도 버튼 크기
// ══════════════════════════════════════════════════════════════════
test('오프라인 페이지 — 다시 시도 버튼 52px', async ({ browser }, testInfo) => {
  const ctx = await browser.newContext()
  const page = await ctx.newPage()
  await page.goto(`${BASE}/offline`, { waitUntil: 'domcontentloaded' })
  await ss(page, '10-offline', testInfo)

  const retryBtn = page.locator('button:has-text("다시 시도"), a:has-text("다시 시도")').first()
  if (await retryBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    const box = await retryBtn.boundingBox()
    const ok = (box?.height ?? 0) >= 52
    console.log(`${ok ? '✅' : '❌ [P2]'} 다시 시도 버튼: h=${box?.height?.toFixed(0)}px`)
  } else {
    console.warn('[INFO] 다시 시도 버튼 없음')
  }
  await ctx.close()
})
