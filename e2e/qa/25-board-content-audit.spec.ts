/**
 * QA 25 — 보드 콘텐츠 30건 감사
 *
 * 목적: RC-2 검증 (Content Quality Silent Failures 실제 발현 여부)
 *   - 빈 본문(< 50자) 게시글이 프로덕션에 존재하는지 확인
 *   - fallback 제목("의 일상") 게시글 감지
 *   - 깨진 이미지, JS 오류, UI 렌더링 이상 전수 확인
 *
 * 대상: 사는이야기(STORY) / 2막준비(LIFE2) / 웃음방(HUMOR) 최근 30건
 * 실행: npx playwright test e2e/qa/25-board-content-audit.spec.ts --project=qa-audit
 *
 * 출력: docs/audit-board-content-YYYY-MM-DD.json
 */

import { test } from '@playwright/test'
import * as fs from 'fs'
import * as path from 'path'

// ─── 타입 ──────────────────────────────────────────────────────────────────────

interface PostApiItem {
  id: string | number
  title: string
  author?: { nickname?: string } | null
  authorId?: string | null
  createdAt?: string
  boardType?: string
  category?: string
}

interface PostAuditResult {
  postId: string
  title: string
  url: string
  board: string
  // API 레벨
  apiTitleLength: number
  apiAuthorPresent: boolean
  apiCreatedAtValid: boolean
  // 상세 페이지 레벨
  httpStatus: number
  bodyText: string        // 실제 본문 내용 (200자 제한)
  bodyLength: number
  hasFallbackTitle: boolean
  brokenImages: number
  totalImages: number
  authorVisible: boolean
  timestampVisible: boolean
  consoleErrors: string[]
  // 판정
  issues: { level: 'FAIL' | 'WARN'; message: string }[]
}

interface BoardSummary {
  board: string
  label: string
  slug: string
  totalPosts: number
  checkedPosts: number
  passCount: number
  failCount: number
  warnCount: number
  rc2Suspects: number   // 빈 본문 의심 건수
  results: PostAuditResult[]
}

// ─── 설정 ──────────────────────────────────────────────────────────────────────

const BOARDS = [
  { label: '사는이야기', boardType: 'STORY', slug: 'stories' },
  { label: '2막준비',    boardType: 'LIFE2',  slug: 'life2' },
  { label: '웃음방',    boardType: 'HUMOR',  slug: 'humor' },
]

const LIMIT = 30
const BODY_MIN_LENGTH = 50  // RC-2 임계값

// 알려진 무시 콘솔 에러 (AdSense, CSP report-only 등 외부 제어 불가)
const IGNORED_ERRORS = [
  'appendChild', 'RSC payload', 'frame-ancestors', 'ERR_FAILED',
  'fonts.googleapis.com', 'adsbygoogle', 'googleads',
]

// ─── 헬퍼 ──────────────────────────────────────────────────────────────────────

function isIgnoredError(msg: string): boolean {
  return IGNORED_ERRORS.some(pattern => msg.includes(pattern))
}

function isFallbackTitle(title: string): boolean {
  return /의\s*일상$/.test(title.trim())
}

function getReportPath(): string {
  const today = new Date().toISOString().slice(0, 10)
  return path.join(process.cwd(), 'docs', `audit-board-content-${today}.json`)
}

// ─── 이슈 판정 ─────────────────────────────────────────────────────────────────

function evaluateIssues(result: Omit<PostAuditResult, 'issues'>): PostAuditResult['issues'] {
  const issues: PostAuditResult['issues'] = []

  if (result.httpStatus !== 200) {
    issues.push({ level: 'FAIL', message: `HTTP ${result.httpStatus}` })
  }
  if (result.bodyLength < BODY_MIN_LENGTH) {
    issues.push({ level: 'FAIL', message: `RC-2: 본문 ${result.bodyLength}자 (기준 ${BODY_MIN_LENGTH}자)` })
  }
  if (result.hasFallbackTitle) {
    issues.push({ level: 'WARN', message: `RC-2: fallback 제목 감지 ("의 일상" 패턴)` })
  }
  if (result.brokenImages > 0) {
    issues.push({ level: 'WARN', message: `깨진 이미지 ${result.brokenImages}/${result.totalImages}개` })
  }
  if (!result.authorVisible) {
    issues.push({ level: 'WARN', message: '작성자 미표시' })
  }
  if (!result.timestampVisible) {
    issues.push({ level: 'WARN', message: '타임스탬프 미표시' })
  }
  const filteredErrors = result.consoleErrors.filter(e => !isIgnoredError(e))
  if (filteredErrors.length > 0) {
    issues.push({ level: 'WARN', message: `JS 오류 ${filteredErrors.length}건: ${filteredErrors[0].slice(0, 80)}` })
  }

  return issues
}

// ─── 보드 감사 테스트 ───────────────────────────────────────────────────────────

const allSummaries: BoardSummary[] = []

for (const board of BOARDS) {
  test.describe(`[${board.label}] 30건 콘텐츠 감사`, () => {
    test.setTimeout(600_000) // 10분 (30건 × 페이지 이동)

    test(`${board.label} 최근 ${LIMIT}건 전수 검수`, async ({ page, request }) => {
      const boardResults: PostAuditResult[] = []

      // ── Step 1: API로 포스트 목록 조회 ──────────────────────────────────────
      const apiRes = await request.get(
        `/api/posts?boardType=${board.boardType}&limit=${LIMIT}&sort=latest`
      )

      if (!apiRes.ok()) {
        console.error(`[${board.label}] API 호출 실패: HTTP ${apiRes.status()}`)
        throw new Error(`${board.label} API 응답 오류: ${apiRes.status()}`)
      }

      const apiData = await apiRes.json() as { posts?: PostApiItem[] }
      const posts: PostApiItem[] = apiData.posts ?? []

      console.log(`\n${'─'.repeat(60)}`)
      console.log(`[${board.label}] API 반환 ${posts.length}건 (요청: ${LIMIT}건)`)
      console.log(`${'─'.repeat(60)}`)

      if (posts.length === 0) {
        console.warn(`[${board.label}] ⚠️ 게시글 없음 — 보드가 비어있거나 API 오류`)
      }

      // ── Step 2: 각 포스트 상세 페이지 검수 ─────────────────────────────────
      for (let i = 0; i < posts.length; i++) {
        const post = posts[i]
        const postId = String(post.id)
        const postUrl = `/community/${board.slug}/${postId}`

        // API 레벨 사전 검사
        const apiTitleLength = (post.title ?? '').length
        const apiAuthorPresent = !!(post.author?.nickname ?? post.authorId)
        const apiCreatedAtValid = !!(post.createdAt && !isNaN(new Date(post.createdAt).getTime()))

        // 콘솔 에러 수집
        const consoleErrors: string[] = []
        page.on('console', msg => {
          if (msg.type() === 'error') consoleErrors.push(msg.text())
        })

        // 페이지 이동
        let httpStatus = 0
        page.on('response', res => {
          if (res.url().includes(`/${postId}`) && res.status() !== 204) {
            httpStatus = res.status()
          }
        })

        try {
          await page.goto(postUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 })
        } catch {
          console.error(`  [${i + 1}/${posts.length}] ❌ 페이지 로드 실패: ${postUrl}`)
          boardResults.push({
            postId, title: post.title ?? '', url: postUrl, board: board.label,
            apiTitleLength, apiAuthorPresent, apiCreatedAtValid,
            httpStatus: 0, bodyText: '', bodyLength: 0,
            hasFallbackTitle: false, brokenImages: 0, totalImages: 0,
            authorVisible: false, timestampVisible: false, consoleErrors,
            issues: [{ level: 'FAIL', message: '페이지 로드 타임아웃' }],
          })
          continue
        }

        // ── 본문 텍스트 수집 (RC-2 핵심 체크) ──────────────────────────────
        let bodyText = ''
        let bodyLength = 0
        try {
          const bodyEl = page.locator('.post-content').first()
          const exists = await bodyEl.count()
          if (exists > 0) {
            bodyText = (await bodyEl.innerText({ timeout: 5_000 })).trim()
            bodyLength = bodyText.length
          }
        } catch {
          // 셀렉터 없음 → bodyLength = 0 유지
        }

        // ── fallback 제목 감지 ──────────────────────────────────────────────
        const hasFallbackTitle = isFallbackTitle(post.title ?? '')

        // ── 이미지 로드 상태 ────────────────────────────────────────────────
        const { brokenImages, totalImages } = await page.evaluate(() => {
          const imgs = Array.from(document.querySelectorAll('.post-content img'))
          const broken = imgs.filter(img => (img as HTMLImageElement).naturalWidth === 0).length
          return { brokenImages: broken, totalImages: imgs.length }
        })

        // ── 작성자·타임스탬프 가시성 ────────────────────────────────────────
        const authorVisible = await page.locator('[class*="author"], [data-testid="author"], time').first().isVisible().catch(() => false)
        const timestampVisible = await page.locator('time, [datetime]').first().isVisible().catch(() => false)

        // ── 이슈 판정 ───────────────────────────────────────────────────────
        const resultData: Omit<PostAuditResult, 'issues'> = {
          postId, title: post.title ?? '', url: postUrl, board: board.label,
          apiTitleLength, apiAuthorPresent, apiCreatedAtValid,
          httpStatus: httpStatus || 200,
          bodyText: bodyText.slice(0, 200),
          bodyLength, hasFallbackTitle, brokenImages, totalImages,
          authorVisible, timestampVisible, consoleErrors,
        }
        const issues = evaluateIssues(resultData)
        const result: PostAuditResult = { ...resultData, issues }
        boardResults.push(result)

        // ── 진행 로그 ───────────────────────────────────────────────────────
        const status = issues.some(i => i.level === 'FAIL') ? '❌' :
                       issues.some(i => i.level === 'WARN') ? '⚠️' : '✅'
        const issueStr = issues.length > 0 ? ` | ${issues.map(i => i.message).join(', ')}` : ''
        console.log(
          `  [${String(i + 1).padStart(2)}/${posts.length}] ${status} ` +
          `#${postId} "${(post.title ?? '').slice(0, 25)}" ` +
          `본문${bodyLength}자${issueStr}`
        )

        // 다음 포스트를 위해 이벤트 리스너 제거
        page.removeAllListeners('console')
        page.removeAllListeners('response')
      }

      // ── Step 3: 보드 요약 ──────────────────────────────────────────────────
      const failCount = boardResults.filter(r => r.issues.some(i => i.level === 'FAIL')).length
      const warnCount = boardResults.filter(r => r.issues.some(i => i.level === 'WARN') && !r.issues.some(i => i.level === 'FAIL')).length
      const passCount = boardResults.length - failCount - warnCount
      const rc2Suspects = boardResults.filter(r => r.bodyLength < BODY_MIN_LENGTH).length

      const summary: BoardSummary = {
        board: board.boardType, label: board.label, slug: board.slug,
        totalPosts: posts.length, checkedPosts: boardResults.length,
        passCount, failCount, warnCount, rc2Suspects,
        results: boardResults,
      }
      allSummaries.push(summary)

      console.log(`\n[${board.label}] 결과: ✅ ${passCount} | ⚠️ ${warnCount} | ❌ ${failCount} | RC-2 의심 ${rc2Suspects}건`)
      if (rc2Suspects > 0) {
        const suspects = boardResults.filter(r => r.bodyLength < BODY_MIN_LENGTH)
        suspects.forEach(r => console.log(`  → RC-2 의심: #${r.postId} "${r.title.slice(0, 30)}" (${r.bodyLength}자)`))
      }
    })
  })
}

// ─── 최종 보고서 저장 ──────────────────────────────────────────────────────────

test.afterAll(async () => {
  if (allSummaries.length === 0) return

  const reportPath = getReportPath()
  const report = {
    generatedAt: new Date().toISOString(),
    target: 'https://age-doesnt-matter.com',
    limit: LIMIT,
    bodyMinLength: BODY_MIN_LENGTH,
    summaries: allSummaries.map(s => ({
      label: s.label, board: s.board,
      totalPosts: s.totalPosts, checkedPosts: s.checkedPosts,
      passCount: s.passCount, failCount: s.failCount, warnCount: s.warnCount,
      rc2Suspects: s.rc2Suspects,
      passRate: s.checkedPosts > 0 ? Math.round((s.passCount / s.checkedPosts) * 100) : 0,
    })),
    details: allSummaries,
  }

  fs.mkdirSync(path.dirname(reportPath), { recursive: true })
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf-8')

  console.log(`\n${'═'.repeat(60)}`)
  console.log('보드 콘텐츠 감사 최종 요약')
  console.log('═'.repeat(60))
  for (const s of allSummaries) {
    const passRate = s.checkedPosts > 0 ? Math.round((s.passCount / s.checkedPosts) * 100) : 0
    console.log(`[${s.label}] PASS ${passRate}% (${s.passCount}/${s.checkedPosts}) | RC-2 의심 ${s.rc2Suspects}건`)
  }
  console.log(`\n보고서 저장: ${reportPath}`)
})
