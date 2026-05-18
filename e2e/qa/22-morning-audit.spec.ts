/**
 * Morning Audit — Playwright 시각 검수
 * 2026-05-18 00:00~12:10 KST 발행 게시글 전수 시각 검사
 *
 * 전제: agents/scripts/_audit-18morning.ts 먼저 실행 → /tmp/audit-18morning.json 생성
 *
 * 실행:
 *   E2E_BASE_URL=https://www.age-doesnt-matter.com \
 *   npx playwright test e2e/qa/22-morning-audit.spec.ts --project=qa-audit
 */

import { test, expect } from '@playwright/test'
import { readFileSync, existsSync, mkdirSync } from 'fs'

// ── 타입 정의 ──────────────────────────────────────────
interface AuditComment {
  id: string
  content: string
  authorEmail: string | null
  authorNickname: string | null
  parentId: string | null
  createdAt: string
  elapsedMin: string
}

interface AuditPost {
  id: string
  title: string
  content: string
  source: string
  boardType: string
  boardSlug: string
  authorEmail: string | null
  authorNickname: string
  createdAtKST: string
  createdAt: string
  desireCategory: string | null
  commentCount: number
  botCommentCount: number
  comments: AuditComment[]
}

interface AuditData {
  auditTime: string
  range: { start: string; end: string }
  summary: { totalPosts: number; totalComments: number; botComments: number; violations: number }
  posts: AuditPost[]
}

// ── JSON 로드 ───────────────────────────────────────────
const AUDIT_JSON = '/tmp/audit-18morning.json'

function loadAuditData(): AuditData {
  if (!existsSync(AUDIT_JSON)) {
    throw new Error(`감사 데이터 없음: ${AUDIT_JSON}\n먼저 실행: npx tsx agents/scripts/_audit-18morning.ts`)
  }
  return JSON.parse(readFileSync(AUDIT_JSON, 'utf-8')) as AuditData
}

const auditData = loadAuditData()

// ── ABSOLUTE_ZERO 금지 키워드 ───────────────────────────
const FORBIDDEN_KEYWORDS = [
  // 정치인명 (특정 인물 언급)
  '윤석열','이재명','한동훈','박근혜','문재인','이준석','조국',
  // 혐오 표현
  '일베','틀딱','맘충','한남','된장녀','좌빨','빨갱이','홍어','보수꼴통','진보꼴통',
  // 성인 콘텐츠
  '야동','섹스','포르노','야설','성인사이트',
  // 종교 분쟁
  '예수쟁이','불교탄압','이슬람테러',
]

// ── 봇 댓글 이모지 패턴 (금지) ─────────────────────────
const EMOJI_REGEX = /[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/u

// ── 댓글 길이 기준 ──────────────────────────────────────
const COMMENT_MIN_LEN = 10
const COMMENT_MAX_LEN = 200 // 실용적 상한 (40~80자 권장이지만 여유값)

// ── 스크린샷 저장 경로 ──────────────────────────────────
const SCREENSHOT_DIR = 'test-results/morning-audit'
mkdirSync(SCREENSHOT_DIR, { recursive: true })

// ══════════════════════════════════════════════════════
// 전체 요약 테스트
// ══════════════════════════════════════════════════════

test('감사 데이터 요약 확인', async ({ page }) => {
  const { summary } = auditData
  console.log('\n[Morning Audit Summary]')
  console.log(`총 게시글: ${summary.totalPosts}건`)
  console.log(`총 댓글: ${summary.totalComments}건 (봇: ${summary.botComments}건)`)
  console.log(`DB 감사 위반: ${summary.violations}건`)
  console.log(`Playwright 검사 대상: ${auditData.posts.length}건\n`)

  // 홈 페이지 접속 확인
  await page.goto('/')
  await expect(page).toHaveURL(/.*/)
  await page.screenshot({ path: `${SCREENSHOT_DIR}/00-home.png`, fullPage: true })
})

// ══════════════════════════════════════════════════════
// 게시글별 개별 테스트
// ══════════════════════════════════════════════════════

for (const post of auditData.posts) {
  const testName = `[${post.source}][${post.createdAtKST}] ${post.boardType} — "${post.title.slice(0, 25)}"`

  test(testName, async ({ page }) => {
    const postUrl = `/community/${post.boardSlug}/${post.id}`
    const issues: string[] = []

    // ── 페이지 접속 ──────────────────────────────────
    const response = await page.goto(postUrl, { waitUntil: 'networkidle', timeout: 30000 })
    const status = response?.status() ?? 0
    if (status !== 200) issues.push(`HTTP ${status} (기대 200)`)

    // ── 전체 스크린샷 ─────────────────────────────────
    const safeTitle = post.title.replace(/[^가-힣a-zA-Z0-9]/g, '_').slice(0, 30)
    await page.screenshot({
      path: `${SCREENSHOT_DIR}/${post.createdAtKST.replace(':','')}-${safeTitle}.png`,
      fullPage: true,
    })

    // ── 제목 검증 ─────────────────────────────────────
    // 렌더링된 h1 또는 게시글 제목 요소
    const titleEl = page.locator('h1, [data-testid="post-title"], article h1').first()
    const renderedTitle = await titleEl.textContent({ timeout: 5000 }).catch(() => null)

    if (renderedTitle) {
      const cleanTitle = renderedTitle.trim()
      const titleLen = cleanTitle.length

      // 길이 검증
      if (post.source === 'BOT' && (titleLen < 15 || titleLen > 30)) {
        issues.push(`제목 길이 ${titleLen}자 (15~30자 기준): "${cleanTitle}"`)
      }

      // HTML 잔재 검사
      if (/<[^>]+>/.test(cleanTitle)) {
        issues.push(`제목에 HTML 태그 잔재: "${cleanTitle}"`)
      }

      // ABSOLUTE_ZERO 키워드
      for (const kw of FORBIDDEN_KEYWORDS) {
        if (cleanTitle.includes(kw)) {
          issues.push(`제목 ABSOLUTE_ZERO 위반 키워드: "${kw}"`)
        }
      }

      // DB 제목과 일치 여부
      if (cleanTitle !== post.title && !cleanTitle.includes(post.title.slice(0, 10))) {
        issues.push(`제목 DB/렌더링 불일치 — DB: "${post.title}" / 화면: "${cleanTitle}"`)
      }
    } else {
      issues.push('제목 요소를 찾을 수 없음')
    }

    // ── 본문 검증 ─────────────────────────────────────
    const contentEl = page.locator('[data-testid="post-content"], article .prose, .post-content').first()
    const renderedContent = await contentEl.textContent({ timeout: 5000 }).catch(() => null)

    if (renderedContent) {
      const cleanContent = renderedContent.trim()

      // HTML 잔재 (마크다운 처리 실패 시)
      if (/#{1,6}\s|^\*{1,2}[^*]+\*{1,2}$|\[.*\]\(.*\)/.test(cleanContent)) {
        issues.push(`본문에 마크다운 미처리 잔재 감지`)
      }

      // ABSOLUTE_ZERO 키워드 (본문)
      for (const kw of FORBIDDEN_KEYWORDS) {
        if (cleanContent.includes(kw)) {
          issues.push(`본문 ABSOLUTE_ZERO 위반 키워드: "${kw}"`)
        }
      }

      // 본문 길이 (렌더링 기준)
      if (post.source === 'BOT' && cleanContent.length < 50) {
        issues.push(`본문 렌더링 내용 너무 짧음 (${cleanContent.length}자): 렌더링 실패 의심`)
      }
    }

    // ── 댓글 검수 ─────────────────────────────────────
    // 댓글 영역 로드 대기
    await page.waitForSelector('[data-testid="comments"], .comment-list, #comments', { timeout: 10000 }).catch(() => null)

    const commentItems = await page.locator('[data-testid="comment-item"], .comment-item, .comment').all()
    console.log(`  댓글 렌더링: ${commentItems.length}건 (DB commentCount: ${post.commentCount})`)

    // 댓글별 텍스트 검사
    for (let i = 0; i < commentItems.length; i++) {
      const commentText = await commentItems[i].textContent().catch(() => '')
      if (!commentText) continue
      const clean = commentText.trim()

      // ABSOLUTE_ZERO
      for (const kw of FORBIDDEN_KEYWORDS) {
        if (clean.includes(kw)) {
          issues.push(`댓글[${i}] ABSOLUTE_ZERO 위반 키워드: "${kw}"`)
        }
      }

      // 봇 댓글 이모지 (봇 게시글의 봇 댓글)
      if (post.source === 'BOT' && EMOJI_REGEX.test(clean)) {
        issues.push(`댓글[${i}] 이모지 포함 (봇 댓글 금지): "${clean.slice(0, 30)}"`)
      }
    }

    // 봇 댓글 수 렌더링 vs DB 비교
    if (commentItems.length === 0 && post.botCommentCount > 0) {
      issues.push(`댓글 렌더링 0건인데 DB에 ${post.botCommentCount}건 봇 댓글 존재 — 렌더링 실패 의심`)
    }

    // 대댓글 구조 확인 (replies가 있는 경우)
    const hasReplies = post.comments.some(c => c.parentId !== null)
    if (hasReplies) {
      const replyEls = await page.locator('[data-testid="reply-item"], .reply-item, .comment--reply').count()
      if (replyEls === 0) {
        issues.push(`대댓글 DB 존재하나 렌더링 없음`)
      }
    }

    // ── DB 댓글 내용 직접 텍스트 검사 ────────────────
    const botComments = post.comments.filter(c => c.authorEmail?.endsWith('@unao.bot'))
    for (const c of botComments) {
      // 이모지 검사 (DB 텍스트 기반)
      if (EMOJI_REGEX.test(c.content)) {
        issues.push(`봇 댓글 이모지 포함 (DB): "${c.content.slice(0, 40)}"`)
      }

      // 댓글 길이 (DB 텍스트 기반, 40~80자 권장)
      if (c.content.length < COMMENT_MIN_LEN) {
        issues.push(`봇 댓글 너무 짧음 (${c.content.length}자): "${c.content}"`)
      }
      if (c.content.length > COMMENT_MAX_LEN) {
        issues.push(`봇 댓글 너무 김 (${c.content.length}자): "${c.content.slice(0, 40)}..."`)
      }

      // ABSOLUTE_ZERO (DB 텍스트 기반)
      for (const kw of FORBIDDEN_KEYWORDS) {
        if (c.content.includes(kw)) {
          issues.push(`봇 댓글 ABSOLUTE_ZERO 위반 키워드 "${kw}": "${c.content.slice(0, 40)}"`)
        }
      }

      // 마크다운 미처리 잔재
      if (/#{1,6}\s|\*{2}.+\*{2}|\[.+\]\(.+\)/.test(c.content)) {
        issues.push(`봇 댓글 마크다운 잔재: "${c.content.slice(0, 40)}"`)
      }
    }

    // ── 스크린샷 댓글 영역 클로즈업 ──────────────────
    const commentsSection = page.locator('[data-testid="comments"], .comment-list, #comments').first()
    const commentsVisible = await commentsSection.isVisible().catch(() => false)
    if (commentsVisible) {
      await commentsSection.screenshot({
        path: `${SCREENSHOT_DIR}/${post.createdAtKST.replace(':','')}-${safeTitle}-comments.png`,
      }).catch(() => null)
    }

    // ── 결과 출력 ─────────────────────────────────────
    if (issues.length > 0) {
      console.warn(`\n  ❌ [${post.createdAtKST}] "${post.title.slice(0, 25)}"`)
      for (const iss of issues) console.warn(`     → ${iss}`)
    } else {
      console.log(`  ✅ [${post.createdAtKST}] "${post.title.slice(0, 25)}" — 이상 없음`)
    }

    // 이슈가 있으면 소프트 경고 (테스트 실패는 심각한 것만)
    const critical = issues.filter(i =>
      i.includes('ABSOLUTE_ZERO') || i.includes('HTTP') || i.includes('SEED')
    )
    if (critical.length > 0) {
      throw new Error(`심각한 이슈 발견:\n${critical.join('\n')}`)
    }
  })
}

// ══════════════════════════════════════════════════════
// 전체 DB 댓글 내용 텍스트 전수 검사 (렌더링 없이)
// ══════════════════════════════════════════════════════

test('전체 댓글 텍스트 전수 검사 (DB 기반)', async () => {
  const allBotComments = auditData.posts.flatMap(p =>
    p.comments.filter(c => c.authorEmail?.endsWith('@unao.bot'))
  )
  const allIssues: string[] = []

  for (const c of allBotComments) {
    for (const kw of FORBIDDEN_KEYWORDS) {
      if (c.content.includes(kw)) {
        allIssues.push(`[ABSOLUTE_ZERO] ${c.authorNickname}: "${kw}" — "${c.content.slice(0, 60)}"`)
      }
    }
    if (EMOJI_REGEX.test(c.content)) {
      allIssues.push(`[EMOJI] ${c.authorNickname}: "${c.content.slice(0, 60)}"`)
    }
  }

  if (allIssues.length > 0) {
    console.error('댓글 전수 검사 위반:')
    allIssues.forEach(i => console.error('  ' + i))
    throw new Error(`댓글 전수 검사 위반 ${allIssues.length}건:\n${allIssues.join('\n')}`)
  }

  console.log(`✅ 전체 봇 댓글 ${allBotComments.length}건 — ABSOLUTE_ZERO/이모지 위반 없음`)
})

// ══════════════════════════════════════════════════════
// 커뮤니티 페이지 시각 확인 (모바일 + 데스크탑)
// ══════════════════════════════════════════════════════

test('커뮤니티 메인 피드 시각 확인', async ({ page }) => {
  const boards = ['story', 'humor', 'life2']
  for (const board of boards) {
    await page.goto(`/community/${board}`, { waitUntil: 'networkidle' })
    await page.screenshot({
      path: `${SCREENSHOT_DIR}/feed-${board}.png`,
      fullPage: false,
    })
    console.log(`  /community/${board} 스크린샷 저장`)
  }
})
