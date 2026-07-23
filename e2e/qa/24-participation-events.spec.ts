import { test, expect } from '@playwright/test'

/**
 * 참여 이벤트 QA — 노출 리스크 0 격리 (participation-events-qa.md 계층 A + B).
 *
 * 계층 B (입구 UI): /dev/event-preview(noindex·비링크)에서 HERO 3종을 실제 렌더러로 검증. DB 불필요 → 항상 실행.
 * 계층 A (상세 QA): tier=HIDDEN survey fixture로 /events/[id] 입력/제출/미노출 검증.
 *                  HIDDEN이라 팝업/HERO에 안 뜸(실사용자 노출 0).
 *
 * ⚠️ fixture 생성/삭제는 spec 밖(scripts/qa-event-fixture.ts)에서 한다.
 *    (spec이 prisma client를 import하면 playwright transform이 거대 생성 파일에서 실패 → 관심사 분리)
 *
 * 실행:
 *   ID=$(npx tsx scripts/qa-event-fixture.ts create | grep -oE 'eventId=\S+' | cut -d= -f2)
 *   QA_SURVEY_EVENT_ID=$ID QA_EVENT_URL=<preview> npx playwright test --project=qa-participation-events
 *   npx tsx scripts/qa-event-fixture.ts delete
 */

const LONG_DESC_FRAGMENT = '절대로 노출되면 안 되는' // EventPreviewClient LONG_DESC 조각
const SURVEY_EVENT_ID = process.env.QA_SURVEY_EVENT_ID

// ── 계층 B: 입구 UI (DB 불필요, 항상 실행) — @events-ui: CI 상시 등록 대상 ──
test.describe('참여 이벤트 계층B — HERO 입구 UI (노출 0, /dev/event-preview)', { tag: '@events-ui' }, () => {
  test('SURVEY HERO = 입구 전용: 라벨·짧은문구·CTA 노출, 긴 설명·폼 미노출', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 })
    await page.goto('/dev/event-preview')
    const survey = page.getByTestId('preview-survey')
    await expect(survey).toBeVisible()
    await expect(survey).toContainText('1분 의견함')
    await expect(survey).toContainText('의견 남기기')
    await expect(survey).not.toContainText(LONG_DESC_FRAGMENT) // 긴 설명 미노출
    await expect(survey.locator('textarea')).toHaveCount(0) // 입구 전용(폼 없음)
    const lines = await survey.locator('h2').first().evaluate((el) => {
      const cs = getComputedStyle(el)
      return Math.round(el.getBoundingClientRect().height / parseFloat(cs.lineHeight))
    })
    expect(lines).toBeLessThanOrEqual(2)
    const overflowX = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)
    expect(overflowX).toBe(false)
  })

  test('VOTE HERO 회귀: 투표 위젯(선택지 A/B) 렌더', async ({ page }) => {
    await page.goto('/dev/event-preview')
    const vote = page.getByTestId('preview-vote')
    await expect(vote).toContainText('짜장')
    await expect(vote).toContainText('짬뽕')
  })

  test('FEEDBACK HERO 회귀: 일반 배너 입구 렌더 + CTA', async ({ page }) => {
    await page.goto('/dev/event-preview')
    const fb = page.getByTestId('preview-feedback')
    await expect(fb).toContainText('의견 남기러 가기')
  })
})

// ── 계층 A: 상세 QA (HIDDEN fixture — QA_SURVEY_EVENT_ID 필요) ──────────
test.describe('참여 이벤트 계층A — SURVEY 상세 (HIDDEN, 노출 0)', () => {
  test.skip(!SURVEY_EVENT_ID, 'QA_SURVEY_EVENT_ID 미설정 — scripts/qa-event-fixture.ts create 후 주입')

  test('long_text 한글 20자+ 입력 유지 + 선택/동의 클릭 후 값 보존(remount 없음)', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 })
    await page.goto(`/events/${SURVEY_EVENT_ID}`)
    const ta = page.locator('textarea')
    await ta.pressSequentially('불편했던 점을 아주 자세하게 적어봅니다 정말로요')
    await page.getByRole('button', { name: '매일' }).click()
    await page.locator('input[type="checkbox"]').first().check()
    const val = await ta.inputValue() // 클릭 후에도 값 유지 = remount 없음
    expect(val).toContain('불편했던 점을 아주 자세하게')
    expect(val.length).toBeGreaterThanOrEqual(20)
  })

  test('short_text 여러 글자 입력 유지', async ({ page }) => {
    await page.goto(`/events/${SURVEY_EVENT_ID}`)
    const short = page.locator('input[type="text"]').first()
    await short.pressSequentially('따뜻한 사랑방')
    expect((await short.inputValue()).length).toBeGreaterThanOrEqual(6)
  })

  test('상세 noindex + HIDDEN이라 HERO exposed 미노출', async ({ page }) => {
    await page.goto(`/events/${SURVEY_EVENT_ID}`)
    const robots = await page.locator('meta[name="robots"]').getAttribute('content')
    expect(robots).toContain('noindex')
    const res = await page.request.get('/api/events/exposed?channel=hero')
    const j = await res.json()
    expect(j.survey).toBeNull() // HIDDEN → 노출 안 됨
  })

  test('제출 성공 + 재접속 중복 차단', async ({ page }) => {
    await page.goto(`/events/${SURVEY_EVENT_ID}`)
    await page.getByRole('button', { name: '매일' }).click()
    await page.locator('input[type="checkbox"]').first().check()
    await page.getByRole('button', { name: /의견 제출/ }).click()
    await expect(page.locator('main h1')).toContainText('의견 고맙습니다')
    await page.goto(`/events/${SURVEY_EVENT_ID}`)
    await expect(page.locator('body')).toContainText('이미 의견을 남겨')
    await expect(page.locator('textarea')).toHaveCount(0)
  })
})
