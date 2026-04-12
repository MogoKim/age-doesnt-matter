/**
 * QA 19 — 고객 여정 병목 발견
 *
 * 목적: 발견(Discovery) — 문제 수정 아님
 * 고객이 실제로 걷는 5가지 핵심 여정을 시뮬레이션하여
 * 병목(느린 단계), 마찰(막히는 지점), UX 문제를 기록한다.
 *
 * 여정 1: 비로그인 첫 방문 탐색
 * 여정 2: 커뮤니티 게시판 탐색
 * 여정 3: 검색 사용
 * 여정 4: 일자리 + 매거진 탐색
 * 여정 5: 로그인 유저 핵심 기능 (qa-audit-user 프로젝트)
 *
 * 출력: assets/qa-report/19-journey-audit-result.json
 */

import { test, expect } from '@playwright/test'
import * as fs from 'fs'
import * as path from 'path'

// ─── 타입 ──────────────────────────────────────────────────────────────────────

interface JourneyStep {
  step: string
  durationMs: number
  status: 'OK' | 'WARN' | 'FAIL'
  issue: string | null
}

interface JourneyResult {
  journey: string
  steps: JourneyStep[]
  totalDurationMs: number
  issueCount: number
}

// ─── 헬퍼 ─────────────────────────────────────────────────────────────────────

async function measureStep(
  label: string,
  fn: () => Promise<string | null | void>
): Promise<JourneyStep> {
  const start = Date.now()
  let issue: string | null = null
  try {
    const result = await fn()
    if (typeof result === 'string') issue = result
  } catch (err) {
    issue = `오류: ${String(err).slice(0, 200)}`
  }
  const durationMs = Date.now() - start
  const status: JourneyStep['status'] =
    issue ? (issue.startsWith('오류') ? 'FAIL' : 'WARN') :
    durationMs > 3000 ? 'WARN' : 'OK'
  return { step: label, durationMs, status, issue }
}

function logJourney(result: JourneyResult) {
  const icon = result.issueCount > 0 ? '⚠️' : '✅'
  console.log(`\n[Journey] ${icon} ${result.journey} (총 ${(result.totalDurationMs / 1000).toFixed(1)}s, 이슈 ${result.issueCount}건)`)
  for (const s of result.steps) {
    const si = s.status === 'FAIL' ? '❌' : s.status === 'WARN' ? '⚠️' : '  '
    console.log(`  ${si} ${s.step} (${s.durationMs}ms)${s.issue ? ' → ' + s.issue : ''}`)
  }
}

// 각 여정 결과를 개별 파일로 저장 — afterAll 없이 동작 (fullyParallel 대응)
const JOURNEYS_DIR = path.join(process.cwd(), 'assets/qa-report/journeys-19')

const JOURNEY_KEYS: Record<string, string> = {
  '비로그인 첫 방문 탐색': '01-guest-first-visit',
  '커뮤니티 게시판 탐색': '02-community-browse',
  '검색 사용': '03-search',
  '일자리 + 매거진 탐색': '04-jobs-magazine',
  '로그인 유저 핵심 기능': '05-logged-in-user',
}

function saveJourneyResult(result: JourneyResult) {
  fs.mkdirSync(JOURNEYS_DIR, { recursive: true })
  const key = (JOURNEY_KEYS[result.journey] ?? (result.journey.replace(/\s+/g, '-').replace(/[^\w-]/g, '') || 'journey'))
  fs.writeFileSync(path.join(JOURNEYS_DIR, `${key}.json`), JSON.stringify(result))
}

// ─── 결과 저장소 ───────────────────────────────────────────────────────────────

test.describe('고객 여정 병목 감사', () => {

// ─── 여정 1: 비로그인 첫 방문 탐색 ──────────────────────────────────────────────

test('여정 1 — 비로그인 첫 방문 탐색', async ({ page }) => {
  test.setTimeout(60_000)
  const steps: JourneyStep[] = []

  steps.push(await measureStep('홈 페이지 접근', async () => {
    const res = await page.goto('/', { waitUntil: 'domcontentloaded' })
    if (res?.status() !== 200) return `HTTP ${res?.status()}`
    const hasContent = await page.$('main, [role="main"]')
    if (!hasContent) return '메인 콘텐츠 영역 없음'
  }))

  steps.push(await measureStep('베스트 페이지 이동', async () => {
    await page.goto('/best', { waitUntil: 'domcontentloaded' })
    const hasPosts = await page.$('article, [data-testid="post"], .post-card, a[href*="/community/"]')
    if (!hasPosts) return '게시글 목록 없음 (데이터 없거나 렌더링 실패)'
  }))

  steps.push(await measureStep('게시글 상세 진입', async () => {
    // 게시판 목록 URL(/community/stories)이 아닌 실제 게시글 URL(/community/stories/123) 찾기
    const postHref = await page.$$eval(
      'a[href*="/community/"]',
      (links) => {
        const href = links
          .map((a) => a.getAttribute('href') ?? '')
          .find((h) => h.split('/').filter(Boolean).length >= 3)
        return href ?? null
      }
    )
    if (!postHref) return '클릭 가능한 게시글 링크 없음 (게시글이 없거나 베스트 목록 비어있음)'
    await page.goto(postHref, { waitUntil: 'domcontentloaded', timeout: 20_000 })
    const url = page.url()
    if (!url.includes('/community/')) return `게시글 상세 페이지 이동 실패: ${url}`
  }))

  steps.push(await measureStep('댓글 작성 시도 → 로그인 유도 확인', async () => {
    // 댓글 입력창 또는 로그인 유도 버튼 찾기
    const commentInput = await page.$('textarea[placeholder*="댓글"], input[placeholder*="댓글"]')
    const loginPrompt = await page.$('button:has-text("로그인"), a:has-text("로그인"), [data-testid="login-prompt"]')
    if (!commentInput && !loginPrompt) return '댓글 영역 없음 — 로그인 유도 UX 확인 필요'
    if (commentInput) {
      // 클릭 시 로그인 유도가 나오는지 확인
      await commentInput.click()
      await page.waitForTimeout(500)
      const loginModal = await page.$('text=로그인, text=카카오, [role="dialog"]')
      if (!loginModal) return '댓글 클릭 후 로그인 유도 없음 (비로그인 상태에서 바로 입력 가능할 수 있음)'
    }
  }))

  steps.push(await measureStep('로그인 페이지로 이동', async () => {
    await page.goto('/login', { waitUntil: 'domcontentloaded' })
    const kakaoBtn = await page.$('button:has-text("카카오"), a:has-text("카카오")')
    if (!kakaoBtn) return '카카오 로그인 버튼 없음'
  }))

  const totalMs = steps.reduce((sum, s) => sum + s.durationMs, 0)
  const result: JourneyResult = {
    journey: '비로그인 첫 방문 탐색',
    steps,
    totalDurationMs: totalMs,
    issueCount: steps.filter((s) => s.status !== 'OK').length,
  }
  saveJourneyResult(result)
  logJourney(result)

  const failSteps = steps.filter((s) => s.status === 'FAIL')
  for (const s of failSteps) {
    expect.soft(false, `[여정1] ${s.step}: ${s.issue}`).toBeTruthy()
  }
})

// ─── 여정 2: 커뮤니티 게시판 탐색 ────────────────────────────────────────────────

test('여정 2 — 커뮤니티 게시판 탐색', async ({ page }) => {
  test.setTimeout(60_000)
  const steps: JourneyStep[] = []

  steps.push(await measureStep('커뮤니티 메인 접근', async () => {
    await page.goto('/community', { waitUntil: 'domcontentloaded' })
    const boardLinks = await page.$$('a[href*="/community/"]')
    if (boardLinks.length === 0) return '게시판 링크 없음'
  }))

  steps.push(await measureStep('이야기 게시판 진입', async () => {
    // /community → /community/stories: Next.js RSC 클라이언트 리다이렉트 완료 대기
    // domcontentloaded 이후에도 RSC payload로 라우터가 /community/stories로 이동함
    await page.waitForURL(/community\/stories/, { timeout: 10_000 }).catch(() => {})
    const posts = await page.$$('article, a[href*="/community/stories/"], a[href*="/community/"][href*="/post"]')
    if (posts.length === 0) return '이야기 게시판 게시글 없음'
  }))

  steps.push(await measureStep('게시글 상세 진입 및 뒤로가기', async () => {
    const postLink = await page.$('a[href*="/community/"]')
    if (!postLink) return '게시글 링크 없음'
    const postUrl = await postLink.getAttribute('href')
    await page.goto(postUrl ?? '', { waitUntil: 'domcontentloaded' })
    const content = await page.$('article, [data-testid="post-content"], .post-content')
    if (!content) return '게시글 본문 없음'
    await page.goBack({ waitUntil: 'domcontentloaded' })
  }))

  steps.push(await measureStep('공감 버튼 클릭 → 로그인 유도', async () => {
    const likeBtn = await page.$('button:has-text("공감"), button[aria-label*="공감"], [data-testid="like-btn"]')
    if (!likeBtn) return '공감 버튼 없음'
    await page.locator('button:has-text("공감"), button[aria-label*="공감"], [data-testid="like-btn"]').first().click({ timeout: 10_000 })
    await page.waitForTimeout(500)
    // 로그인 유도 확인 (dialog 또는 로그인 링크)
    const loginDialog = await page.$('[role="dialog"]')
    const loginLink = await page.$('a:has-text("로그인"), button:has-text("로그인")')
    if (!loginDialog && !loginLink) return '비로그인 공감 클릭 시 로그인 유도 없음'
  }))

  steps.push(await measureStep('유머 게시판 전환', async () => {
    const humorLink = await page.$('a:has-text("유머"), a[href*="humor"], a[href*="hwaldong"]')
    if (!humorLink) return '유머 게시판 링크 없음'
    const href = await humorLink.getAttribute('href')
    if (!href) return '유머 게시판 href 없음'
    await page.goto(href, { waitUntil: 'domcontentloaded', timeout: 15_000 })
  }))

  steps.push(await measureStep('2막준비 게시판 전환', async () => {
    await page.goto('/community/life2', { waitUntil: 'domcontentloaded', timeout: 15_000 })
    const posts = await page.$$('article, a[href*="/community/life2/"], a[href*="/community/"][href*="/post"]')
    if (posts.length === 0) return '2막준비 게시판 게시글 없음 (빈 상태 UI 확인 필요)'
  }))

  const totalMs = steps.reduce((sum, s) => sum + s.durationMs, 0)
  const result: JourneyResult = {
    journey: '커뮤니티 게시판 탐색',
    steps,
    totalDurationMs: totalMs,
    issueCount: steps.filter((s) => s.status !== 'OK').length,
  }
  saveJourneyResult(result)
  logJourney(result)

  const failSteps = steps.filter((s) => s.status === 'FAIL')
  for (const s of failSteps) {
    expect.soft(false, `[여정2] ${s.step}: ${s.issue}`).toBeTruthy()
  }
})

// ─── 여정 3: 검색 사용 ────────────────────────────────────────────────────────

test('여정 3 — 검색 사용', async ({ page }) => {
  test.setTimeout(60_000)
  const steps: JourneyStep[] = []

  steps.push(await measureStep('검색 페이지 접근', async () => {
    await page.goto('/search', { waitUntil: 'domcontentloaded' })
    const searchInput = await page.$('input[type="search"], input[placeholder*="검색"]')
    if (!searchInput) return '검색 입력창 없음'
  }))

  steps.push(await measureStep('키워드 검색 실행', async () => {
    const searchInput = await page.$('input[type="search"], input[placeholder*="검색"]')
    if (!searchInput) return '검색 입력창 없음'
    await searchInput.fill('생활')
    await searchInput.press('Enter')
    await page.waitForTimeout(2000)
    const results = await page.$$('article, [data-testid="search-result"], a[href*="/community/"]')
    const emptyState = await page.$('text=검색 결과가 없, text=결과 없, [data-testid="empty-state"]')
    if (results.length === 0 && !emptyState) return '검색 결과도 없고 빈 상태 안내도 없음'
  }))

  steps.push(await measureStep('빈 키워드 검색 → 빈 상태 확인', async () => {
    await page.goto('/search?q=존재하지않는키워드xyz123', { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(1500)
    const emptyState = await page.$('text=검색 결과가 없, text=결과 없, text=없습니다, [data-testid="empty-state"]')
    if (!emptyState) return '검색 결과 없을 때 빈 상태 안내 없음'
  }))

  steps.push(await measureStep('검색 결과 클릭 → 게시글 이동', async () => {
    await page.goto('/search?q=이야기', { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(1500)
    const resultLink = await page.$('a[href*="/community/"]')
    if (!resultLink) return '검색 결과 링크 없음 (데이터 부족 가능)'
    const href = await resultLink.getAttribute('href')
    if (!href) return '검색 결과 href 없음'
    await page.goto(href, { waitUntil: 'domcontentloaded', timeout: 15_000 })
    const url = page.url()
    if (!url.includes('/community/')) return `게시글 페이지 이동 실패: ${url}`
  }))

  const totalMs = steps.reduce((sum, s) => sum + s.durationMs, 0)
  const result: JourneyResult = {
    journey: '검색 사용',
    steps,
    totalDurationMs: totalMs,
    issueCount: steps.filter((s) => s.status !== 'OK').length,
  }
  saveJourneyResult(result)
  logJourney(result)

  const failSteps = steps.filter((s) => s.status === 'FAIL')
  for (const s of failSteps) {
    expect.soft(false, `[여정3] ${s.step}: ${s.issue}`).toBeTruthy()
  }
})

// ─── 여정 4: 일자리 + 매거진 탐색 ────────────────────────────────────────────

test('여정 4 — 일자리 + 매거진 탐색', async ({ page }) => {
  test.setTimeout(60_000)
  const steps: JourneyStep[] = []

  steps.push(await measureStep('일자리 목록 접근', async () => {
    await page.goto('/jobs', { waitUntil: 'domcontentloaded' })
    const jobs = await page.$$('article, [data-testid="job-card"], a[href*="/jobs/"]')
    if (jobs.length === 0) return '일자리 목록 없음 (데이터 없거나 렌더링 실패)'
  }))

  steps.push(await measureStep('일자리 상세 진입', async () => {
    const jobLink = await page.$('a[href*="/jobs/"]')
    if (!jobLink) return '일자리 상세 링크 없음'
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 10_000 }).catch(() => {}),
      jobLink.click(),
    ])
    const url = page.url()
    if (!url.includes('/jobs/')) return `일자리 상세 이동 실패: ${url}`
  }))

  steps.push(await measureStep('외부 링크 새탭 동작 확인', async () => {
    const externalLink = await page.$('a[target="_blank"], a[rel*="external"]')
    if (!externalLink) return '외부 링크 없음 (지원서 링크 등 확인 필요)'
    const target = await externalLink.getAttribute('target')
    if (target !== '_blank') return `외부 링크가 새탭으로 열리지 않음: target="${target}"`
  }))

  steps.push(await measureStep('매거진 목록 접근', async () => {
    await page.goto('/magazine', { waitUntil: 'domcontentloaded' })
    const articles = await page.$$('article, [data-testid="magazine-card"], a[href*="/magazine/"]')
    if (articles.length === 0) return '매거진 목록 없음'
  }))

  steps.push(await measureStep('매거진 상세 읽기', async () => {
    const articleLink = await page.$('a[href*="/magazine/"]')
    if (!articleLink) return '매거진 상세 링크 없음'
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 10_000 }).catch(() => {}),
      articleLink.click(),
    ])
    const url = page.url()
    if (!url.includes('/magazine/')) return `매거진 상세 이동 실패: ${url}`
    const content = await page.$('article, [data-testid="magazine-content"], .prose')
    if (!content) return '매거진 본문 없음'
  }))

  const totalMs = steps.reduce((sum, s) => sum + s.durationMs, 0)
  const result: JourneyResult = {
    journey: '일자리 + 매거진 탐색',
    steps,
    totalDurationMs: totalMs,
    issueCount: steps.filter((s) => s.status !== 'OK').length,
  }
  saveJourneyResult(result)
  logJourney(result)

  const failSteps = steps.filter((s) => s.status === 'FAIL')
  for (const s of failSteps) {
    expect.soft(false, `[여정4] ${s.step}: ${s.issue}`).toBeTruthy()
  }
})

// ─── 여정 5: 로그인 유저 핵심 기능 ────────────────────────────────────────────

test('여정 5 — 로그인 유저 핵심 기능', async ({ page }) => {
  test.setTimeout(60_000)
  const steps: JourneyStep[] = []

  steps.push(await measureStep('마이페이지 접근 + 등급 확인', async () => {
    await page.goto('/my', { waitUntil: 'domcontentloaded' })
    const url = page.url()
    if (url.includes('/login')) return '마이페이지 → 로그인 리다이렉트 (storageState 확인 필요)'
    const gradeText = await page.$('text=새싹, text=단골, text=따뜻한이웃, text=명예우나어인')
    if (!gradeText) return '등급명 표시 없음'
  }))

  steps.push(await measureStep('글쓰기 진입 + 에디터 렌더링', async () => {
    await page.goto('/community/write', { waitUntil: 'domcontentloaded' })
    const url = page.url()
    if (url.includes('/login')) return '글쓰기 → 로그인 리다이렉트 (storageState 확인 필요)'
    const editor = await page.$('.ProseMirror, [contenteditable="true"], [data-testid="editor"]')
    if (!editor) return '에디터 렌더링 실패'
  }))

  steps.push(await measureStep('임시저장 버튼 존재 확인', async () => {
    const draftBtn = await page.$('button:has-text("임시저장"), button:has-text("저장"), [data-testid="draft-btn"]')
    if (!draftBtn) return '임시저장 버튼 없음'
  }))

  steps.push(await measureStep('알림 페이지 접근', async () => {
    await page.goto('/my/notifications', { waitUntil: 'domcontentloaded' })
    const url = page.url()
    if (url.includes('/login')) return '알림 → 로그인 리다이렉트'
    const content = await page.$('main')
    if (!content) return '알림 페이지 콘텐츠 없음'
  }))

  steps.push(await measureStep('설정 페이지 + 폰트 크기 버튼', async () => {
    await page.goto('/my/settings', { waitUntil: 'domcontentloaded' })
    const url = page.url()
    if (url.includes('/login')) return '설정 → 로그인 리다이렉트'
    const fontBtn = await page.$('button:has-text("보통"), button:has-text("크게"), button:has-text("더 크게"), [data-testid="font-size"]')
    if (!fontBtn) return '폰트 크기 설정 버튼 없음'
  }))

  const totalMs = steps.reduce((sum, s) => sum + s.durationMs, 0)
  const result: JourneyResult = {
    journey: '로그인 유저 핵심 기능',
    steps,
    totalDurationMs: totalMs,
    issueCount: steps.filter((s) => s.status !== 'OK').length,
  }
  saveJourneyResult(result)
  logJourney(result)

  const failSteps = steps.filter((s) => s.status === 'FAIL')
  for (const s of failSteps) {
    expect.soft(false, `[여정5] ${s.step}: ${s.issue}`).toBeTruthy()
  }
})

// afterAll 제거 — 뷰어가 journeys-19/ 폴더에서 직접 취합
// (fullyParallel 환경에서 afterAll은 워커마다 따로 실행되어 신뢰불가)

}) // end describe
