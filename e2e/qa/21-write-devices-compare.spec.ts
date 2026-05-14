/**
 * 글쓰기 모바일 UX — 기기별 비교 분석 (2026-05-14)
 * iPhone 16 Pro (402×874) vs Galaxy S24 Ultra (412×915) 화면 크기 검증
 *
 * 실행:
 *   npx playwright test e2e/qa/21-write-devices-compare.spec.ts \
 *     --project=qa-write-iphone16pro --project=qa-write-s24ultra --reporter=line
 */
import { test, expect } from '@playwright/test'
import path from 'path'
import fs from 'fs'

const BASE_URL = process.env.QA_AUDIT_URL ?? 'https://www.age-doesnt-matter.com'

// 기기 이름을 프로젝트명에서 추출 (스크린샷 저장 경로에 사용)
function getDeviceLabel(projectName: string): string {
  if (projectName.includes('iphone')) return 'iphone16pro'
  if (projectName.includes('s24'))    return 's24ultra'
  return 'unknown'
}

test.beforeAll(({ }, testInfo) => {
  const device = getDeviceLabel(testInfo.project.name)
  const dir = path.join(process.cwd(), 'e2e/screenshots/devices', device)
  fs.mkdirSync(dir, { recursive: true })
})

async function ss(page: import('@playwright/test').Page, name: string, testInfo: import('@playwright/test').TestInfo) {
  const device = getDeviceLabel(testInfo.project.name)
  const dir = path.join(process.cwd(), 'e2e/screenshots/devices', device)
  await page.screenshot({ path: path.join(dir, `${name}.png`), fullPage: false })
  console.log(`[${testInfo.project.name}] ${name}.png`)
}

async function dismissDraft(page: import('@playwright/test').Page) {
  const newBtn = page.locator('button', { hasText: '새로 작성하기' })
  if (await newBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
    await newBtn.click()
    await page.waitForTimeout(500)
  }
}

// ──────────────────────────────────────────────
// 1. 초기 화면 — above-the-fold 영역 분석
// ──────────────────────────────────────────────
test('01 초기 레이아웃 + above-the-fold', async ({ page, viewport }, testInfo) => {
  await page.goto(`${BASE_URL}/community/write?board=stories`)
  await page.waitForLoadState('networkidle')
  await dismissDraft(page)
  await ss(page, '01-initial', testInfo)

  const vw = viewport!.width
  const vh = viewport!.height
  console.log(`[INFO] 뷰포트: ${vw}×${vh}px`)

  // 카테고리 버튼 위치 — 첫 탭 불필요 스크롤 없이 보이는지
  const categoryBtn = page.locator('button', { hasText: '카테고리를 선택해주세요' })
  if (await categoryBtn.isVisible({ timeout: 2000 })) {
    const box = await categoryBtn.boundingBox()
    console.log(`[INFO] 카테고리 버튼: top=${box?.y?.toFixed(0)}px h=${box?.height?.toFixed(0)}px — 화면 내: ${(box?.y ?? 0) + (box?.height ?? 0) < vh ? '✅' : '❌ 잘림'}`)
  }

  // 에디터 입력 영역 — fold 내 여부
  const editor = page.locator('.ProseMirror, [contenteditable="true"]').first()
  if (await editor.isVisible({ timeout: 2000 })) {
    const box = await editor.boundingBox()
    const editorTop = box?.y ?? 0
    const editorBottom = editorTop + (box?.height ?? 0)
    const foldVisible = Math.min(editorBottom, vh) - editorTop
    console.log(`[INFO] 에디터: top=${editorTop.toFixed(0)}px, fold 내 노출=${foldVisible.toFixed(0)}px / ${box?.height?.toFixed(0)}px 전체`)
  }

  // 하단 CTA 바
  const ctaBar = page.locator('button', { hasText: '등록하기' }).last()
  if (await ctaBar.isVisible({ timeout: 1000 })) {
    const box = await ctaBar.boundingBox()
    console.log(`[INFO] 등록하기 버튼: top=${box?.y?.toFixed(0)}px h=${box?.height?.toFixed(0)}px`)
    console.log(`[INFO] 화면 하단 여백: ${vh - ((box?.y ?? 0) + (box?.height ?? 0))}px`)
  }
})

// ──────────────────────────────────────────────
// 2. 툴바 버튼 크기 정밀 측정
// ──────────────────────────────────────────────
test('02 툴바 버튼 크기 측정', async ({ page, viewport }, testInfo) => {
  await page.goto(`${BASE_URL}/community/write?board=stories`)
  await page.waitForLoadState('networkidle')
  await dismissDraft(page)

  // 에디터 클릭해서 툴바 포커스
  const editor = page.locator('.ProseMirror, [contenteditable="true"]').first()
  if (await editor.isVisible({ timeout: 3000 })) await editor.click()
  await page.waitForTimeout(400)
  await ss(page, '02-toolbar-focus', testInfo)

  const buttons = page.locator('button:visible')
  const count = await buttons.count()
  const vw = viewport!.width
  const vh = viewport!.height
  const TARGET = 52

  console.log(`\n[${testInfo.project.name}] 뷰포트: ${vw}×${vh}px — 버튼 기준: ${TARGET}px`)
  console.log('─'.repeat(70))

  let failCount = 0
  for (let i = 0; i < Math.min(count, 15); i++) {
    const btn = buttons.nth(i)
    const box = await btn.boundingBox()
    if (!box || box.height < 10) continue
    const text = (await btn.textContent())?.trim() ?? ''
    const label = await btn.getAttribute('aria-label') ?? ''
    const widthOk  = box.width  >= TARGET
    const heightOk = box.height >= TARGET
    const status = (widthOk && heightOk) ? '✅' : '❌'
    if (!widthOk || !heightOk) failCount++
    console.log(
      `${status} [${i}] "${text || label || '?'}" ${box.width.toFixed(0)}×${box.height.toFixed(0)}px` +
      (!widthOk  ? ` ← 폭 ${(TARGET - box.width).toFixed(0)}px 부족` : '') +
      (!heightOk ? ` ← 높이 ${(TARGET - box.height).toFixed(0)}px 부족` : '')
    )
  }
  console.log('─'.repeat(70))
  console.log(`[RESULT] 52px 미달 버튼: ${failCount}개`)
  // CLAUDE.md: 터치 타겟 최소 52×52px (시니어 친화 UI 원칙)
  expect(failCount, `52px 미달 버튼 ${failCount}개 — 위 로그에서 버튼명·크기 확인`).toBe(0)
})

// ──────────────────────────────────────────────
// 3. 카테고리 BottomSheet + 전체 입력 흐름
// ──────────────────────────────────────────────
test('03 카테고리 선택 + 제목 + 본문 입력 흐름', async ({ page, viewport }, testInfo) => {
  await page.goto(`${BASE_URL}/community/write?board=stories`)
  await page.waitForLoadState('networkidle')
  await dismissDraft(page)

  // 카테고리 선택
  const catBtn = page.locator('button', { hasText: '카테고리를 선택해주세요' })
  if (await catBtn.isVisible({ timeout: 2000 })) {
    await catBtn.click()
    await page.waitForTimeout(600)
    await ss(page, '03-category-sheet', testInfo)

    // SheetContent(role=dialog) 안의 버튼만 선택 — 헤더 .fixed 버튼과 분리
    const sheet = page.locator('[role="dialog"][data-state="open"]').last()
    const firstCat = sheet.locator('button').first()
    if (await firstCat.isVisible({ timeout: 2000 }).catch(() => false)) {
      await firstCat.click({ force: true })
      await page.waitForTimeout(400)
    }
  }

  // 제목 입력
  const titleInput = page.locator('input[placeholder*="제목"]').first()
  if (await titleInput.isVisible({ timeout: 2000 })) {
    await titleInput.fill('테스트 제목입니다')
    await page.waitForTimeout(300)
  }

  // 본문 입력
  const editor = page.locator('.ProseMirror, [contenteditable="true"]').first()
  if (await editor.isVisible({ timeout: 2000 })) {
    await editor.fill('테스트 내용입니다 열 자 이상이어야 합니다 잘 보이나요')
    await page.waitForTimeout(300)
  }

  await page.keyboard.press('Escape')
  await page.waitForTimeout(500)
  await ss(page, '03-after-input', testInfo)

  // 등록하기 버튼 활성화 여부
  const submitBtn = page.locator('button', { hasText: '등록하기' }).last()
  const isEnabled = await submitBtn.isEnabled().catch(() => false)
  const box = await submitBtn.boundingBox()
  console.log(`[INFO] 등록하기 버튼: ${isEnabled ? '✅ 활성화' : '❌ 비활성'} | ${box?.width?.toFixed(0)}×${box?.height?.toFixed(0)}px`)
  console.log(`[INFO] 뷰포트 ${viewport!.width}×${viewport!.height} 기준 버튼 위치: y=${box?.y?.toFixed(0)}px`)
})

// ──────────────────────────────────────────────
// 4. 긴 본문 입력 — 스크롤 + 헤더 고정 확인
// ──────────────────────────────────────────────
test('04 긴 본문 스크롤 + 헤더 고정', async ({ page, viewport }, testInfo) => {
  await page.goto(`${BASE_URL}/community/write?board=stories`)
  await page.waitForLoadState('networkidle')
  await dismissDraft(page)

  const editor = page.locator('.ProseMirror, [contenteditable="true"]').first()
  if (await editor.isVisible({ timeout: 3000 })) {
    await editor.fill('가나다라마바사아자차카타파하 '.repeat(30))
    await page.waitForTimeout(500)
    await ss(page, '04-long-text', testInfo)

    // 헤더 고정 확인 (fixed top-0)
    const header = page.locator('header, .fixed.top-0').first()
    const headerBox = await header.boundingBox().catch(() => null)
    if (headerBox) {
      console.log(`[INFO] 헤더 위치: top=${headerBox.y.toFixed(0)}px (0px이어야 fixed 정상)`)
      if (headerBox.y > 5) console.warn('[WARN] 헤더가 fixed 아님! 스크롤에 따라 이동 중')
    }

    // 툴바 위치 — 긴 텍스트 후에도 bottom에 있는지
    const toolbar = page.locator('[class*="shadow"]').first()
    const tbBox = await toolbar.boundingBox().catch(() => null)
    if (tbBox) {
      const vh = viewport!.height
      const distFromBottom = vh - (tbBox.y + tbBox.height)
      console.log(`[INFO] 툴바 하단: bottom에서 ${distFromBottom.toFixed(0)}px (키보드 없을 때 CTA 바 위에 있어야 함)`)
    }
  }
})

// ──────────────────────────────────────────────
// 5. 동영상 바텀시트 — 기기별 표시 확인
// ──────────────────────────────────────────────
test('05 동영상 추가 바텀시트', async ({ page, viewport }, testInfo) => {
  await page.goto(`${BASE_URL}/community/write?board=stories`)
  await page.waitForLoadState('networkidle')
  await dismissDraft(page)

  const videoBtn = page.locator('button[title="동영상 추가"], button:has-text("🎬")').first()
  if (await videoBtn.isVisible({ timeout: 3000 })) {
    await videoBtn.click()
    await page.waitForTimeout(600)
    await ss(page, '05-video-sheet', testInfo)

    // 바텀시트 항목 크기 검증
    const sheetBtns = page.locator('.fixed button:visible, [class*="bottom"] button:visible')
    const count = await sheetBtns.count()
    console.log(`[INFO] 바텀시트 버튼 수: ${count}`)
    for (let i = 0; i < Math.min(count, 5); i++) {
      const box = await sheetBtns.nth(i).boundingBox()
      const text = (await sheetBtns.nth(i).textContent())?.trim().substring(0, 20) ?? ''
      if (box && box.height > 10) {
        const ok = box.height >= 52
        console.log(`  ${ok ? '✅' : '❌'} [${i}] "${text}" h=${box.height.toFixed(0)}px`)
      }
    }

    // 시트가 화면 하단에서 얼마나 올라왔는지
    const sheet = page.locator('.fixed.bottom-0, [class*="rounded-t"]').last()
    const sheetBox = await sheet.boundingBox().catch(() => null)
    if (sheetBox) {
      console.log(`[INFO] 바텀시트: top=${sheetBox.y.toFixed(0)}px / 화면 ${viewport!.height}px → 시트 높이=${sheetBox.height.toFixed(0)}px`)
    }
  } else {
    await ss(page, '05-video-btn-not-found', testInfo)
    console.warn('[WARN] 🎬 버튼을 찾지 못함 — 에디터 클릭 후 툴바 활성화 필요할 수 있음')
  }
})
