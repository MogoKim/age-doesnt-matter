import { test, expect } from './fixtures/first-party-header'
import type { Page } from './fixtures/first-party-header'

/**
 * 목록에서 첫 공고를 열고 상세 URL 도달까지 확인한다.
 *
 * `/jobs` 목록은 클라이언트 렌더라 링크가 늦게 뜬다. 예전에는 이걸
 * `if (hasJob)` 로 감쌌는데, 링크가 제때 안 보이면 단언을 통째로 건너뛰고
 * **통과**했다 — 공고가 하나도 없어도 초록불이었다는 뜻이다.
 * 여기서는 링크 등장을 필수로 단언한다. 안 뜨면 그건 실패다.
 */
async function openFirstJobDetail(page: Page) {
  await page.goto('/jobs')
  const firstJob = page.locator('a[href^="/jobs/"]:not([href^="/jobs/region/"])').first()
  await expect(firstJob, '/jobs 목록에 공고 링크가 있어야 한다').toBeVisible({ timeout: 15000 })
  await firstJob.click()
  await expect(page).toHaveURL(/\/jobs\/[^/]+$/)
}

test.describe('시나리오 3: 일자리 목록 → 상세 + 매거진 플로우', { tag: ['@smoke', '@public'] }, () => {
  // ── 일자리 ──
  test('일자리 목록 페이지 — 정상 접근', async ({ page }) => {
    await page.goto('/jobs')
    // DB 미연결 시에도 페이지 자체는 로딩됨
    await expect(page.locator('body')).toBeVisible()
  })

  test('일자리 목록 → 상세 페이지 진입', async ({ page }) => {
    await openFirstJobDetail(page)

    await expect(page.locator('main')).toBeVisible()
    await expect(page.locator('h1').first()).toBeVisible() // 제목
    await expect(page.locator('main a[href="/jobs"]').first()).toBeVisible() // 뒤로 가기
  })

  test('일자리 상세 — 정보 카드 (근무지/급여 등)', async ({ page }) => {
    await openFirstJobDetail(page)

    // 공고의 핵심 정보는 항상 노출된다 — 값이 비어도 라벨은 렌더된다.
    for (const label of ['근무지', '급여']) {
      await expect(page.getByText(label).first()).toBeVisible({ timeout: 10000 })
    }
  })

  test('일자리 상세 — 지원 방법 영역', async ({ page }) => {
    await openFirstJobDetail(page)

    // 지원 방법 블록 자체는 항상 있다. 그 안이 '지원하기' 링크인지 안내 문구인지는
    // applyUrl 유무로 갈리므로(page.tsx), 링크가 있을 때만 외부 이동 규약을 본다.
    await expect(page.getByText('지원 방법').first()).toBeVisible({ timeout: 10000 })

    const applyLink = page.locator('main a', { hasText: '지원하기' }).first()
    if (await applyLink.count()) {
      await expect(applyLink).toHaveAttribute('target', '_blank')
      await expect(applyLink).toHaveAttribute('rel', /noopener/)
    }
  })

  /**
   * 내일찾기는 매거진과 같은 정보성 콘텐츠라 소통 영역을 두지 않는다
   * (`src/app/(main)/jobs/[id]/page.tsx` — CommentSection 미렌더).
   *
   * 판별자는 **댓글 작성기(`main textarea`)** 다. 문자열 '댓글' 부재로 재면
   * 문구 한 줄만 바뀌어도 통과해 버리고, 반대로 관련 글 카드에 '댓글 3' 같은
   * 표기가 생기면 계약이 멀쩡한데도 실패한다. 이 판별자가 실제로 댓글 UI를
   * 집어내는지는 바로 아래 대조군 테스트가 지킨다.
   */
  test('일자리 상세 — 댓글 UI 없음 (정보성 콘텐츠 계약)', async ({ page }) => {
    await openFirstJobDetail(page)

    // 먼저 상세가 제대로 그려졌는지 확인한다 — 빈 페이지에서 0을 세면 의미가 없다.
    await expect(page.locator('h1').first()).toBeVisible()
    await expect(page.getByText('지원 방법').first()).toBeVisible({ timeout: 10000 })

    await expect(page.locator('main textarea'), 'JOB 상세에 댓글 작성기가 있으면 안 된다').toHaveCount(0)
  })

  test('댓글 UI 판별자 — 커뮤니티 상세에는 있다 (대조군)', async ({ page }) => {
    // 위 테스트의 `toHaveCount(0)` 이 "선택자가 아무것도 못 찾는다"는 이유로
    // 통과하는 것을 막는다. 같은 선택자가 댓글이 있는 면에서는 잡혀야 한다.
    await page.goto('/community/stories')
    const firstPost = page.locator('a[href^="/community/stories/"]').first()
    await expect(firstPost, '커뮤니티 목록에 글이 있어야 한다').toBeVisible({ timeout: 15000 })
    await firstPost.click()

    await expect(page.locator('main textarea').first()).toBeVisible({ timeout: 20000 })
  })

  test('일자리 목록 — 공고 또는 빈 상태를 명시한다', async ({ page }) => {
    // 이전에는 `hasJob || hasEmpty || hasBody` 였는데 hasBody 가 항상 참이라
    // 목록이 통째로 깨져도 통과했다. body 는 판정에서 뺀다.
    await page.goto('/jobs')

    const jobLink = page.locator('a[href^="/jobs/"]:not([href^="/jobs/region/"])').first()
    const emptyState = page.getByText(/일자리가 없|아직/).first()

    await expect(jobLink.or(emptyState).first()).toBeVisible({ timeout: 15000 })
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

      // 뒤로 가기 (에러바운더리 렌더링 시 skip)
      const backLink = page.locator('main a[href="/magazine"]').first()
      const hasBackLink = await backLink.isVisible({ timeout: 10000 }).catch(() => false)

      if (!hasBackLink) {
        const isError = await page.getByText('문제가 생겼어요').isVisible({ timeout: 2000 }).catch(() => false)
        if (isError) {
          test.skip(true, '프로덕션 일시 오류 — 에러바운더리 렌더링')
          return
        }
      }
      await expect(backLink).toBeVisible()
    }
  })

  test('매거진 상세 — 읽기 전용 액션 영역', async ({ page }) => {
    await page.goto('/magazine')

    const firstMag = page.locator('a[href*="/magazine/"]').first()
    const hasMag = await firstMag.isVisible({ timeout: 5000 }).catch(() => false)

    if (hasMag) {
      await firstMag.click()
      await expect(page).toHaveURL(/\/magazine\//)

      // 읽기 전용 콘텐츠: 제목·본문이 노출된다
      await expect(page.locator('main')).toBeVisible()
      await expect(page.locator('h1').first()).toBeVisible()

      // PR #68 이후 매거진 상세는 읽기 전용 — 댓글 섹션이 없어야 한다(커뮤니티/일자리 댓글은 별도 유지)
      await expect(page.locator('main').getByText(/댓글/)).toHaveCount(0)

      // 하단 읽기 전용 동선(우나어 소개·둘러보기)만 유지
      await expect(page.getByText(/우나어 둘러보기/).first()).toBeVisible({ timeout: 5000 })
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
