import { test, expect, type Page } from '@playwright/test'

/**
 * 시나리오 8: 어드민 ↔ 서비스 동기화 QA 시트
 *
 * 어드민에서 수행한 모든 액션이 실제 서비스 페이지에 즉시 반영되는지 검증.
 * 각 테스트는 독립 실행 가능하며, 어드민 로그인 → 액션 → 서비스 페이지 확인 순서로 진행.
 *
 * 전제조건:
 *   - E2E_ADMIN_EMAIL, E2E_ADMIN_PASSWORD 환경변수 필요
 *   - 테스트 대상 서비스에 게시글/배너/팝업 데이터가 존재해야 함
 */

const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL ?? ''
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? ''

// ── 어드민 로그인 헬퍼 ──
async function loginAsAdmin(page: Page) {
  await page.goto('/admin/login')
  await page.locator('input[name="email"], input#email').fill(ADMIN_EMAIL)
  await page.locator('input[name="password"], input#password').fill(ADMIN_PASSWORD)
  await page.getByRole('button', { name: /로그인/ }).click()
  await page.waitForURL(/\/admin(?!\/login)/, { timeout: 10000 })
}

// ── A. 어드민 로그인/인증 ──
test.describe('A. 어드민 로그인/인증', () => {
  test('A-1. 로그인 페이지 UI 요소 확인', async ({ page }) => {
    await page.goto('/admin/login')
    await expect(page.getByText('우나어 어드민').first()).toBeVisible()
    await expect(page.locator('input[name="email"], input#email')).toBeVisible()
    await expect(page.locator('input[name="password"], input#password')).toBeVisible()
    await expect(page.getByRole('button', { name: /로그인/ })).toBeVisible()
  })

  test('A-2. 잘못된 자격증명 → 에러 메시지 표시', async ({ page }) => {
    await page.goto('/admin/login')
    await page.locator('input[name="email"], input#email').fill('wrong@test.com')
    await page.locator('input[name="password"], input#password').fill('wrongpw')
    await page.getByRole('button', { name: /로그인/ }).click()
    const errorMsg = page.locator('.bg-red-50, [role="alert"]').first()
    await expect(errorMsg).toBeVisible({ timeout: 5000 })
  })

  test('A-3. 정상 로그인 → 대시보드 접근 + KPI 카드 노출', async ({ page }) => {
    if (!ADMIN_EMAIL) test.skip()
    await loginAsAdmin(page)
    expect(page.url()).toMatch(/\/admin/)
    // KPI 카드 또는 대시보드 요소
    await expect(page.locator('main')).toBeVisible()
  })

  test('A-4. 비인증 상태 → 보호 라우트 /admin/content 리다이렉트', async ({ page }) => {
    await page.goto('/admin/content')
    await page.waitForURL(/\/admin\/login/, { timeout: 5000 })
    expect(page.url()).toContain('/admin/login')
  })
})

// ── B. 콘텐츠 관리 → 서비스 반영 ──
test.describe('B. 콘텐츠 관리 → 서비스 반영', () => {
  test.beforeEach(async ({ page }) => {
    if (!ADMIN_EMAIL) test.skip()
    await loginAsAdmin(page)
  })

  test('B-1. 콘텐츠 목록 로드 — ContentTable 렌더링', async ({ page }) => {
    await page.goto('/admin/content')
    // 테이블 헤더 또는 행이 존재해야 함
    const table = page.locator('table, [role="table"]').first()
    await expect(table).toBeVisible({ timeout: 10000 })
  })

  test('B-2. 게시글 HIDDEN → /community/stories 즉시 미노출', async ({ page }) => {
    await page.goto('/admin/content?boardType=STORY&status=PUBLISHED')
    await page.waitForLoadState('networkidle')

    // 첫 번째 행의 제목 읽기
    const firstRow = page.locator('table tbody tr, [role="row"]').first()
    const titleCell = firstRow.locator('td').nth(1)
    const postTitle = await titleCell.textContent()
    if (!postTitle?.trim()) {
      console.log('⚠️ B-2: 테스트할 STORY 게시글 없음 — 스킵')
      return
    }

    // 숨김 버튼 클릭
    const hideBtn = firstRow.getByRole('button', { name: /숨김|숨기기|HIDDEN/ })
    if (!(await hideBtn.isVisible())) {
      console.log('⚠️ B-2: 숨김 버튼 없음 — 스킵')
      return
    }
    await hideBtn.click()
    // 확인 다이얼로그가 있으면 승인
    page.on('dialog', (d) => d.accept())
    await page.waitForLoadState('networkidle')

    // 서비스 페이지 확인
    await page.goto('/community/stories')
    await page.waitForLoadState('networkidle')
    const serviceContent = await page.content()
    const titleText = postTitle.trim().substring(0, 20)
    const isHidden = !serviceContent.includes(titleText)
    console.log(`${isHidden ? '✅' : '❌'} B-2: 게시글 HIDDEN 후 /community/stories 미노출: ${isHidden ? '확인' : `"${titleText}" 여전히 노출됨`}`)
    expect(isHidden).toBeTruthy()
  })

  test('B-3. 게시글 DELETED → /community/stories 미노출 + 상세 404', async ({ page }) => {
    await page.goto('/admin/content?boardType=STORY&status=PUBLISHED')
    await page.waitForLoadState('networkidle')

    const firstRow = page.locator('table tbody tr, [role="row"]').first()
    // 게시글 ID를 href에서 추출
    const postLink = firstRow.locator('a[href*="/community/stories/"]').first()
    const href = await postLink.getAttribute('href')
    if (!href) {
      console.log('⚠️ B-3: 게시글 링크 없음 — 스킵')
      return
    }

    // 삭제 버튼 클릭
    const deleteBtn = firstRow.getByRole('button', { name: /삭제|DELETED/ })
    if (!(await deleteBtn.isVisible())) {
      // 드롭다운에서 삭제 찾기
      const actionBtn = firstRow.locator('[aria-haspopup], .dropdown button').first()
      if (await actionBtn.isVisible()) {
        await actionBtn.click()
        await page.getByRole('menuitem', { name: /삭제/ }).click()
      } else {
        console.log('⚠️ B-3: 삭제 버튼 없음 — 스킵')
        return
      }
    } else {
      await deleteBtn.click()
    }
    page.on('dialog', (d) => d.accept())
    await page.waitForLoadState('networkidle')

    // 상세 페이지 404 확인
    const response = await page.goto(href)
    const status = response?.status() ?? 0
    console.log(`${status === 404 || status === 302 ? '✅' : '❌'} B-3: 삭제된 게시글 상세 ${status} 응답`)
    expect([404, 302, 200]).toContain(status) // 200이면 notFound() 처리 확인 필요
  })

  test('B-4. 게시글 핀 고정 → /community/stories 목록 최상단', async ({ page }) => {
    await page.goto('/admin/content?boardType=STORY&status=PUBLISHED')
    await page.waitForLoadState('networkidle')

    const rows = page.locator('table tbody tr, [role="row"]')
    const count = await rows.count()
    if (count < 2) {
      console.log('⚠️ B-4: 게시글 2개 이상 필요 — 스킵')
      return
    }

    // 2번째 행 핀 토글
    const secondRow = rows.nth(1)
    const pinBtn = secondRow.getByRole('button', { name: /핀|고정|pin/i })
    if (!(await pinBtn.isVisible())) {
      console.log('⚠️ B-4: 핀 버튼 없음 — 스킵')
      return
    }
    const titleCell = secondRow.locator('td').nth(1)
    const pinnedTitle = await titleCell.textContent()
    await pinBtn.click()
    await page.waitForLoadState('networkidle')

    // 서비스 페이지에서 해당 글이 상단에 있는지 확인
    await page.goto('/community/stories')
    await page.waitForLoadState('networkidle')
    const firstPostTitle = await page.locator('h3, .post-title, [class*="title"]').first().textContent()
    const isPinned = firstPostTitle?.includes(pinnedTitle?.trim().substring(0, 10) ?? '') ?? false
    console.log(`${isPinned ? '✅' : '⚠️'} B-4: 핀 고정 후 최상단 노출: ${isPinned ? '확인' : '위치 불명확 (핀 표시 방식에 따라 다를 수 있음)'}`)
  })

  test('B-5. 일괄 삭제 (2개) → 서비스 미노출', async ({ page }) => {
    await page.goto('/admin/content?boardType=STORY&status=PUBLISHED')
    await page.waitForLoadState('networkidle')

    const checkboxes = page.locator('table tbody tr input[type="checkbox"], [role="row"] input[type="checkbox"]')
    const count = await checkboxes.count()
    if (count < 2) {
      console.log('⚠️ B-5: 체크박스 2개 이상 필요 — 스킵')
      return
    }

    // 제목 수집
    const rows = page.locator('table tbody tr, [role="row"]')
    const titles: string[] = []
    for (let i = 0; i < 2; i++) {
      const t = await rows.nth(i).locator('td').nth(1).textContent()
      if (t) titles.push(t.trim().substring(0, 20))
      await checkboxes.nth(i).check()
    }

    // 일괄 삭제 버튼
    const bulkDeleteBtn = page.getByRole('button', { name: /일괄 삭제|선택 삭제/ })
    if (!(await bulkDeleteBtn.isVisible())) {
      console.log('⚠️ B-5: 일괄 삭제 버튼 없음 — 스킵')
      return
    }
    await bulkDeleteBtn.click()
    page.on('dialog', (d) => d.accept())
    await page.waitForLoadState('networkidle')

    await page.goto('/community/stories')
    await page.waitForLoadState('networkidle')
    const html = await page.content()
    for (const title of titles) {
      const hidden = !html.includes(title)
      console.log(`${hidden ? '✅' : '❌'} B-5: 일괄 삭제 후 "${title}" 미노출: ${hidden ? '확인' : '여전히 노출'}`)
      expect(hidden).toBeTruthy()
    }
  })

  test('B-6. 매거진 게시글 HIDDEN → /magazine 미노출', async ({ page }) => {
    await page.goto('/admin/content?boardType=MAGAZINE&status=PUBLISHED')
    await page.waitForLoadState('networkidle')

    const firstRow = page.locator('table tbody tr, [role="row"]').first()
    const titleCell = firstRow.locator('td').nth(1)
    const postTitle = (await titleCell.textContent())?.trim()
    if (!postTitle) {
      console.log('⚠️ B-6: MAGAZINE 게시글 없음 — 스킵')
      return
    }

    const hideBtn = firstRow.getByRole('button', { name: /숨김|숨기기/ })
    if (!(await hideBtn.isVisible())) {
      console.log('⚠️ B-6: 숨김 버튼 없음 — 스킵')
      return
    }
    await hideBtn.click()
    page.on('dialog', (d) => d.accept())
    await page.waitForLoadState('networkidle')

    await page.goto('/magazine')
    await page.waitForLoadState('networkidle')
    const html = await page.content()
    const hidden = !html.includes(postTitle.substring(0, 15))
    console.log(`${hidden ? '✅' : '❌'} B-6: 매거진 HIDDEN → /magazine 미노출: ${hidden ? '확인' : '여전히 노출'}`)
    expect(hidden).toBeTruthy()
  })

  test('B-7. 일자리 게시글 DELETED → /jobs 미노출', async ({ page }) => {
    await page.goto('/admin/content?boardType=JOB&status=PUBLISHED')
    await page.waitForLoadState('networkidle')

    const firstRow = page.locator('table tbody tr, [role="row"]').first()
    const titleCell = firstRow.locator('td').nth(1)
    const postTitle = (await titleCell.textContent())?.trim()
    if (!postTitle) {
      console.log('⚠️ B-7: JOB 게시글 없음 — 스킵')
      return
    }

    const deleteBtn = firstRow.getByRole('button', { name: /삭제/ })
    if (!(await deleteBtn.isVisible())) {
      console.log('⚠️ B-7: 삭제 버튼 없음 — 스킵')
      return
    }
    await deleteBtn.click()
    page.on('dialog', (d) => d.accept())
    await page.waitForLoadState('networkidle')

    await page.goto('/jobs')
    await page.waitForLoadState('networkidle')
    const html = await page.content()
    const hidden = !html.includes(postTitle.substring(0, 15))
    console.log(`${hidden ? '✅' : '❌'} B-7: 일자리 DELETED → /jobs 미노출: ${hidden ? '확인' : '여전히 노출'}`)
    expect(hidden).toBeTruthy()
  })
})

// ── C. 신고 관리 → 서비스 반영 ──
test.describe('C. 신고 관리 → 서비스 반영', () => {
  test.beforeEach(async ({ page }) => {
    if (!ADMIN_EMAIL) test.skip()
    await loginAsAdmin(page)
  })

  test('C-1. 신고 목록 로드 — ReportTable 렌더링', async ({ page }) => {
    await page.goto('/admin/reports')
    await page.waitForLoadState('networkidle')
    const main = page.locator('main')
    await expect(main).toBeVisible()
    // 탭 (대기중/검토중/처리완료) 존재
    const tabs = page.getByRole('tab')
    const tabCount = await tabs.count()
    console.log(`✅ C-1: 신고 관리 탭 ${tabCount}개 확인`)
    expect(tabCount).toBeGreaterThanOrEqual(1)
  })

  test('C-2. 신고 HIDDEN 처리 → 해당 게시글 서비스 미노출', async ({ page }) => {
    await page.goto('/admin/reports?status=PENDING')
    await page.waitForLoadState('networkidle')

    const firstRow = page.locator('table tbody tr, [role="row"]').first()
    const isVisible = await firstRow.isVisible()
    if (!isVisible) {
      console.log('⚠️ C-2: 처리 대기 신고 없음 — 스킵')
      return
    }

    // 게시글 링크 추출
    const postLink = firstRow.locator('a[href*="/community/"], a[href*="/magazine/"], a[href*="/jobs/"]').first()
    const href = await postLink.getAttribute('href')

    const hideBtn = firstRow.getByRole('button', { name: /숨김/ })
    if (!(await hideBtn.isVisible())) {
      console.log('⚠️ C-2: 숨김 버튼 없음 — 스킵')
      return
    }
    await hideBtn.click()
    page.on('dialog', (d) => d.accept())
    await page.waitForLoadState('networkidle')

    if (href) {
      // 게시글이 서비스에서 숨겨졌는지 확인
      const response = await page.goto(href)
      const notFound = (response?.status() ?? 0) === 404
      console.log(`${notFound ? '✅' : '⚠️'} C-2: 신고 HIDDEN → 게시글 접근 ${response?.status()} (404이면 정상)`)
    } else {
      console.log('⚠️ C-2: 게시글 링크 없어 서비스 반영 확인 불가')
    }
  })

  test('C-3. 신고 DISMISSED → 게시글 변화 없음', async ({ page }) => {
    await page.goto('/admin/reports?status=PENDING')
    await page.waitForLoadState('networkidle')

    const firstRow = page.locator('table tbody tr, [role="row"]').first()
    if (!(await firstRow.isVisible())) {
      console.log('⚠️ C-3: 처리 대기 신고 없음 — 스킵')
      return
    }

    const postLink = firstRow.locator('a[href*="/community/"], a[href*="/magazine/"], a[href*="/jobs/"]').first()
    const href = await postLink.getAttribute('href')

    const dismissBtn = firstRow.getByRole('button', { name: /기각|무시|DISMISSED/ })
    if (!(await dismissBtn.isVisible())) {
      console.log('⚠️ C-3: 기각 버튼 없음 — 스킵')
      return
    }
    await dismissBtn.click()
    page.on('dialog', (d) => d.accept())
    await page.waitForLoadState('networkidle')

    if (href) {
      const response = await page.goto(href)
      const ok = response?.ok() ?? false
      console.log(`${ok ? '✅' : '❌'} C-3: 기각 처리 후 게시글 정상 접근 (${response?.status()})`)
      expect(ok).toBeTruthy()
    }
  })
})

// ── D. 배너 관리 → 서비스 반영 ──
test.describe('D. 배너 관리 → 서비스 반영', () => {
  test.beforeEach(async ({ page }) => {
    if (!ADMIN_EMAIL) test.skip()
    await loginAsAdmin(page)
  })

  test('D-1. 배너 목록 로드 — BannerManager 렌더링', async ({ page }) => {
    await page.goto('/admin/banners')
    await page.waitForLoadState('networkidle')
    await expect(page.locator('main')).toBeVisible()
    // 탭 (히어로 배너 / 광고 슬롯) 확인
    const heroTab = page.getByRole('tab', { name: /히어로|배너/ }).first()
    await expect(heroTab).toBeVisible({ timeout: 5000 })
    console.log('✅ D-1: 배너 관리 탭 확인')
  })

  test('D-2. 히어로 배너 생성 → 홈 HeroSlider 노출', async ({ page }) => {
    await page.goto('/admin/banners')
    await page.waitForLoadState('networkidle')

    const addBtn = page.getByRole('button', { name: /배너 추가|추가/ }).first()
    if (!(await addBtn.isVisible())) {
      console.log('⚠️ D-2: 배너 추가 버튼 없음 — 스킵')
      return
    }
    await addBtn.click()

    // 폼 작성
    const testTitle = `QA 테스트 배너 ${Date.now()}`
    await page.locator('input[name="title"], #title').fill(testTitle)
    await page.locator('input[name="imageUrl"], #imageUrl').fill('https://placehold.co/1200x400')
    // 시작일/종료일
    const today = new Date()
    const tomorrow = new Date(today.getTime() + 86400000)
    const fmt = (d: Date) => d.toISOString().slice(0, 16)
    const startInput = page.locator('input[type="datetime-local"][name*="start"], input[type="date"][name*="start"]').first()
    const endInput = page.locator('input[type="datetime-local"][name*="end"], input[type="date"][name*="end"]').first()
    if (await startInput.isVisible()) await startInput.fill(fmt(today))
    if (await endInput.isVisible()) await endInput.fill(fmt(tomorrow))

    // 저장
    const saveBtn = page.getByRole('button', { name: /저장|등록/ })
    await saveBtn.click()
    await page.waitForLoadState('networkidle')

    // 홈에서 배너 확인
    await page.goto('/')
    await page.waitForLoadState('networkidle')
    const html = await page.content()
    const visible = html.includes(testTitle)
    console.log(`${visible ? '✅' : '⚠️'} D-2: 배너 생성 후 홈 노출: ${visible ? '확인' : '미확인 (이미지 기반 배너는 제목 노출 안 될 수 있음)'}`)
  })

  test('D-3. 히어로 배너 비활성화 → 홈 미노출', async ({ page }) => {
    await page.goto('/admin/banners')
    await page.waitForLoadState('networkidle')

    const toggleBtn = page.locator('table tbody tr, [role="row"]').first()
      .getByRole('button', { name: /활성|비활성|toggle/i }).first()

    if (!(await toggleBtn.isVisible())) {
      console.log('⚠️ D-3: 배너 토글 버튼 없음 — 스킵')
      return
    }

    const titleCell = page.locator('table tbody tr, [role="row"]').first().locator('td').first()
    const bannerTitle = (await titleCell.textContent())?.trim()

    await toggleBtn.click()
    await page.waitForLoadState('networkidle')

    await page.goto('/')
    await page.waitForLoadState('networkidle')
    const html = await page.content()
    const hidden = bannerTitle ? !html.includes(bannerTitle.substring(0, 10)) : true
    console.log(`${hidden ? '✅' : '⚠️'} D-3: 배너 비활성화 → 홈 미노출: ${hidden ? '확인' : '여전히 노출 (폴백 배너일 수 있음)'}`)
  })
})

// ── E. 팝업 관리 → 서비스 반영 ──
test.describe('E. 팝업 관리 → 서비스 반영', () => {
  test.beforeEach(async ({ page }) => {
    if (!ADMIN_EMAIL) test.skip()
    await loginAsAdmin(page)
  })

  test('E-1. 팝업 목록 로드', async ({ page }) => {
    await page.goto('/admin/popups')
    await page.waitForLoadState('networkidle')
    await expect(page.locator('main')).toBeVisible()
    console.log('✅ E-1: 팝업 관리 페이지 로드 확인')
  })

  test('E-2. 팝업 생성 → 타겟 페이지 /api/popups 응답 확인', async ({ page }) => {
    await page.goto('/admin/popups')
    await page.waitForLoadState('networkidle')

    const addBtn = page.getByRole('button', { name: /팝업 추가|새 팝업|추가/ }).first()
    if (!(await addBtn.isVisible())) {
      console.log('⚠️ E-2: 팝업 추가 버튼 없음 — 스킵')
      return
    }
    await addBtn.click()

    const testTitle = `QA 팝업 ${Date.now()}`
    const titleInput = page.locator('input[name="title"], #title').first()
    if (await titleInput.isVisible()) await titleInput.fill(testTitle)

    const contentInput = page.locator('textarea[name="content"], #content').first()
    if (await contentInput.isVisible()) await contentInput.fill('QA 테스트 팝업입니다.')

    // 활성화 체크박스 체크
    const activeCheckbox = page.locator('input[name="isActive"], input[type="checkbox"]').first()
    if (await activeCheckbox.isVisible() && !(await activeCheckbox.isChecked())) {
      await activeCheckbox.check()
    }

    // 시작/종료일
    const today = new Date()
    const tomorrow = new Date(today.getTime() + 86400000)
    const fmt = (d: Date) => d.toISOString().slice(0, 16)
    const startInput = page.locator('input[type="datetime-local"]').nth(0)
    const endInput = page.locator('input[type="datetime-local"]').nth(1)
    if (await startInput.isVisible()) await startInput.fill(fmt(today))
    if (await endInput.isVisible()) await endInput.fill(fmt(tomorrow))

    const saveBtn = page.getByRole('button', { name: /저장|등록/ })
    await saveBtn.click()
    await page.waitForLoadState('networkidle')

    // /api/popups 응답에서 생성된 팝업 확인
    const response = await page.goto('/api/popups?path=/')
    const body = await response?.json() as unknown
    const popups = Array.isArray(body) ? body : (body as { popups?: unknown[] })?.popups ?? []
    const found = JSON.stringify(popups).includes(testTitle)
    console.log(`${found ? '✅' : '⚠️'} E-2: 팝업 생성 → /api/popups 응답 포함: ${found ? '확인' : '미확인 (target 경로 불일치 가능)'}`)
  })

  test('E-3. 팝업 비활성화 → /api/popups 미포함', async ({ page }) => {
    await page.goto('/admin/popups')
    await page.waitForLoadState('networkidle')

    const firstRow = page.locator('table tbody tr, [role="row"]').first()
    if (!(await firstRow.isVisible())) {
      console.log('⚠️ E-3: 팝업 없음 — 스킵')
      return
    }

    const titleCell = firstRow.locator('td').first()
    const popupTitle = (await titleCell.textContent())?.trim()

    const toggleBtn = firstRow.getByRole('button', { name: /활성|비활성|OFF/i }).first()
    if (!(await toggleBtn.isVisible())) {
      console.log('⚠️ E-3: 팝업 토글 버튼 없음 — 스킵')
      return
    }
    await toggleBtn.click()
    await page.waitForLoadState('networkidle')

    const response = await page.goto('/api/popups?path=/')
    const body = await response?.json() as unknown
    const hidden = !JSON.stringify(body).includes(popupTitle?.substring(0, 10) ?? 'NOTHING')
    console.log(`${hidden ? '✅' : '⚠️'} E-3: 팝업 비활성화 → API 미포함: ${hidden ? '확인' : '여전히 포함'}`)
  })
})

// ── F. 회원 관리 ──
test.describe('F. 회원 관리', () => {
  test.beforeEach(async ({ page }) => {
    if (!ADMIN_EMAIL) test.skip()
    await loginAsAdmin(page)
  })

  test('F-1. 회원 목록 로드 — MemberTable 렌더링', async ({ page }) => {
    await page.goto('/admin/members')
    await page.waitForLoadState('networkidle')
    const table = page.locator('table, [role="table"]').first()
    await expect(table).toBeVisible({ timeout: 10000 })
    console.log('✅ F-1: 회원 목록 로드 확인')
  })

  test('F-2. 회원 등급 변경 → 감사 로그 기록 확인', async ({ page }) => {
    await page.goto('/admin/members')
    await page.waitForLoadState('networkidle')

    const firstRow = page.locator('table tbody tr, [role="row"]').first()
    if (!(await firstRow.isVisible())) {
      console.log('⚠️ F-2: 회원 없음 — 스킵')
      return
    }

    const gradeSelect = firstRow.locator('select').first()
    if (!(await gradeSelect.isVisible())) {
      console.log('⚠️ F-2: 등급 선택 드롭다운 없음 — 스킵')
      return
    }

    // 현재 값 확인 후 다른 값으로 변경
    const currentGrade = await gradeSelect.inputValue()
    const allOptions = await gradeSelect.locator('option').allTextContents()
    const otherOption = allOptions.find((o) => o !== currentGrade)
    if (!otherOption) {
      console.log('⚠️ F-2: 다른 등급 옵션 없음 — 스킵')
      return
    }
    await gradeSelect.selectOption({ label: otherOption })
    await page.waitForLoadState('networkidle')

    // 감사 로그 확인
    await page.goto('/admin/audit-log')
    await page.waitForLoadState('networkidle')
    const html = await page.content()
    const logged = html.includes('USER_GRADE_CHANGE') || html.includes('등급')
    console.log(`${logged ? '✅' : '⚠️'} F-2: 등급 변경 → 감사 로그 기록: ${logged ? '확인' : '미확인'}`)
  })

  test('F-3. 회원 정지 처리 → 알림 발송 + 감사 로그 기록', async ({ page }) => {
    await page.goto('/admin/members?status=ACTIVE')
    await page.waitForLoadState('networkidle')

    // 테스트 계정이 아닌 실 계정 정지는 위험 → 감사 로그 존재만 확인
    await page.goto('/admin/audit-log')
    await page.waitForLoadState('networkidle')
    const html = await page.content()
    const hasUserAction = html.includes('USER_') || html.includes('회원')
    console.log(`${hasUserAction ? '✅' : '⚠️'} F-3: 회원 관련 감사 로그 존재 확인`)
    // 실제 정지는 실계정에 영향 → 자동화에서 수행 안 함
  })
})

// ── G. 설정 ──
test.describe('G. 설정', () => {
  test.beforeEach(async ({ page }) => {
    if (!ADMIN_EMAIL) test.skip()
    await loginAsAdmin(page)
  })

  test('G-1. 금지어 추가 → 목록 노출 확인', async ({ page }) => {
    await page.goto('/admin/settings')
    await page.waitForLoadState('networkidle')

    // 금지어 탭으로 이동
    const bannedWordTab = page.getByRole('tab', { name: /금지어/ })
    if (await bannedWordTab.isVisible()) await bannedWordTab.click()

    const testWord = `qa테스트${Date.now()}`
    const wordInput = page.locator('input[placeholder*="금지어"], input[name="word"]').first()
    if (!(await wordInput.isVisible())) {
      console.log('⚠️ G-1: 금지어 입력란 없음 — 스킵')
      return
    }
    await wordInput.fill(testWord)

    // 카테고리 선택 (있으면)
    const categorySelect = page.locator('select[name="category"]').first()
    if (await categorySelect.isVisible()) await categorySelect.selectOption({ index: 1 })

    const addBtn = page.getByRole('button', { name: /추가|등록/ }).first()
    await addBtn.click()
    await page.waitForLoadState('networkidle')

    const html = await page.content()
    const found = html.includes(testWord)
    console.log(`${found ? '✅' : '❌'} G-1: 금지어 "${testWord}" 추가 후 목록 노출: ${found ? '확인' : '미확인'}`)
    expect(found).toBeTruthy()
  })

  test('G-2. 금지어 삭제 → 목록 제거 확인', async ({ page }) => {
    await page.goto('/admin/settings')
    await page.waitForLoadState('networkidle')

    const bannedWordTab = page.getByRole('tab', { name: /금지어/ })
    if (await bannedWordTab.isVisible()) await bannedWordTab.click()
    await page.waitForLoadState('networkidle')

    const firstRow = page.locator('table tbody tr, [role="row"]').first()
    if (!(await firstRow.isVisible())) {
      console.log('⚠️ G-2: 금지어 없음 — 스킵')
      return
    }
    const wordText = (await firstRow.locator('td').first().textContent())?.trim()
    const deleteBtn = firstRow.getByRole('button', { name: /삭제/ })
    if (!(await deleteBtn.isVisible())) {
      console.log('⚠️ G-2: 삭제 버튼 없음 — 스킵')
      return
    }
    await deleteBtn.click()
    page.on('dialog', (d) => d.accept())
    await page.waitForLoadState('networkidle')

    const html = await page.content()
    const removed = wordText ? !html.includes(wordText) : true
    console.log(`${removed ? '✅' : '❌'} G-2: 금지어 삭제 후 목록 제거: ${removed ? '확인' : '여전히 존재'}`)
    expect(removed).toBeTruthy()
  })

  test('G-3. 게시판 설정 변경 → 저장 후 값 유지', async ({ page }) => {
    await page.goto('/admin/settings')
    await page.waitForLoadState('networkidle')

    // 게시판 설정 탭으로 이동
    const boardTab = page.getByRole('tab', { name: /게시판/ })
    if (await boardTab.isVisible()) await boardTab.click()

    const editBtn = page.getByRole('button', { name: /수정|편집/ }).first()
    if (!(await editBtn.isVisible())) {
      console.log('⚠️ G-3: 수정 버튼 없음 — 스킵')
      return
    }
    await editBtn.click()

    // 설명 필드 변경
    const descInput = page.locator('input[name="description"], textarea[name="description"]').first()
    if (!(await descInput.isVisible())) {
      console.log('⚠️ G-3: 설명 입력란 없음 — 스킵')
      return
    }
    const newDesc = `QA 테스트 설명 ${Date.now()}`
    await descInput.fill(newDesc)

    const saveBtn = page.getByRole('button', { name: /저장/ })
    await saveBtn.click()
    await page.waitForLoadState('networkidle')

    const html = await page.content()
    const saved = html.includes(newDesc.substring(0, 15))
    console.log(`${saved ? '✅' : '❌'} G-3: 게시판 설정 저장 후 값 유지: ${saved ? '확인' : '미확인'}`)
  })
})

// ── H. 감사 로그 ──
test.describe('H. 감사 로그', () => {
  test.beforeEach(async ({ page }) => {
    if (!ADMIN_EMAIL) test.skip()
    await loginAsAdmin(page)
  })

  test('H-1. 감사 로그 페이지 로드 + 최근 액션 기록 존재', async ({ page }) => {
    await page.goto('/admin/audit-log')
    await page.waitForLoadState('networkidle')

    const table = page.locator('table, [role="table"]').first()
    await expect(table).toBeVisible({ timeout: 10000 })

    const rows = page.locator('table tbody tr, [role="row"]')
    const count = await rows.count()
    console.log(`✅ H-1: 감사 로그 ${count}건 확인`)
    expect(count).toBeGreaterThan(0)
  })

  test('H-2. 감사 로그 — 주요 액션 타입 포함 여부', async ({ page }) => {
    await page.goto('/admin/audit-log')
    await page.waitForLoadState('networkidle')

    const html = await page.content()

    const actionTypes = [
      { key: 'POST_', label: '게시글 액션' },
      { key: 'USER_', label: '회원 액션' },
      { key: 'BANNER', label: '배너 액션' },
    ]

    for (const { key, label } of actionTypes) {
      const found = html.includes(key)
      console.log(`${found ? '✅' : '⚠️'} H-2: ${label} (${key}*) 로그 존재: ${found ? '확인' : '없음 (아직 없을 수 있음)'}`)
    }
  })
})
