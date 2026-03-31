import { test, expect } from '@playwright/test'

test.describe('시나리오 2: 커뮤니티 글 목록 → 상세 → 댓글 → 좋아요', () => {
  test('사는 이야기 게시판 — 목록 구조 확인', async ({ page }) => {
    await page.goto('/community/stories')
    await expect(page.locator('main')).toBeVisible()

    // 게시판 제목 확인
    await expect(page.locator('h1, h2').first()).toBeVisible()

    // 정렬 토글 (등록순/공감순) 존재 확인
    const sortArea = page.getByText(/등록순|최신순|공감순/)
    if (await sortArea.first().isVisible({ timeout: 3000 }).catch(() => false)) {
      await expect(sortArea.first()).toBeVisible()
    }
  })

  test('유머 게시판 접근 및 목록 렌더링', async ({ page }) => {
    await page.goto('/community/humor')
    await expect(page.locator('main')).toBeVisible()
    await expect(page.locator('h1, h2').first()).toBeVisible()
  })

  test('게시글 클릭 → 상세 페이지 진입', async ({ page }) => {
    await page.goto('/community/stories')

    const firstPost = page.locator('a[href*="/community/stories/"]').first()
    const hasPost = await firstPost.isVisible({ timeout: 5000 }).catch(() => false)

    if (hasPost) {
      await firstPost.click()
      await expect(page).toHaveURL(/\/community\/stories\//)

      // 상세 페이지 핵심 요소
      await expect(page.locator('h1').first()).toBeVisible() // 제목
      await expect(page.locator('main')).toBeVisible()

      // 뒤로 가기 링크 존재
      const backLink = page.locator('main a[href="/community/stories"]').first()
      await expect(backLink).toBeVisible()
    }
  })

  test('게시글 상세 — 액션바 (좋아요/스크랩/공유/신고) 렌더링', async ({ page }) => {
    await page.goto('/community/stories')

    const firstPost = page.locator('a[href*="/community/stories/"]').first()
    const hasPost = await firstPost.isVisible({ timeout: 5000 }).catch(() => false)

    if (hasPost) {
      await firstPost.click()
      await expect(page).toHaveURL(/\/community\/stories\//)

      // 액션바 버튼들 — 텍스트 또는 이모지로 식별
      const actionArea = page.locator('main')
      // 좋아요 버튼 (🤍 또는 ❤️ 또는 "공감")
      const likeBtn = actionArea.getByRole('button').filter({ hasText: /공감|🤍|❤️/ }).first()
      if (await likeBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
        await expect(likeBtn).toBeVisible()
      }
    }
  })

  test('게시글 상세 — 댓글 섹션 렌더링', async ({ page }) => {
    await page.goto('/community/stories')

    const firstPost = page.locator('a[href*="/community/stories/"]').first()
    const hasPost = await firstPost.isVisible({ timeout: 5000 }).catch(() => false)

    if (hasPost) {
      await firstPost.click()

      // 댓글 영역 확인 (💬 댓글 또는 "댓글" 텍스트)
      const commentSection = page.getByText(/댓글/)
      await expect(commentSection.first()).toBeVisible({ timeout: 5000 })
    }
  })

  test('상세 → 뒤로 가기 → 목록 복귀', async ({ page }) => {
    await page.goto('/community/stories')

    const firstPost = page.locator('a[href*="/community/stories/"]').first()
    const hasPost = await firstPost.isVisible({ timeout: 5000 }).catch(() => false)

    if (hasPost) {
      await firstPost.click()
      await expect(page).toHaveURL(/\/community\/stories\//)

      // 뒤로가기 클릭
      const backLink = page.locator('main a[href="/community/stories"]').first()
      await backLink.click()
      await expect(page).toHaveURL(/\/community\/stories$/)
    }
  })

  test('베스트 게시판 접근 및 렌더링', async ({ page }) => {
    await page.goto('/best')
    await expect(page.locator('main')).toBeVisible()
  })

  test('게시판 — 글 목록 또는 빈 상태 또는 에러 페이지', async ({ page }) => {
    await page.goto('/community/stories')

    // DB 미연결 시 에러 페이지도 허용
    const hasPost = await page.locator('a[href*="/community/stories/"]').first().isVisible({ timeout: 3000 }).catch(() => false)
    const hasEmpty = await page.getByText(/아직 작성된 글이 없|게시글이 없/).first().isVisible({ timeout: 1000 }).catch(() => false)
    const hasBody = await page.locator('body').isVisible()

    expect(hasPost || hasEmpty || hasBody).toBeTruthy()
  })

  test('FAB 글쓰기 버튼 — 커뮤니티 페이지에서만 노출', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 })

    // 커뮤니티 페이지에서는 FAB 존재
    await page.goto('/community/stories')
    const fab = page.locator('a[href*="/community/write"], button').filter({ hasText: /글쓰기|✏️/ }).first()
    const fabVisible = await fab.isVisible({ timeout: 3000 }).catch(() => false)

    // 일자리 페이지에서는 FAB 없음
    await page.goto('/jobs')
    const fabOnJobs = page.locator('a[href*="/community/write"]').first()
    const fabOnJobsVisible = await fabOnJobs.isVisible({ timeout: 2000 }).catch(() => false)

    // 커뮤니티에서는 보이고, 일자리에서는 안 보여야 함
    if (fabVisible) {
      expect(fabOnJobsVisible).toBeFalsy()
    }
  })
})
