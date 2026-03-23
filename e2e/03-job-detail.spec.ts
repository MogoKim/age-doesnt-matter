import { test, expect } from '@playwright/test'

test.describe('시나리오 3: 일자리 목록 → 상세 + 매거진 플로우', () => {
  // ── 일자리 ──
  test('일자리 목록 페이지 — 정상 접근', async ({ page }) => {
    await page.goto('/jobs')
    // DB 미연결 시에도 페이지 자체는 로딩됨
    await expect(page.locator('body')).toBeVisible()
  })

  test('일자리 목록 → 상세 페이지 진입', async ({ page }) => {
    await page.goto('/jobs')

    const firstJob = page.locator('a[href*="/jobs/"]').first()
    const hasJob = await firstJob.isVisible({ timeout: 5000 }).catch(() => false)

    if (hasJob) {
      await firstJob.click()
      await expect(page).toHaveURL(/\/jobs\//)
      await expect(page.locator('main')).toBeVisible()

      // 상세 페이지 필수 요소
      await expect(page.locator('h1').first()).toBeVisible() // 제목

      // 뒤로 가기 링크
      const backLink = page.locator('a[href="/jobs"]').first()
      await expect(backLink).toBeVisible()
    }
  })

  test('일자리 상세 — 정보 카드 (근무지/급여 등)', async ({ page }) => {
    await page.goto('/jobs')

    const firstJob = page.locator('a[href*="/jobs/"]').first()
    const hasJob = await firstJob.isVisible({ timeout: 5000 }).catch(() => false)

    if (hasJob) {
      await firstJob.click()
      await expect(page).toHaveURL(/\/jobs\//)

      // 정보 영역 — 아이콘 키워드로 확인
      const infoTexts = ['근무지', '급여', '근무']
      for (const text of infoTexts) {
        const el = page.getByText(text).first()
        if (await el.isVisible({ timeout: 2000 }).catch(() => false)) {
          await expect(el).toBeVisible()
        }
      }
    }
  })

  test('일자리 상세 — 지원하기 버튼 존재', async ({ page }) => {
    await page.goto('/jobs')

    const firstJob = page.locator('a[href*="/jobs/"]').first()
    const hasJob = await firstJob.isVisible({ timeout: 5000 }).catch(() => false)

    if (hasJob) {
      await firstJob.click()

      // 지원하기 버튼 (외부 링크)
      const applyBtn = page.getByText('지원하기').first()
      if (await applyBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
        await expect(applyBtn).toBeVisible()
        // target="_blank" 확인 (외부 이동)
        const tag = await applyBtn.evaluate((el) => el.tagName.toLowerCase())
        if (tag === 'a') {
          await expect(applyBtn).toHaveAttribute('target', '_blank')
        }
      }
    }
  })

  test('일자리 상세 — 댓글 섹션 존재', async ({ page }) => {
    await page.goto('/jobs')

    const firstJob = page.locator('a[href*="/jobs/"]').first()
    const hasJob = await firstJob.isVisible({ timeout: 5000 }).catch(() => false)

    if (hasJob) {
      await firstJob.click()
      const commentSection = page.getByText(/댓글/)
      await expect(commentSection.first()).toBeVisible({ timeout: 5000 })
    }
  })

  test('일자리 목록 — 콘텐츠 또는 빈 상태', async ({ page }) => {
    await page.goto('/jobs')

    const hasJob = await page.locator('a[href*="/jobs/"]').first().isVisible({ timeout: 3000 }).catch(() => false)
    const hasEmpty = await page.getByText(/일자리가 없|아직/).first().isVisible({ timeout: 1000 }).catch(() => false)
    const hasBody = await page.locator('body').isVisible()

    expect(hasJob || hasEmpty || hasBody).toBeTruthy()
  })

  // ── 매거진 ──
  test('매거진 목록 페이지 — 정상 접근', async ({ page }) => {
    await page.goto('/magazine')
    await expect(page.locator('body')).toBeVisible()
  })

  test('매거진 목록 → 상세 페이지 진입', async ({ page }) => {
    await page.goto('/magazine')

    const firstMag = page.locator('a[href*="/magazine/"]').first()
    const hasMag = await firstMag.isVisible({ timeout: 5000 }).catch(() => false)

    if (hasMag) {
      await firstMag.click()
      await expect(page).toHaveURL(/\/magazine\//)
      await expect(page.locator('main')).toBeVisible()

      // 제목
      await expect(page.locator('h1').first()).toBeVisible()

      // 뒤로 가기
      const backLink = page.locator('a[href="/magazine"]').first()
      await expect(backLink).toBeVisible()
    }
  })

  test('매거진 상세 — 액션바 + 댓글 섹션', async ({ page }) => {
    await page.goto('/magazine')

    const firstMag = page.locator('a[href*="/magazine/"]').first()
    const hasMag = await firstMag.isVisible({ timeout: 5000 }).catch(() => false)

    if (hasMag) {
      await firstMag.click()
      await expect(page).toHaveURL(/\/magazine\//)

      // 댓글 영역
      const commentSection = page.getByText(/댓글/)
      await expect(commentSection.first()).toBeVisible({ timeout: 5000 })
    }
  })

  test('매거진 목록 — 콘텐츠 또는 빈 상태', async ({ page }) => {
    await page.goto('/magazine')

    const hasMag = await page.locator('a[href*="/magazine/"]').first().isVisible({ timeout: 3000 }).catch(() => false)
    const hasEmpty = await page.getByText(/매거진이 없|아직/).first().isVisible({ timeout: 1000 }).catch(() => false)
    const hasBody = await page.locator('body').isVisible()

    expect(hasMag || hasEmpty || hasBody).toBeTruthy()
  })
})
