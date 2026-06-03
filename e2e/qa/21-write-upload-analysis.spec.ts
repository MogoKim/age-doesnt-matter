/**
 * 글쓰기 모바일 UX 분석 스크립트 (2026-05-14)
 * 이미지/동영상 업로드 포함 전체 흐름 스크린샷 수집 + 이슈 감지
 * 실행: npx playwright test e2e/qa/write-upload-analysis.spec.ts --project=qa-write-mobile --headed
 */
import { test } from '@playwright/test'
import path from 'path'
import fs from 'fs'

const BASE_URL = process.env.E2E_BASE_URL ?? 'https://www.age-doesnt-matter.com'
const SCREENSHOTS_DIR = path.join(process.cwd(), 'e2e/screenshots/write-analysis')

test.use({
  storageState: 'e2e/.auth/user.json',
  viewport: { width: 390, height: 844 },
})

test.beforeAll(() => {
  fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true })
})

async function ss(page: import('@playwright/test').Page, name: string) {
  const filePath = path.join(SCREENSHOTS_DIR, `${name}.png`)
  await page.screenshot({ path: filePath, fullPage: false })
  console.log(`[SS] ${name}.png`)
}

async function dismissDraft(page: import('@playwright/test').Page) {
  const newBtn = page.locator('button', { hasText: '새로 작성하기' })
  if (await newBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
    await newBtn.click()
    await page.waitForTimeout(500)
  }
}

// ──────────────────────────────────────────────
// 1. 초기 진입 상태
// ──────────────────────────────────────────────
test('01 초기 진입 레이아웃', async ({ page }) => {
  await page.goto(`${BASE_URL}/community/write`)
  await page.waitForLoadState('networkidle')
  await dismissDraft(page)
  await ss(page, '01-initial')

  // GNB, header, footer 숨김 확인
  const gnb = page.locator('nav[aria-label="주요 메뉴"]')
  const header = page.locator('header').first()
  const isGnbHidden = await gnb.isHidden().catch(() => true)
  const isHeaderHidden = await header.isHidden().catch(() => true)
  console.log(`GNB 숨김: ${isGnbHidden}, 헤더 숨김: ${isHeaderHidden}`)
})

// ──────────────────────────────────────────────
// 2. 게시판 선택 BottomSheet
// ──────────────────────────────────────────────
test('02 게시판 선택 BottomSheet', async ({ page }) => {
  await page.goto(`${BASE_URL}/community/write`)
  await page.waitForLoadState('networkidle')
  await dismissDraft(page)

  // 게시판 선택 버튼 클릭
  const boardBtn = page.locator('button', { hasText: /게시판 선택|사는이야기|2막준비|웃음방/ }).first()
  if (await boardBtn.isVisible({ timeout: 3000 })) {
    await boardBtn.click()
    await page.waitForTimeout(600)
    await ss(page, '02-board-sheet-open')

    // 사는이야기 선택
    const storiesOption = page.locator('button', { hasText: '사는이야기' })
    if (await storiesOption.isVisible({ timeout: 2000 })) {
      await storiesOption.click()
      await page.waitForTimeout(400)
      await ss(page, '02-board-selected')
    }
  } else {
    await ss(page, '02-board-btn-not-found')
    console.warn('[WARN] 게시판 선택 버튼을 찾지 못했습니다')
  }
})

// ──────────────────────────────────────────────
// 3. 제목 입력 + 키보드 상태
// ──────────────────────────────────────────────
test('03 제목 입력 키보드 상태', async ({ page }) => {
  await page.goto(`${BASE_URL}/community/write?board=stories`)
  await page.waitForLoadState('networkidle')
  await dismissDraft(page)

  const titleInput = page.locator('textarea[placeholder*="제목"], input[placeholder*="제목"]').first()
  if (await titleInput.isVisible({ timeout: 3000 })) {
    await titleInput.click()
    await page.waitForTimeout(800) // 키보드 올라오는 시간
    await ss(page, '03-title-focused')
    await titleInput.fill('테스트 글 제목입니다')
    await page.waitForTimeout(300)
    await ss(page, '03-title-typed')
  } else {
    console.warn('[WARN] 제목 입력 필드를 찾지 못했습니다')
    await ss(page, '03-title-not-found')
  }
})

// ──────────────────────────────────────────────
// 4. 에디터 툴바 위치 확인
// ──────────────────────────────────────────────
test('04 에디터 툴바 위치', async ({ page }) => {
  await page.goto(`${BASE_URL}/community/write?board=stories`)
  await page.waitForLoadState('networkidle')
  await dismissDraft(page)

  // 에디터 클릭
  const editor = page.locator('.ProseMirror, [contenteditable="true"]').first()
  if (await editor.isVisible({ timeout: 3000 })) {
    await editor.click()
    await page.waitForTimeout(800)
    await ss(page, '04-editor-focused-toolbar')

    // 툴바 위치 정보 수집
    const toolbar = page.locator('[class*="toolbar"], [class*="Toolbar"]').first()
    if (await toolbar.isVisible({ timeout: 1000 }).catch(() => false)) {
      const box = await toolbar.boundingBox()
      console.log(`[INFO] 툴바 위치: top=${box?.y}px, bottom=${(box?.y ?? 0) + (box?.height ?? 0)}px, height=${box?.height}px`)
      console.log(`[INFO] 화면 높이: 844px, 툴바가 하단 ${844 - ((box?.y ?? 0) + (box?.height ?? 0))}px 위에 있음`)
    }

    // 긴 텍스트 입력 후 스크롤 상태
    await editor.fill('가나다라마바사아자차카타파하 '.repeat(20))
    await page.waitForTimeout(400)
    await ss(page, '04-editor-long-text')
  } else {
    console.warn('[WARN] 에디터를 찾지 못했습니다')
    await ss(page, '04-editor-not-found')
  }
})

// ──────────────────────────────────────────────
// 5. 이미지 업로드
// ──────────────────────────────────────────────
test('05 이미지 업로드', async ({ page }) => {
  await page.goto(`${BASE_URL}/community/write?board=stories`)
  await page.waitForLoadState('networkidle')
  await dismissDraft(page)

  const testImagePath = path.join(process.cwd(), 'e2e/fixtures/test-image.jpg')

  // 이미지 업로드 input 찾기
  const imageInput = page.locator('input[type="file"][accept*="image"]').first()
  await ss(page, '05-before-upload')

  // 이미지 버튼 클릭으로 input trigger
  const imageBtn = page.locator('button[aria-label*="이미지"], button[title*="이미지"], label[aria-label*="이미지"]').first()
  if (await imageBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
    console.log('[INFO] 이미지 버튼 발견 — 클릭')
    await ss(page, '05-image-btn-visible')
  }

  // setInputFiles로 파일 선택 (dialog 우회)
  await Promise.all([
    imageInput.setInputFiles(testImagePath).catch(async () => {
      // input이 숨어있을 경우 강제 주입
      await page.evaluate(() => {
        const inputs = document.querySelectorAll('input[type="file"]')
        console.log(`Found ${inputs.length} file inputs`)
      })
    }),
    Promise.resolve(null),
  ])

  await page.waitForTimeout(2000) // 업로드 시간
  await ss(page, '05-after-upload')

  // 에디터 내 이미지 확인
  const editorImg = page.locator('.ProseMirror img, [contenteditable] img').first()
  const imgVisible = await editorImg.isVisible({ timeout: 3000 }).catch(() => false)
  console.log(`[INFO] 에디터 내 이미지 표시: ${imgVisible}`)

  if (imgVisible) {
    const imgSrc = await editorImg.getAttribute('src')
    console.log(`[INFO] 이미지 src: ${imgSrc?.substring(0, 80)}...`)
    const naturalWidth = await editorImg.evaluate((el: HTMLImageElement) => el.naturalWidth)
    console.log(`[INFO] 이미지 naturalWidth: ${naturalWidth} (0이면 로드 실패)`)
  }

  await ss(page, '05-upload-result')
})

// ──────────────────────────────────────────────
// 6. 이미지 업로드 버튼 UI 확인
// ──────────────────────────────────────────────
test('06 업로드 버튼 및 툴바 UI 스캔', async ({ page }) => {
  await page.goto(`${BASE_URL}/community/write?board=stories`)
  await page.waitForLoadState('networkidle')
  await dismissDraft(page)

  // 에디터 클릭해서 툴바 활성화
  const editor = page.locator('.ProseMirror, [contenteditable="true"]').first()
  if (await editor.isVisible({ timeout: 3000 })) {
    await editor.click()
    await page.waitForTimeout(600)
  }

  // 모든 버튼 목록 수집
  const buttons = page.locator('button:visible')
  const count = await buttons.count()
  console.log(`[INFO] 화면에 보이는 버튼 수: ${count}`)
  for (let i = 0; i < Math.min(count, 20); i++) {
    const text = await buttons.nth(i).textContent()
    const label = await buttons.nth(i).getAttribute('aria-label')
    const box = await buttons.nth(i).boundingBox()
    if (box && box.height < 10) continue
    console.log(`  버튼[${i}]: text="${text?.trim()}" label="${label}" size=${box?.width?.toFixed(0)}×${box?.height?.toFixed(0)} pos=y${box?.y?.toFixed(0)}`)
  }

  await ss(page, '06-toolbar-scan')
})

// ──────────────────────────────────────────────
// 7. CTA 바 + 하단 영역 확인
// ──────────────────────────────────────────────
test('07 CTA 바 하단 레이아웃', async ({ page }) => {
  await page.goto(`${BASE_URL}/community/write?board=stories`)
  await page.waitForLoadState('networkidle')
  await dismissDraft(page)

  // 제목 + 내용 입력 (CTA bar 활성화 조건)
  const titleInput = page.locator('textarea[placeholder*="제목"], input[placeholder*="제목"]').first()
  if (await titleInput.isVisible({ timeout: 2000 })) {
    await titleInput.fill('테스트 제목')
  }
  const editor = page.locator('.ProseMirror, [contenteditable="true"]').first()
  if (await editor.isVisible({ timeout: 2000 })) {
    await editor.fill('테스트 내용입니다 열 자 이상이어야 합니다')
  }

  // 에디터 blur (키보드 내림 시뮬레이션)
  await page.keyboard.press('Escape')
  await page.waitForTimeout(600)
  await ss(page, '07-cta-bar-state')

  // CTA 바 위치 확인
  const ctaBar = page.locator('[class*="fixed"][class*="bottom"]').last()
  if (await ctaBar.isVisible({ timeout: 1000 }).catch(() => false)) {
    const box = await ctaBar.boundingBox()
    console.log(`[INFO] 하단 CTA 바: top=${box?.y}px, bottom=${(box?.y ?? 0) + (box?.height ?? 0)}px`)
    console.log(`[INFO] 화면 844px 기준 하단 여백: ${844 - ((box?.y ?? 0) + (box?.height ?? 0))}px`)
  }
})

// ──────────────────────────────────────────────
// 8. 에디터 진입 시 board=stories 미리 설정
// ──────────────────────────────────────────────
test('08 board param 미설정 시 게시판 선택 필수 확인', async ({ page }) => {
  await page.goto(`${BASE_URL}/community/write`)
  await page.waitForLoadState('networkidle')
  await dismissDraft(page)

  await ss(page, '08-no-board-param')

  // 등록 버튼 클릭 (게시판 미선택 상태)
  const submitBtn = page.locator('button', { hasText: /등록|게시|발행/ }).last()
  if (await submitBtn.isVisible({ timeout: 2000 })) {
    await submitBtn.click()
    await page.waitForTimeout(500)
    await ss(page, '08-submit-without-board')
    console.log('[INFO] 게시판 미선택 submit 시도 후 상태')
  }
})
