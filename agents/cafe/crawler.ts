// LOCAL ONLY — 네이버 카페 크롤러는 GitHub Actions에서 실행 불가 (네이버 IP 차단)
// 로컬에서 run-pipeline.ts를 통해 실행: npx tsx agents/cafe/run-pipeline.ts
/**
 * 네이버 카페 크롤러
 * storage-state.json (쿠키)을 사용해 로그인 상태로 3개 카페 수집
 * Chrome을 닫을 필요 없이 독립 실행
 *
 * 최초 1회: Chrome 닫고 → npx tsx run-local.ts cafe/export-cookies.ts (쿠키 추출)
 * 이후: npx tsx run-local.ts cafe/crawler.ts (Chrome 열려있어도 OK)
 *
 * 전략:
 *   1차 시도: 신 형식 URL (f-e/cafes/{id}/articles/{id}) — 직접 렌더링, iframe 불필요
 *   2차 폴백: 구 형식 URL (iframe_url_utf8) — cafe_main iframe에서 추출
 */
import { chromium, type BrowserContext, type Page, type Frame, type Locator } from 'playwright'
import { existsSync, readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { prisma, disconnect } from '../core/db.js'
import { notifySlack } from '../core/notifier.js'
import { ensureSession, SESSION_HALTED_FLAG } from './session-manager.js'
import { CAFE_CONFIGS, CRAWL_LIMITS, BOARD_BLACKLIST, TOPIC_BLACKLIST, QUALITY_THRESHOLDS, COMPETITOR_KEYWORDS, SHADOW_CAFE_IDS } from './config.js'
import type { RawCafePost, CafeConfig, ContentCategory, CommentData } from './types.js'
import { calculateQualityScore, calculateKillerScore } from './quality-scorer.js'
import { computeUsableCount } from './compute-usable-count.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const STORAGE_STATE_PATH = resolve(__dirname, 'storage-state.json')

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** 자연스러운 랜덤 딜레이 — 네이버 봇 감지 패턴 회피 */
const randomDelay = (baseMs: number, minFactor = 0.7, maxFactor = 1.5): number =>
  Math.floor(baseMs * (minFactor + Math.random() * (maxFactor - minFactor)))

/** Playwright 자체 Chromium + 저장된 쿠키로 브라우저 열기 */
async function launchBrowser(): Promise<{ context: BrowserContext }> {
  // ── 세션 사전 검증 (최후 방어선) ──
  // 주 갱신은 매일 02:00 KST launchd(session-manager.ts)가 담당.
  // 크롤러 시작 직전 SESSION_HALTED 플래그 및 만료 임박 여부를 재확인.
  if (existsSync(SESSION_HALTED_FLAG)) {
    await notifySlack({
      level: 'critical',
      agent: 'CAFE_CRAWLER',
      title: '크롤러 시작 차단 — SESSION_HALTED 상태',
      body: 'NID_SES 갱신 실패로 크롤러가 차단됐습니다.\n' +
        '조치: Chrome 닫고 npx tsx agents/cafe/export-cookies.ts 실행',
    })
    process.exit(1)
  }
  try {
    await ensureSession()
  } catch {
    // ensureSession() 내부에서 이미 SESSION_HALTED 설정 + Slack 알림 전송됨
    process.exit(1)
  }

  if (!existsSync(STORAGE_STATE_PATH)) {
    throw new Error(
      '쿠키 파일 없음! 먼저 Chrome 닫고 실행:\n  npx tsx agents/cafe/export-cookies.ts',
    )
  }

  // 핵심 인증 쿠키 사전 검증 — NID_AUT, NID_SES 없으면 회원 전용 글 크롤링 불가
  const stateData = JSON.parse(readFileSync(STORAGE_STATE_PATH, 'utf-8'))
  const cookieNames = (stateData.cookies ?? []).map((c: { name: string }) => c.name)
  if (!cookieNames.includes('NID_AUT') || !cookieNames.includes('NID_SES')) {
    throw new Error(
      '쿠키에 NID_AUT/NID_SES 없음! 네이버 로그인 쿠키가 필요합니다.\n' +
      'Chrome 닫고 실행: npx tsx agents/cafe/export-cookies.ts',
    )
  }

  // 쿠키 타입 정규화 — Python 추출 시 secure/httpOnly가 number(0/1)로 저장될 수 있음
  if (stateData.cookies) {
    for (const cookie of stateData.cookies) {
      if (typeof cookie.secure !== 'boolean') cookie.secure = Boolean(cookie.secure)
      if (typeof cookie.httpOnly !== 'boolean') cookie.httpOnly = Boolean(cookie.httpOnly)
    }
  }

  // headless: false 필수 — 네이버 카페는 headless 봇을 탐지/차단함
  // launchd 실행 시에도 화면이 필요 (macOS는 로그인 상태면 display 사용 가능)
  const browser = await chromium.launch({
    headless: false,
    args: [
      '--disable-blink-features=AutomationControlled',
      '--no-first-run',
      '--disable-dev-shm-usage',
    ],
  })

  const context = await browser.newContext({
    storageState: stateData,
    viewport: { width: 1280, height: 900 },
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  })

  return { context }
}

/** 안전하게 텍스트 추출 — 여러 셀렉터를 순서대로 시도 */
async function safeText(
  frame: Page | Frame,
  selectors: string[],
  fallback: string = '',
  opts?: { preserveBreaks?: boolean },
): Promise<string> {
  const preserveBreaks = opts?.preserveBreaks ?? false
  for (const sel of selectors) {
    try {
      const el = frame.locator(sel).first()
      const count = await el.count()
      if (count > 0) {
        // style/script/noscript 노드 제거 후 textContent (PZP UI 텍스트 오염 방어)
        // preserveBreaks: 본문 전용 — 블록 요소 경계/<br>를 \n으로 보존(문단 가독성).
        //   인라인(span 등)은 절대 건드리지 않음 → 오염 필터 시그널 어구가 \n으로 쪼개지지 않게(R1).
        const text = await el.evaluate((node: Element, preserve: boolean) => {
          const clone = node.cloneNode(true) as Element
          clone.querySelectorAll('style, script, noscript').forEach(e => e.remove())
          if (preserve) {
            clone.querySelectorAll('br').forEach(br => br.replaceWith('\n'))
            // 문단성 블록 → \n\n (toCuratedHtmlContent가 <p>로 분리)
            clone
              .querySelectorAll('p, li, blockquote, h1, h2, h3, h4, h5, h6, .se-text-paragraph')
              .forEach(b => b.append('\n\n'))
            // 레이아웃 블록 → \n (문단 아닐 수 있음, 과다 분리 방지)
            clone.querySelectorAll('div, .se-module, .se-component').forEach(b => b.append('\n'))
          }
          return clone.textContent ?? ''
        }, preserveBreaks)
        if (preserveBreaks) {
          // 줄단위 trim + 빈 줄 최대 1개(문단 구분=\n\n)로 정규화
          const norm = text.split('\n').map(l => l.trim()).join('\n').replace(/\n{3,}/g, '\n\n').trim()
          if (norm) return norm
        } else if (text?.trim()) {
          return text.trim()
        }
      }
    } catch {
      // 다음 셀렉터 시도
    }
  }
  return fallback
}

/** 미디어(이미지/GIF/동영상) URL 추출 */
async function extractMedia(target: Page | Frame): Promise<{
  imageUrls: string[]
  videoUrls: string[]
  thumbnailUrl: string | null
}> {
  const imageUrls: string[] = []
  const videoUrls: string[] = []

  try {
    // 이미지 추출 — 본문 영역의 img 태그에서 src 수집
    const images = await target.locator([
      '.se-main-container img',
      '.ContentRenderer img',
      '.article_viewer img',
      '.content_area img',
      '#body img',
    ].join(', ')).all()

    for (const img of images) {
      const src = await img.getAttribute('src').catch(() => null)
        ?? await img.getAttribute('data-src').catch(() => null)
        ?? await img.getAttribute('data-lazy-src').catch(() => null)

      if (!src) continue

      // 실제 콘텐츠 이미지만 필터 (아이콘, 이모지, 트래킹 픽셀 제외)
      if (
        src.includes('cafe.pstatic.net/cafechat') ||  // 채팅 아이콘
        src.includes('static.nid.naver.com') ||       // 네이버 UI 아이콘
        src.includes('ssl.pstatic.net/static') ||     // 정적 리소스
        src.includes('castbox') ||
        src.length < 30 ||
        src.includes('/blank.gif') ||
        src.includes('spacer.gif') ||
        src.includes('1x1') ||
        src.endsWith('.svg')
      ) continue

      // GIF도 이미지로 처리 (확장자로 구분 가능)
      const cleanUrl = src.split('?')[0]  // 쿼리 파라미터 제거하여 확장자 확인용
      if (cleanUrl) {
        imageUrls.push(src)  // 원본 URL 유지 (CDN 파라미터 포함)
      }
    }

    // 동영상 추출 — video 태그 + iframe 임베드 (YouTube, Naver TV 등)
    const videos = await target.locator([
      '.se-main-container video source',
      '.ContentRenderer video source',
      '.article_viewer video source',
      'video source',
    ].join(', ')).all()

    for (const video of videos) {
      const src = await video.getAttribute('src').catch(() => null)
      if (src && src.length > 20) videoUrls.push(src)
    }

    // iframe 기반 동영상 (YouTube, Naver TV, Vimeo)
    const iframes = await target.locator([
      '.se-main-container iframe',
      '.ContentRenderer iframe',
      '.article_viewer iframe',
      'iframe[src*="youtube"]',
      'iframe[src*="tv.naver"]',
      'iframe[src*="vimeo"]',
    ].join(', ')).all()

    for (const iframe of iframes) {
      const src = await iframe.getAttribute('src').catch(() => null)
      if (src && (
        src.includes('youtube.com') || src.includes('youtu.be') ||
        src.includes('tv.naver.com') || src.includes('vimeo.com') ||
        src.includes('naver.me')
      )) {
        videoUrls.push(src)
      }
    }
  } catch (err) {
    console.warn('[CafeCrawler] 미디어 추출 중 오류 (무시):', err instanceof Error ? err.message : '')
  }

  // 중복 제거
  const uniqueImages = [...new Set(imageUrls)]
  const uniqueVideos = [...new Set(videoUrls)]
  const thumbnailUrl = uniqueImages[0] ?? null

  return { imageUrls: uniqueImages, videoUrls: uniqueVideos, thumbnailUrl }
}

/** 안전하게 숫자 추출 */
async function safeNumber(
  frame: Page | Frame,
  selectors: string[],
): Promise<number> {
  const text = await safeText(frame, selectors, '0')
  return parseInt(text.replace(/[^0-9]/g, ''), 10) || 0
}

/** DEEP 모드 전용 — 상위 댓글 추출 (최대 15개, 대댓글 포함) */
async function extractComments(
  target: Page | Frame,
  maxComments = 15,
): Promise<CommentData[]> {
  const comments: CommentData[] = []

  // 댓글 렌더링 대기 (동적 로드)
  await sleep(randomDelay(3000, 0.8, 1.3))
  const selectorFound = await target.waitForSelector(
    '.u_cbox_comment, .CommentItem, .comment_item',
    { timeout: 5000 },
  ).then(() => true).catch(() => false)
  if (!selectorFound) {
    console.warn('[extractComments] 댓글 셀렉터 미매칭 — 댓글 없거나 DOM 구조 변경 가능성')
  }

  // ─── 댓글 목록 렌더 확장 (lazy-load 대응) ───
  // 네이버 카페 신형 댓글은 초기 3~4개만 렌더되고 나머지는 스크롤 시 로드된다(수집 커버리지 ~40%).
  // 마지막 댓글을 scrollIntoView → 대기 → item count 재측정. maxComments 도달 / 증가 멈춤 2회 / 최대 4회면 종료.
  // 더보기 클릭은 미사용(1차): scroll 만으로 lazy-load 유도. 네이버 요청·시간 부하는 pass 4회·조기종료로 제한.
  const COUNT_SELECTOR = '.CommentItem, .comment_item, .u_cbox_comment'
  {
    let prevCount = -1
    let stagnant = 0
    for (let pass = 0; pass < 4; pass++) {
      let curCount = 0
      try { curCount = await target.locator(COUNT_SELECTOR).count() } catch { break }
      if (curCount >= maxComments) break
      if (curCount <= prevCount) {
        if (++stagnant >= 2) break  // 2회 연속 증가 없음 → 종료
      } else {
        stagnant = 0
      }
      prevCount = curCount
      try {
        await target.locator(COUNT_SELECTOR).last().scrollIntoViewIfNeeded({ timeout: 2000 })
      } catch { break }
      await sleep(randomDelay(1150, 0.7, 1.3))  // 800~1500ms 랜덤 대기 (lazy-load 여유)
    }
  }

  // 네이버 카페 신/구 형식 댓글 컨테이너 셀렉터
  const containerSelectors = [
    '.CommentItem',
    '.comment_item',
    '.u_cbox_comment',
    '.reply_item',
    '.cmt_text',
  ]

  for (const sel of containerSelectors) {
    let items: Locator[] = []
    try {
      items = await target.locator(sel).all()
    } catch {
      continue
    }
    if (items.length === 0) continue

    // ─── 신형 DOM: .CommentItem sibling 방식 ───
    // 일반 댓글과 대댓글이 동일 레벨 sibling <li>로 나열됨
    // <li class="CommentItem">          — 일반 댓글
    // <li class="CommentItem CommentItem--reply"> — 대댓글 (바로 다음 sibling)
    if (sel === '.CommentItem') {
      let commentCount = 0
      for (let i = 0; i < items.length; i++) {
        if (commentCount >= maxComments) break

        const isReply = await items[i].evaluate(
          (el: Element) => el.classList.contains('CommentItem--reply')
        )
        if (isReply) continue  // top-level 댓글로 저장 금지

        const item = items[i]

        // 작성자
        let author = '익명'
        for (const authorSel of ['.comment_nickname', '.u_cbox_nick', '.nickname', '.nick', '.comment_writer']) {
          try {
            const el = item.locator(authorSel).first()
            if (await el.count() > 0) {
              const text = await el.textContent({ timeout: 2000 })
              if (text?.trim()) { author = text.trim(); break }
            }
          } catch { /* 다음 셀렉터 */ }
        }

        // 댓글 본문
        let content = ''
        for (const contentSel of ['.text_comment', '.u_cbox_contents', '.comment_text', '.text', '.content_area']) {
          try {
            const el = item.locator(contentSel).first()
            if (await el.count() > 0) {
              const text = await el.textContent({ timeout: 2000 })
              if (text?.trim()) { content = text.trim().slice(0, 200); break }
            }
          } catch { /* 다음 셀렉터 */ }
        }
        if (!content) continue

        // 좋아요 수
        let likeCount = 0
        for (const likeSel of ['.u_cbox_cnt_recomm', '.like_count', '.recomm_count']) {
          try {
            const el = item.locator(likeSel).first()
            if (await el.count() > 0) {
              const text = await el.textContent({ timeout: 2000 })
              if (text) { likeCount = parseInt(text.replace(/[^0-9]/g, ''), 10) || 0; break }
            }
          } catch { /* 다음 셀렉터 */ }
        }

        // sibling 대댓글 수집: 이 댓글 바로 다음에 오는 CommentItem--reply들
        const replies: Array<{ author: string; content: string }> = []
        for (let j = i + 1; j < items.length && replies.length < 5; j++) {
          const isNextReply = await items[j].evaluate(
            (el: Element) => el.classList.contains('CommentItem--reply')
          )
          if (!isNextReply) break  // 연속 대댓글 블록 끝

          let replyAuthor = '익명'
          let replyContent = ''
          for (const raSel of ['.comment_nickname', '.u_cbox_nick', '.nickname', '.nick']) {
            try {
              const el = items[j].locator(raSel).first()
              if (await el.count() > 0) {
                const t = await el.textContent({ timeout: 1500 })
                if (t?.trim()) { replyAuthor = t.trim(); break }
              }
            } catch { /* skip */ }
          }
          for (const rcSel of ['.text_comment', '.u_cbox_contents', '.comment_text', '.text']) {
            try {
              const el = items[j].locator(rcSel).first()
              if (await el.count() > 0) {
                const t = await el.textContent({ timeout: 1500 })
                if (t?.trim()) { replyContent = t.trim().slice(0, 150); break }
              }
            } catch { /* skip */ }
          }
          if (replyContent) replies.push({ author: replyAuthor, content: replyContent })
        }

        comments.push({ author, content, likeCount, replies })
        commentCount++
      }
      if (comments.length > 0) break
      continue
    }

    // ─── 구형 DOM fallback: 기존 로직 유지 ───
    for (const item of items.slice(0, maxComments)) {
      // 작성자
      let author = '익명'
      for (const authorSel of ['.comment_nickname', '.u_cbox_nick', '.nickname', '.nick', '.comment_writer']) {
        try {
          const el = item.locator(authorSel).first()
          if (await el.count() > 0) {
            const text = await el.textContent({ timeout: 2000 })
            if (text?.trim()) { author = text.trim(); break }
          }
        } catch { /* 다음 셀렉터 */ }
      }

      // 댓글 본문
      let content = ''
      for (const contentSel of ['.text_comment', '.u_cbox_contents', '.comment_text', '.text', '.content_area']) {
        try {
          const el = item.locator(contentSel).first()
          if (await el.count() > 0) {
            const text = await el.textContent({ timeout: 2000 })
            if (text?.trim()) { content = text.trim().slice(0, 200); break }
          }
        } catch { /* 다음 셀렉터 */ }
      }

      if (!content) continue

      // 좋아요 수
      let likeCount = 0
      for (const likeSel of ['.u_cbox_cnt_recomm', '.like_count', '.recomm_count']) {
        try {
          const el = item.locator(likeSel).first()
          if (await el.count() > 0) {
            const text = await el.textContent({ timeout: 2000 })
            if (text) { likeCount = parseInt(text.replace(/[^0-9]/g, ''), 10) || 0; break }
          }
        } catch { /* 다음 셀렉터 */ }
      }

      // 대댓글 추출 (구형 DOM: item 자식 탐색)
      const replies: Array<{ author: string; content: string }> = []
      for (const replySel of ['.u_cbox_reply_area .u_cbox_comment', '.reply_box .reply_item', '.CommentItem__reply']) {
        try {
          const replyItems = await item.locator(replySel).all()
          for (const replyItem of replyItems.slice(0, 5)) {
            let replyAuthor = '익명'
            let replyContent = ''
            for (const raSel of ['.u_cbox_nick', '.nickname', '.nick']) {
              try {
                const el = replyItem.locator(raSel).first()
                if (await el.count() > 0) {
                  const t = await el.textContent({ timeout: 1500 })
                  if (t?.trim()) { replyAuthor = t.trim(); break }
                }
              } catch { /* skip */ }
            }
            for (const rcSel of ['.u_cbox_contents', '.comment_text', '.text']) {
              try {
                const el = replyItem.locator(rcSel).first()
                if (await el.count() > 0) {
                  const t = await el.textContent({ timeout: 1500 })
                  if (t?.trim()) { replyContent = t.trim().slice(0, 150); break }
                }
              } catch { /* skip */ }
            }
            if (replyContent) replies.push({ author: replyAuthor, content: replyContent })
          }
          if (replies.length > 0) break
        } catch { /* 다음 셀렉터 */ }
      }

      comments.push({ author, content, likeCount, replies })
    }

    if (comments.length > 0) break // 이 셀렉터로 댓글 찾았으면 중단
  }

  return comments
}

// ─── URL 수집 ─────────────────────────────────────────

interface ArticleInfo {
  articleId: string
  newFormatUrl: string   // f-e/cafes/{numericId}/articles/{id}
  oldFormatUrl: string   // cafe.naver.com/{name}?iframe_url_utf8=...
  boardName: string | null
  boardCategory: ContentCategory | null
}

/** 글 목록 URL 수집 — 게시판별 크롤링 + 메인 페이지 폴백 */
async function collectPostUrls(page: Page, cafe: CafeConfig, quickMode = false): Promise<ArticleInfo[]> {
  const collectedMap = new Map<string, ArticleInfo>() // articleId → ArticleInfo (중복 방지)

  // QUICK 모드: HIGH 게시판만, 1페이지만 수집
  const activeBoards = quickMode
    ? cafe.boards.filter(b => b.priority === 'high')
    : cafe.boards.filter(b => b.priority !== 'skip')

  // Bug 2: 0건 게시판 카운터 (menuId 변경 감지)
  let zeroBoardCount = 0
  const zeroBoardNames: string[] = []

  for (const board of activeBoards) {
    // menuId: 0 게시판은 실제 수집 불가 — isPopular가 아닌 경우만 스킵
    if (board.menuId === 0 && !board.isPopular) {
      console.warn(`[CafeCrawler] ⚠️ "${board.name}" menuId=0 — 스킵 (창업자 확인 필요)`)
      zeroBoardCount++
      zeroBoardNames.push(board.name)
      continue
    }

    try {
      // 인기글과 일반 게시판 URL 분기
      // 인기글: 구 format URL (f-e/popular는 JS 렌더링으로 비로그인 상태에서 링크 미노출)
      // 일반 게시판: f-e 신 format
      const boardUrl = board.isPopular
        ? `${cafe.url}?iframe_url_utf8=%2FCommunityReadTop.nhn%3Fclubid%3D${cafe.numericId}`
        : `https://cafe.naver.com/f-e/cafes/${cafe.numericId}/menus/${board.menuId}`
      const boardLabel = board.isPopular ? '인기글(구format)' : `menuId=${board.menuId}`
      console.log(`[CafeCrawler] ${cafe.name} — 게시판 "${board.name}" (${boardLabel}) 수집 중...`)
      await page.goto(boardUrl, { waitUntil: 'domcontentloaded', timeout: CRAWL_LIMITS.pageTimeout })
      await sleep(randomDelay(3000, 0.8, 1.5))

      // 스크롤하여 더 많은 글 로드 (QUICK 모드: 1페이지만)
      const scrollCount = quickMode ? 1 : Math.min(board.maxPages, 3)
      for (let i = 0; i < scrollCount; i++) {
        await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
        await sleep(1500)
      }

      // 인기글: 구 format href 패턴 (articleid=N), 일반: 신 format (/articles/N)
      const selector = board.isPopular ? 'a[href*="articleid"]' : 'a[href*="/articles/"]'
      const links = await page.locator(selector).all()
      if (board.isPopular) {
        console.log(`[CafeCrawler] 인기글 셀렉터 매칭: ${links.length}개 링크 발견`)
      }
      let boardCount = 0
      for (const link of links) {
        const href = await link.getAttribute('href')
        if (!href) continue
        // 인기글: articleid=N 패턴, 일반: /articles/N 패턴
        const match = board.isPopular
          ? href.match(/articleid=(\d+)/)
          : href.match(/\/articles\/(\d+)/)
        if (match && !collectedMap.has(match[1])) {
          collectedMap.set(match[1], {
            articleId: match[1],
            newFormatUrl: `https://cafe.naver.com/f-e/cafes/${cafe.numericId}/articles/${match[1]}`,
            oldFormatUrl: `${cafe.url}?iframe_url_utf8=%2FArticleRead.nhn%253Fclubid%3D${cafe.numericId}%2526articleid%3D${match[1]}`,
            boardName: board.name,
            boardCategory: board.category,
          })
          boardCount++
        }
      }
      console.log(`[CafeCrawler] ${cafe.name} 게시판 "${board.name}": ${boardCount}개 신규 수집 (총 ${collectedMap.size}개)`)

      // Bug 2: 0건 경고 — 일반 게시판(menuId 변경 의심) + 인기글(구format URL 문제 의심) 모두 감지
      if (boardCount === 0) {
        const reason = board.isPopular
          ? '인기글 구format URL 매칭 실패 — CommunityReadTop.nhn 접근 불가 의심'
          : `menuId=${board.menuId} 변경 의심`
        console.warn(`[CafeCrawler] ⚠️ "${board.name}" — 0건. ${reason}`)
        zeroBoardCount++
        zeroBoardNames.push(board.isPopular ? `${board.name}(인기글)` : `${board.name}(menuId=${board.menuId})`)
      }

      // 게시판 간 딜레이 — medium 게시판은 단축
      if (activeBoards.indexOf(board) < activeBoards.length - 1) {
        const delay = board.priority === 'medium'
          ? CRAWL_LIMITS.delayBetweenPagesMedium
          : CRAWL_LIMITS.delayBetweenPages
        await sleep(randomDelay(delay))
      }
    } catch (err) {
      console.warn(`[CafeCrawler] ${cafe.name} 게시판 "${board.name}" 실패:`, err)
    }
  }

  // Bug 2: 50% 이상 게시판이 0건이면 Slack 경고
  const activeCount = activeBoards.length
  if (activeCount > 0 && zeroBoardCount / activeCount >= 0.5) {
    await notifySlack({
      level: 'warning',
      agent: 'CAFE_CRAWLER',
      title: `${cafe.name}: 게시판 ${zeroBoardCount}/${activeCount}개 0건 수집`,
      body: `menuId 변경 의심 또는 미설정 게시판:\n${zeroBoardNames.slice(0, 10).join('\n')}`,
    })
  } else if (zeroBoardNames.length > 0) {
    console.warn(`[CafeCrawler] ${cafe.name}: 0건 게시판 ${zeroBoardNames.length}개 — ${zeroBoardNames.slice(0, 5).join(', ')}`)
  }

  // 방법 2: 카페 메인 페이지 (보충 — 총 수집이 10개 미만일 때)
  if (collectedMap.size < 10) {
    try {
      console.log(`[CafeCrawler] ${cafe.name} — 메인 페이지 보충 수집...`)
      await page.goto(cafe.url, { waitUntil: 'domcontentloaded', timeout: CRAWL_LIMITS.pageTimeout })
      await sleep(3000)

      const links = await page.locator('a[href*="/articles/"]').all()
      for (const link of links) {
        const href = await link.getAttribute('href')
        if (!href) continue
        const match = href.match(/\/articles\/(\d+)/)
        if (match && !collectedMap.has(match[1])) {
          collectedMap.set(match[1], {
            articleId: match[1],
            newFormatUrl: `https://cafe.naver.com/f-e/cafes/${cafe.numericId}/articles/${match[1]}`,
            oldFormatUrl: `${cafe.url}?iframe_url_utf8=%2FArticleRead.nhn%253Fclubid%3D${cafe.numericId}%2526articleid%3D${match[1]}`,
            boardName: null,
            boardCategory: null,
          })
        }
      }
      console.log(`[CafeCrawler] ${cafe.name} 메인: 총 ${collectedMap.size}개 글 ID`)
    } catch (err) {
      console.warn(`[CafeCrawler] ${cafe.name} 메인 페이지 실패:`, err)
    }
  }

  const articles = Array.from(collectedMap.values())
  // QUICK 모드: 카페당 최대 15개로 제한 (전체 50개 이내)
  const limit = quickMode ? 15 : CRAWL_LIMITS.maxPostsPerCafe
  const limited = articles.slice(0, limit)
  console.log(`[CafeCrawler] ${cafe.name}: ${limited.length}개 URL 준비 (${quickMode ? 'QUICK' : 'DEEP'} 모드)`)
  return limited
}

// ─── 전체글보기 URL 수집 (V6 — allArticles 방식) ──────────

const ALL_ARTICLES_MAX_PAGES = 14 // 페이지당 15건 × 14 = 210건 상한

/**
 * 전체글보기에서 신규 글 URL 수집 (MAX(articleId) 기준 증분 크롤)
 * - DB에 없는 articleId만 반환
 * - 첫 실행 시 최대 ALL_ARTICLES_MAX_PAGES 페이지 수집
 */
async function collectAllArticleUrls(playwrightPage: Page, cafe: CafeConfig): Promise<ArticleInfo[]> {
  if (!cafe.allArticlesUrl) return []

  // DB에서 이 카페의 최신 articleId 조회
  const latest = await prisma.cafePost.findFirst({
    where: { cafeId: cafe.id, articleId: { not: null } },
    orderBy: { articleId: 'desc' },
    select: { articleId: true },
  })
  const maxKnownId = latest?.articleId ?? 0
  console.log(`[CafeCrawler] ${cafe.name} — 전체글보기 크롤 시작. DB MAX articleId: ${maxKnownId}`)

  const collected: ArticleInfo[] = []
  let pageNum = 1

  while (pageNum <= ALL_ARTICLES_MAX_PAGES) {
    const url = `${cafe.allArticlesUrl}&page=${pageNum}`
    try {
      await playwrightPage.goto(url, { waitUntil: 'domcontentloaded', timeout: CRAWL_LIMITS.pageTimeout })
      await sleep(randomDelay(2000))

      const links = await playwrightPage.locator('a[href*="/articles/"]').all()
      const pageIds: number[] = []
      const pageArticles: ArticleInfo[] = []

      for (const link of links) {
        const href = await link.getAttribute('href')
        if (!href) continue
        const match = href.match(/\/articles\/(\d+)/)
        if (!match) continue
        const id = parseInt(match[1])
        pageIds.push(id)
        if (id <= maxKnownId) continue // 이미 DB에 있음
        if (collected.some(a => a.articleId === match[1])) continue
        pageArticles.push({
          articleId: match[1],
          newFormatUrl: `https://cafe.naver.com/f-e/cafes/${cafe.numericId}/articles/${match[1]}`,
          oldFormatUrl: `${cafe.url}?iframe_url_utf8=%2FArticleRead.nhn%253Fclubid%3D${cafe.numericId}%2526articleid%3D${match[1]}`,
          boardName: null,
          boardCategory: null,
        })
      }

      if (pageIds.length === 0) break

      const maxOnPage = Math.max(...pageIds)
      collected.push(...pageArticles)
      console.log(`[CafeCrawler] ${cafe.name} p${pageNum}: ${pageArticles.length}건 신규, maxId=${maxOnPage}`)

      // 이 페이지의 최대 articleId가 이미 DB에 있으면 → 더 이상 신규 없음
      if (maxOnPage <= maxKnownId) break
      // 이 페이지에서 새 글이 하나도 없으면 중단 (공지글만 남은 경우)
      if (pageArticles.length === 0) break

      pageNum++
      await sleep(randomDelay(CRAWL_LIMITS.delayBetweenPages))
    } catch (err) {
      console.warn(`[CafeCrawler] ${cafe.name} p${pageNum} 실패:`, err)
      break
    }
  }

  console.log(`[CafeCrawler] ${cafe.name} — 전체글보기 완료: ${collected.length}건 신규 수집 (${pageNum}페이지)`)
  return collected
}

// ─── 인기글 탭 URL 수집 (popular-sync 전용) ──────────────

/** 인기글 탭에서 articleId 목록 수집 */
async function collectPopularArticleUrls(page: Page, cafe: CafeConfig): Promise<ArticleInfo[]> {
  const popularBoard = cafe.boards.find(b => b.name.includes('인기글'))
  if (!popularBoard) {
    console.log(`[PopularSync] ${cafe.name}: 인기글 게시판 없음 — 스킵`)
    return []
  }

  const boardUrl = popularBoard.isPopular
    ? `${cafe.url}?iframe_url_utf8=%2FCommunityReadTop.nhn%3Fclubid%3D${cafe.numericId}`
    : `https://cafe.naver.com/f-e/cafes/${cafe.numericId}/menus/${popularBoard.menuId}`
  const selector = popularBoard.isPopular ? 'a[href*="articleid"]' : 'a[href*="/articles/"]'

  console.log(`[PopularSync] ${cafe.name}: 인기글 탭 수집 시작`)
  await page.goto(boardUrl, { waitUntil: 'domcontentloaded', timeout: CRAWL_LIMITS.pageTimeout })
  await sleep(randomDelay(3000, 0.8, 1.5))

  const links = await page.locator(selector).all()
  const collectedMap = new Map<string, ArticleInfo>()

  for (const link of links) {
    const href = await link.getAttribute('href')
    if (!href) continue
    const match = popularBoard.isPopular
      ? href.match(/articleid=(\d+)/)
      : href.match(/\/articles\/(\d+)/)
    if (match && !collectedMap.has(match[1])) {
      collectedMap.set(match[1], {
        articleId: match[1],
        newFormatUrl: `https://cafe.naver.com/f-e/cafes/${cafe.numericId}/articles/${match[1]}`,
        oldFormatUrl: `${cafe.url}?iframe_url_utf8=%2FArticleRead.nhn%253Fclubid%3D${cafe.numericId}%2526articleid%3D${match[1]}`,
        boardName: popularBoard.name,
        boardCategory: popularBoard.category,
      })
    }
  }

  const articles = Array.from(collectedMap.values())
  console.log(`[PopularSync] ${cafe.name}: 인기글 ${articles.length}건 수집`)
  return articles
}

// ─── 신 형식 크롤링 (f-e URL — iframe 불필요) ─────────────

/** 신 형식 URL에서 글 상세 크롤링 — cafe_main iframe 안에서 콘텐츠 추출 */
async function crawlNewFormat(page: Page, article: ArticleInfo, cafe: CafeConfig, includeComments = false): Promise<RawCafePost | null> {
  try {
    await page.goto(article.newFormatUrl, { waitUntil: 'domcontentloaded', timeout: CRAWL_LIMITS.pageTimeout })
    await sleep(randomDelay(3000, 0.8, 1.6))

    // 네이버 카페는 f-e URL도 cafe_main iframe 안에 실제 콘텐츠를 렌더링
    const cafeFrame = page.frame('cafe_main')
      ?? page.frames().find(f =>
        f.url().includes('ca-fe/cafes') || f.url().includes('ArticleRead'),
      )

    // iframe이 있으면 iframe에서, 없으면 page에서 직접 시도
    const target = cafeFrame ?? page

    if (cafeFrame) {
      // iframe 콘텐츠 렌더링 대기
      try {
        await cafeFrame.waitForSelector('.title_text, .se-title-text, .article_header, .ContentRenderer', { timeout: 8000 })
      } catch {
        // 타임아웃이어도 계속 시도
      }
      await sleep(1000)
    }

    const title = await safeText(target, [
      'h3.title_text',
      '.title_text',
      '.se-title-text',
      '.article_header h3',
      '.ArticleTitle .title_area',
      'h2.title',
    ])

    if (!title) return null

    return await buildPostFromTarget(target, article.newFormatUrl, cafe, title, article.boardName, article.boardCategory, includeComments, page)
  } catch (err) {
    console.warn(`[CafeCrawler] 신형식 실패: ${article.articleId}`, err instanceof Error ? err.message : '')
    return null
  }
}

// ─── 구 형식 크롤링 (iframe URL — 폴백) ─────────────

/** 구 형식 URL (iframe) 에서 글 상세 크롤링 */
async function crawlOldFormat(page: Page, article: ArticleInfo, cafe: CafeConfig, includeComments = false): Promise<RawCafePost | null> {
  try {
    await page.goto(article.oldFormatUrl, { waitUntil: 'domcontentloaded', timeout: CRAWL_LIMITS.pageTimeout })
    await sleep(randomDelay(2500, 0.8, 1.6))

    // cafe_main iframe 찾기
    const cafeFrame = page.frame('cafe_main')
      ?? page.frames().find(f =>
        f.url().includes('ArticleRead') || f.url().includes('ca-fe/cafes'),
      )

    if (!cafeFrame) return null

    // iframe 내 콘텐츠 렌더링 대기
    try {
      await cafeFrame.waitForSelector('.title_text, .article_header, .se-title-text', { timeout: 8000 })
    } catch {
      return null
    }

    const title = await safeText(cafeFrame, [
      'h3.title_text',
      '.title_text',
      '.se-title-text',
      '.article_header h3',
    ])

    if (!title) return null

    return await buildPostFromTarget(cafeFrame, article.oldFormatUrl, cafe, title, article.boardName, article.boardCategory, includeComments, page)
  } catch {
    return null
  }
}

// ─── 글 데이터 추출 (공통) ─────────────────────────────

/** 페이지/프레임에서 글 데이터 추출 */
async function buildPostFromTarget(
  target: Page | Frame,
  url: string,
  cafe: CafeConfig,
  title: string,
  boardName?: string | null,
  boardCategory?: ContentCategory | null,
  includeComments = false,
  mainPage?: Page,
): Promise<RawCafePost | null> {
  if (!title || title.length < 2) return null

  // 본문 — preserveBreaks: 문단/줄바꿈 보존(가독성). 제목·작성자 등 다른 safeText 호출은 미적용.
  let content = await safeText(target, [
    '.se-main-container',
    '.ContentRenderer',
    '.article_viewer',
    '.content_area .se-component',
    '.article_container .article_viewer',
    '#body',
    '.NHN_Writeform_Main',
  ], '', { preserveBreaks: true })

  if (content.length > CRAWL_LIMITS.maxContentLength) {
    content = content.slice(0, CRAWL_LIMITS.maxContentLength)
  }

  if (!content || content.length < 10) {
    // 이미지만 있는 글 — 제목이라도 저장
    content = title
  }

  // 작성자
  const author = await safeText(target, [
    '.profile_info .nickname',
    '.nick_area .nick',
    '.WriterInfo .nickname',
    '.article_writer .nickname',
    '.writer_info .nickname',
    '.profile_area .nickname',
    '.nickname',
    '.nick',
  ], '익명')

  // 카테고리
  const category = await safeText(target, [
    '.link_board',
    '.article_category',
    '.ArticleBoardCate',
    '.board_name',
  ]) || null

  // 좋아요
  const likeCount = await safeNumber(target, [
    '.like_article .u_cnt',
    '.sympathy_count',
    '.like_article em',
    '.u_likeit_list_count .u_cnt',
    '.LikeButton .count',
  ])

  // 댓글 수 — 신 포맷(.CommentItem 개수) 우선, 구 포맷(u_cbox) fallback
  await target.locator('.u_cbox_count, .u_cbox_head, .CommentItem').first().waitFor({ timeout: 2000 }).catch(() => {})
  const ciCount = await target.locator('.CommentItem').count()
  const commentCount = ciCount > 0 ? ciCount : await safeNumber(target, [
    '.u_cbox_count',
    '.u_cbox_title em',
    '.u_cbox_head em',
    '.comment_count',
    '.comment_info_count .num',
    '.CommentCount',
    '.reply_count',
    '.num_comment .num',
  ])

  // 조회수
  const viewCount = await safeNumber(target, [
    '.article_info .count',
    '.article_viewer_head .count',
    '.count',
    '.info_count .num',
  ])

  // 작성일
  const dateText = await safeText(target, [
    '.article_info .date',
    '.article_writer .date',
    '.WriterInfo .date',
    '.date',
    '.article_info span.date',
    'time',
  ])

  let postedAt = dateText ? new Date(dateText.replace(/\./g, '-').replace(/-\s/g, '-').trim()) : new Date()
  let dateParseFailure = false
  if (isNaN(postedAt.getTime())) {
    const match = dateText.match(/(\d{4})\.(\d{2})\.(\d{2})\.?\s*(\d{2}):(\d{2})/)
    if (match) {
      postedAt = new Date(
        parseInt(match[1]), parseInt(match[2]) - 1, parseInt(match[3]),
        parseInt(match[4]), parseInt(match[5]),
      )
    } else {
      // Bug 3: 날짜 파싱 실패 시 현재 시각 저장 + dateParseFailure 플래그 세팅 → quality-scorer에서 recency=0
      postedAt = new Date()
      dateParseFailure = true
    }
  }

  // 미디어 추출
  const media = await extractMedia(target)

  // DEEP 모드: 댓글 추출 (최대 15개 + 대댓글)
  // 진단(2026-05-19): 댓글은 target(cafe_main iframe, ca-fe URL) 안에 있음
  // mainPage(외부 f-e 셸)는 빈 React wrapper — 댓글 DOM 없음
  let topComments: CommentData[] | undefined = undefined
  if (includeComments) {
    topComments = await extractComments(target, 15)
    if (topComments.length === 0 && mainPage) {
      topComments = await extractComments(mainPage, 15)
    }
  }

  const mediaInfo = media.imageUrls.length + media.videoUrls.length > 0
    ? ` 이미지=${media.imageUrls.length} 동영상=${media.videoUrls.length}`
    : ''
  const commentInfo = topComments && topComments.length > 0 ? ` 댓글수집=${topComments.length}개` : ''
  console.log(`[CafeCrawler] ✓ "${title.slice(0, 30)}..." 작성자=${author} 좋아요=${likeCount} 댓글=${commentCount} 조회=${viewCount}${mediaInfo}${commentInfo}`)

  return {
    cafeId: cafe.id,
    cafeName: cafe.name,
    postUrl: url,
    title,
    content,
    author,
    category,
    boardName: boardName ?? null,
    boardCategory: boardCategory ?? null,
    likeCount,
    commentCount,
    viewCount,
    postedAt,
    dateParseFailure: dateParseFailure || undefined,
    imageUrls: media.imageUrls,
    videoUrls: media.videoUrls,
    thumbnailUrl: media.thumbnailUrl,
    topComments,
  }
}

// ─── 개별 글 크롤링 (신 형식 우선 → 구 형식 폴백) ─────────

/** 개별 글 크롤링 — 신 형식 먼저 시도, 실패 시 구 형식으로 폴백 */
async function crawlPost(page: Page, article: ArticleInfo, cafe: CafeConfig, includeComments = false): Promise<RawCafePost | null> {
  const numericArticleId = parseInt(article.articleId)

  // 1차: 신 형식 (직접 렌더링, 성공률 높음)
  const result = await crawlNewFormat(page, article, cafe, includeComments)
  if (result) {
    result.articleId = numericArticleId
    return result
  }

  // 2차: 구 형식 (iframe 기반, 폴백)
  const fallback = await crawlOldFormat(page, article, cafe, includeComments)
  if (fallback) fallback.articleId = numericArticleId
  return fallback
}

// ─── 콘텐츠 품질 방어 필터 ──────────────────────────────

const NOTICE_SIGNALS = ['게시판 안내', '인원모집', '무통보 강퇴', '신고게시판', '카톡, 쪽지'] as const

/** 이미지 의존 글 감지: 이미지가 있고 실질 텍스트(URL·공백 제거 후) 50자 미만 */
function isImageDependentContent(post: RawCafePost): boolean {
  if (post.imageUrls.length < 1) return false
  const effectiveLen = post.content
    .replace(/https?:\/\/\S+/g, '')
    .replace(/\s+/g, '')
    .length
  return effectiveLen < 50
}

/** 게시판 공지문 혼입 감지: NOTICE_SIGNALS 중 2개 이상 포함 */
function isBoardNoticeContent(content: string): boolean {
  const flat = content.replace(/\n/g, ' ') // 본문 줄바꿈(\n) 보존 후에도 시그널 어구 매칭 유지(R1)
  const hits = NOTICE_SIGNALS.filter(s => flat.includes(s)).length
  return hits >= 2
}

// shadow 소스(레몬테라스 등) 연령/타깃 필터 — 우나어(40·50·60대)에 부적합한 육아·학부모 글을 isUsable=false로 걸러낸다.
// production 카페(wgang/dlxogns01)에는 호출되지 않음(savePosts에서 SHADOW_CAFE_IDS 여부로만 적용).
const SHADOW_AGE_HARD_REJECT = ['임신', '출산', '산후', '신생아', '아기', '돌잔치', '이유식', '기저귀', '어린이집', '유치원', '유아', '초등학생', '초등', '워킹맘 복직']
const SHADOW_AGE_SOFT_REJECT = ['중학생', '고등학생', '수능', '입시', '내신', '학원', '사춘기 자녀']
const SHADOW_AGE_POSITIVE = ['40대 중후반', '50대', '60대', '갱년기', '폐경', '중년', '남편', '시댁', '친정', '성인 자녀', '대학생 자녀', '취업 자녀', '손주', '은퇴', '노후']
/** true면 우나어 타깃 적합(isUsable 허용), false면 부적합(isUsable=false). shadow 단계는 보수적으로 판정. */
function passesShadowAgeFilter(title: string, content: string): boolean {
  const flat = `${title} ${content}`.replace(/\n/g, ' ')
  if (SHADOW_AGE_HARD_REJECT.some(k => flat.includes(k))) return false // hard reject → 무조건 제외
  const hasPositive = SHADOW_AGE_POSITIVE.some(k => flat.includes(k))
  const hasSoftReject = SHADOW_AGE_SOFT_REJECT.some(k => flat.includes(k))
  if (hasSoftReject && !hasPositive) return false // soft reject + positive 없음 → 제외
  return hasPositive // 보수적: positive signal 있어야만 허용(애매글 제외)
}

// 네이버가 실제 글 대신 반환하는 접근 차단/가입 유도 안내문 시그널
const ACCESS_BLOCKED_SIGNALS = [
  '검색 비허용 게시물',
  '가입이 필요합니다',
  '카페의 멤버가 되어보세요',
  '카페에 가입하면 바로 글을 볼 수 있어요',
  '10초 만에 가입하기',
] as const

/** 접근 차단 안내문 감지: ANY 1개 이상 포함 시 true (게시판 공지문과 성격이 다름) */
function isAccessBlockedContent(content: string): boolean {
  const flat = content.replace(/\n/g, ' ') // R1: 줄바꿈 보존 후에도 안내문 매칭 유지
  return ACCESS_BLOCKED_SIGNALS.some(s => flat.includes(s))
}

// 네이버 동영상 플레이어(PZP) UI 흔적 — videoUrls 추출 실패 시 2차 감지
const STRONG_PZP_SIGNALS = [
  '.pzp', 'pzp-pc', 'pzp-poster', 'webplayer-internal-video',
  '광고 후 계속됩니다', '디버그 정보 다운로드', '고화질 재생이 가능한 영상입니다',
] as const
const WEAK_PZP_SIGNALS = [
  '재생 속도', '해상도', '자막', '음소거', '전체 화면', '자동 (480p)', '0초',
] as const

/** PZP/동영상 플레이어 UI 텍스트 감지: strong 1개 이상 또는 weak 2개 이상 */
function isVideoPlayerContent(content: string): boolean {
  const flat = content.replace(/\n/g, ' ') // R1: 줄바꿈 보존 후에도 PZP UI 텍스트 매칭 유지
  if (STRONG_PZP_SIGNALS.some(s => flat.includes(s))) return true
  return WEAK_PZP_SIGNALS.filter(s => flat.includes(s)).length >= 2
}

// ─── DB 저장 ─────────────────────────────────────────

/** DB에 저장 (중복 skip + 블랙리스트/품질 필터링) */
async function savePosts(posts: RawCafePost[]): Promise<number> {
  let saved = 0
  for (const post of posts) {
    try {
      // 1. 게시판 블랙리스트 체크
      if (post.category && BOARD_BLACKLIST.some(bl => post.category!.includes(bl))) {
        console.log(`[CafeCrawler] 블랙리스트 게시판 스킵: "${post.category}" — ${post.title.slice(0, 20)}`)
        continue
      }

      // 2. 토픽 블랙리스트 체크
      if (TOPIC_BLACKLIST.some(bl => post.title.includes(bl) || post.content.includes(bl))) {
        console.log(`[CafeCrawler] 블랙리스트 토픽 스킵: ${post.title.slice(0, 20)}`)
        continue
      }

      // 3. 경쟁사 카페 언급 체크 ('은오' 단독은 거짓양성 위험으로 제외)
      // 소스 카페 자기참조 키워드는 예외 처리 — 해당 카페 글이 자기 카페명 언급은 정상 콘텐츠
      const CAFE_SELF_KEYWORDS: Record<string, string[]> = {
        wgang: ['우갱', '우아한 갱년기', '우아한갱년기'],
        dlxogns01: ['은퇴 후 50년', '은퇴후 50년'],
      }
      const selfKeywords = CAFE_SELF_KEYWORDS[post.cafeId] ?? []
      const externalKeywords = COMPETITOR_KEYWORDS.filter(
        kw => kw !== '은오' && !selfKeywords.includes(kw)
      )
      const postSnippet = post.title + ' ' + post.content.slice(0, 1000)
      if (externalKeywords.some(kw => postSnippet.includes(kw))) {
        console.log(`[CafeCrawler] 경쟁사 언급 스킵: ${post.title.slice(0, 20)}`)
        continue
      }

      // 4. 품질 점수 계산
      const qualityScore = calculateQualityScore(post)
      const killerScore = calculateKillerScore(post)
      if (qualityScore < QUALITY_THRESHOLDS.minSave) {
        continue
      }

      // 5. 중복 체크
      const existing = await prisma.cafePost.findUnique({
        where: { postUrl: post.postUrl },
      })
      if (existing) continue

      // 5.5. 이미지 의존·공지문·접근 차단·동영상 필터
      const imageDep = isImageDependentContent(post)
      const noticeText = isBoardNoticeContent(post.content)
      const accessBlocked = isAccessBlockedContent(post.content)
      const videoBlocked = post.videoUrls.length > 0 || isVideoPlayerContent(post.content)
      // shadow 소스(레몬테라스 등) 전용 연령 필터 — production(wgang/dlxogns01)은 shadowAgeReject=false로 무영향.
      const shadowAgeReject = SHADOW_CAFE_IDS.includes(post.cafeId) && !passesShadowAgeFilter(post.title, post.content)
      if (imageDep) console.log(`[CafeCrawler] 이미지 의존 글 isUsable=false: "${post.title.slice(0, 25)}"`)
      if (noticeText) console.log(`[CafeCrawler] 게시판 공지문 isUsable=false: "${post.title.slice(0, 25)}"`)
      if (accessBlocked) console.log(`[CafeCrawler] 접근 차단 안내문 isUsable=false: "${post.title.slice(0, 25)}"`)
      if (videoBlocked) console.log(`[CafeCrawler] 동영상/PZP 포함 isUsable=false: "${post.title.slice(0, 25)}"`)
      if (shadowAgeReject) console.log(`[CafeCrawler] shadow 연령 필터 isUsable=false: "${post.title.slice(0, 25)}"`)

      // 6. 새 필드 포함하여 저장
      await prisma.cafePost.create({
        data: {
          cafeId: post.cafeId,
          cafeName: post.cafeName,
          postUrl: post.postUrl,
          title: post.title,
          content: post.content,
          author: post.author,
          category: post.category,
          boardName: post.boardName,
          boardCategory: post.boardCategory,
          qualityScore,
          killerScore,
          isUsable: qualityScore >= QUALITY_THRESHOLDS.minUsable && !imageDep && !noticeText && !accessBlocked && !videoBlocked && !shadowAgeReject,
          likeCount: post.likeCount,
          commentCount: post.commentCount,
          viewCount: post.viewCount,
          postedAt: post.postedAt,
          imageUrls: post.imageUrls,
          videoUrls: post.videoUrls,
          thumbnailUrl: post.thumbnailUrl,
          mediaCount: post.imageUrls.length + post.videoUrls.length,
          // 전체글보기 dedup 필드
          articleId: post.articleId ?? null,
          // DEEP 모드: 댓글 데이터
          topComments: post.topComments ?? undefined,
          commentCrawled: (post.topComments?.length ?? 0) > 0,
        },
      })
      saved++
    } catch (err) {
      console.warn(`[CafeCrawler] DB 저장 실패: ${post.title}`, err)
    }
  }
  return saved
}

// ─── 재크롤 갱신 (7일 이내 글 like/comment/view 최신화) ───────────────────

export async function refreshRecentPosts(): Promise<number> {
  const cutoff7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)

  const posts = await prisma.cafePost.findMany({
    where: { crawledAt: { gte: cutoff7d }, postUrl: { not: '' } },
    select: { id: true, postUrl: true, commentCount: true, likeCount: true },
    orderBy: { commentCount: 'desc' },
    take: 50,
  })

  if (posts.length === 0) {
    console.log('[CafeCrawler] 재크롤: 7일 이내 게시글 없음')
    return 0
  }

  console.log(`[CafeCrawler] 재크롤: ${posts.length}건 지표 갱신 시작`)
  const { context } = await launchBrowser()
  const page = await context.newPage()
  let updated = 0

  for (const post of posts) {
    try {
      await page.goto(post.postUrl, { waitUntil: 'domcontentloaded', timeout: 15000 })
      await page.waitForTimeout(800)

      const newLikeCount = await safeNumber(page, [
        '.like_article .u_cnt', '.sympathy_count', '.like_article em',
        '.u_likeit_list_count .u_cnt', '.LikeButton .count',
      ])
      // 댓글 수 — 신 포맷(.CommentItem) 우선, 구 포맷(u_cbox) fallback
      await page.locator('.u_cbox_count, .u_cbox_head, .CommentItem').first().waitFor({ timeout: 2000 }).catch(() => {})
      const ciCountNew = await page.locator('.CommentItem').count()
      const newCommentCount = ciCountNew > 0 ? ciCountNew : await safeNumber(page, [
        '.u_cbox_count', '.u_cbox_title em', '.u_cbox_head em',
        '.comment_count', '.comment_info_count .num', '.CommentCount',
        '.reply_count', '.num_comment .num',
      ])
      const newViewCount = await safeNumber(page, [
        '.article_info .count', '.article_viewer_head .count', '.count', '.info_count .num',
      ])

      // 차단/DOM 미매칭 시 둘 다 0으로 읽힘 → DB 0 리셋 방지
      if (newCommentCount === 0 && newLikeCount === 0) {
        console.warn(`[CafeCrawler] refresh skip(차단 의심): id=${post.id} url=${post.postUrl} 기존 댓글=${post.commentCount} 좋아요=${post.likeCount}`)
      } else if (newCommentCount !== post.commentCount || newLikeCount !== post.likeCount) {
        const commentScore = Math.min(newCommentCount * 10, 100) * 0.55
        const likeScore = Math.min(newLikeCount * 20, 100) * 0.35
        const newKillerScore = Math.round(commentScore + likeScore)

        await prisma.cafePost.update({
          where: { id: post.id },
          data: {
            likeCount: newLikeCount,
            commentCount: newCommentCount,
            viewCount: newViewCount,
            killerScore: newKillerScore,
          },
        })
        // killerScore ≥ 75 → 이미 발행된 연결 Post의 isFeatured=true (CommentWaveQueue 역추적)
        if (newKillerScore >= 75) {
          const linked = await prisma.commentWaveQueue.findMany({
            where: { cafePostId: post.id },
            select: { postId: true },
            distinct: ['postId'],
          })
          if (linked.length > 0) {
            await prisma.post.updateMany({
              where: { id: { in: linked.map(q => q.postId) }, isFeatured: false },
              data: { isFeatured: true, featuredAt: new Date() },
            })
            console.log(`[CafeCrawler] killerScore≥75 → isFeatured=true 적용 (${linked.length}건)`)
          }
        }
        updated++
        console.log(`[CafeCrawler] 갱신: 댓글 ${post.commentCount}→${newCommentCount} 좋아요 ${post.likeCount}→${newLikeCount}`)
      }
    } catch (err) {
      console.warn(`[CafeCrawler] 재크롤 실패: ${post.postUrl}`, err)
    }
  }

  // ── 댓글 재추출 부활 패스 (wgang 전용) ───────────────────────────────
  // 첫 크롤 당시 댓글이 적어 topComments usable<5로 죽은 글을, 댓글이 늘어난 지금 재추출해 되살린다.
  // refresh의 기존 루프는 commentCount/killerScore만 갱신하고 topComments는 안 건드려(=발행 게이트가 보는 값 미갱신)
  // 일반글이 영구 부적격으로 남던 문제 보완. crawlPost=DOM 파싱(AI 호출 0). cap으로 요청량 상한.
  //
  // [경로 재사용] 초기 크롤에서 검증된 crawlPost(→crawlNewFormat) 경로를 그대로 호출한다.
  //   crawlNewFormat은 goto 후 sleep(≈3~5초)로 cafe_main iframe 마운트를 기다린 뒤 target을 해석한다.
  //   과거 revive의 bespoke 경로(goto+800ms 후 즉시 frame 해석)는 신 f-e SPA가 아직 미렌더(iframe 0개, body≈245자)라
  //   cafeFrame=null→렌더대기 스킵→extract []→refreshed=0 이 반복됐다(PR#40 스크롤 보완으로도 미해결).
  //   crawlPost가 topComments/commentCount/likeCount를 채워 반환하므로 bespoke iframe 탐지·스크롤·extract를 제거한다.
  //   같은 page/browser 재사용 — 신규 네비게이션만 ≤cap. popular-sync·content-curator·requiredUsableCount(5) 무변경.
  const REVIVE_CAP = Number.parseInt(process.env.COMMENT_REVIVE_CAP ?? '10', 10)
  let rvScanned = 0, rvRefreshed = 0, rvRevived = 0, rvSkipped = 0, rvFailed = 0
  const rvSkippedIds: string[] = []  // 이번 run에서 usable<5로 skip된 cafePostId → details에 기록(당일 쿨다운용)
  const wgangCafe = CAFE_CONFIGS.find(c => c.id === 'wgang')
  if (Number.isFinite(REVIVE_CAP) && REVIVE_CAP > 0 && wgangCafe) {
    // 당일 자정 이후 COMMENT_REVIVE 에서 usable<5로 skip된 cafePostId → 오늘 재스캔 제외.
    // BotLog details(기존 로그=state)만 읽음. schema 변경·DB write 추가 없음. 자정 자동 리셋(영구 배제 방지).
    const todayStart = new Date()
    todayStart.setHours(0, 0, 0, 0)
    const reviveCooldown = new Set<string>()
    try {
      const prevLogs = await prisma.botLog.findMany({
        where: { botType: 'CAFE_CRAWLER', action: 'COMMENT_REVIVE', createdAt: { gte: todayStart } },
        orderBy: { createdAt: 'desc' }, take: 60, select: { details: true },
      })
      for (const log of prevLogs) {
        try {
          const parsed: unknown = JSON.parse(log.details ?? '{}')
          const ids = (parsed as { skippedIds?: unknown }).skippedIds
          if (Array.isArray(ids)) for (const id of ids) if (typeof id === 'string') reviveCooldown.add(id)
        } catch { /* 이 로그 details 파싱 실패 → 스킵(빈 Set fallback) */ }
      }
    } catch { /* BotLog 조회 실패 → 쿨다운 없이 진행(기존 동작) */ }

    // 대상: wgang · 7일 · 미사용 · isUsable · 댓글≥5 (usable<5는 Json이라 JS에서 필터)
    const candidates = await prisma.cafePost.findMany({
      where: { cafeId: 'wgang', crawledAt: { gte: cutoff7d }, usedAt: null, isUsable: true, commentCount: { gte: 5 } },
      select: { id: true, postUrl: true, commentCount: true, likeCount: true, topComments: true, commentCrawled: true },
      orderBy: [{ commentCrawled: 'asc' }, { commentCount: 'desc' }],
      take: REVIVE_CAP * 5,
    })
    // 살릴 가능성 순 재정렬(DB 정렬은 commentCount만 가능 → JS 재정렬) + 당일 skip 쿨다운 제외.
    // 우선순위(rank 작을수록 우선): 미수집(commentCrawled=false) > usable 3~4 > length 4~9 > gap(cc-len) 작음.
    const targets = candidates
      .filter(p => computeUsableCount(p.topComments) < 5 && !reviveCooldown.has(p.id))
      .map(p => {
        const len = Array.isArray(p.topComments) ? p.topComments.length : 0
        const u = computeUsableCount(p.topComments)
        let rank = 0
        if (p.commentCrawled) rank += 1000        // 미수집(false)을 최우선
        if (!(u === 3 || u === 4)) rank += 100      // usable 3~4 우선(한두 개만 더 살리면 되는 글)
        if (!(len >= 4 && len <= 9)) rank += 10     // length 4~9 우선(수집 여지)
        return { post: p, rank, gap: (p.commentCount ?? 0) - len }
      })
      .sort((a, b) => a.rank - b.rank || a.gap - b.gap)  // rank 오름차순, 동률이면 gap 작은(원천 짧음) 순
      .slice(0, REVIVE_CAP)
      .map(s => s.post)
    console.log(`[CommentRevive] wgang 부활 대상 ${targets.length}건 (cap ${REVIVE_CAP})`)
    for (const post of targets) {
      rvScanned++
      try {
        // 검증된 크롤 경로 재사용 — f-e URL에서 articleId 파싱해 ArticleInfo 구성 후 crawlPost 호출.
        // crawlNewFormat의 goto+sleep(≈3~5초)이 iframe 마운트를 보장 → topComments/commentCount/likeCount 반환.
        const articleId = post.postUrl.split('/articles/')[1]?.split(/[/?#]/)[0] ?? ''
        const article: ArticleInfo = {
          articleId,
          newFormatUrl: post.postUrl,
          oldFormatUrl: `${wgangCafe.url}?iframe_url_utf8=%2FArticleRead.nhn%253Fclubid%3D${wgangCafe.numericId}%2526articleid%3D${articleId}`,
          boardName: null,
          boardCategory: null,
        }
        const result = await crawlPost(page, article, wgangCafe, true) // includeComments=true → topComments 채움(AI 호출 0)
        const newComments = result?.topComments ?? []
        if (newComments.length === 0) { rvSkipped++; continue } // 추출 0(또는 크롤 실패) → 기존 topComments 보존
        rvRefreshed++
        const newUsable = computeUsableCount(newComments)
        if (newUsable >= 5) {
          // killerScore 재계산 — refresh 기존 루프와 동일 inline 공식. 신 수치는 crawlPost 결과에서 읽고, 0이면 DB값 유지
          const newCommentCount = result && result.commentCount > 0 ? result.commentCount : post.commentCount
          const newLikeCount = result && result.likeCount > 0 ? result.likeCount : post.likeCount
          const commentScore = Math.min(newCommentCount * 10, 100) * 0.55
          const likeScore = Math.min(newLikeCount * 20, 100) * 0.35
          const newKillerScore = Math.round(commentScore + likeScore)
          await prisma.cafePost.update({
            where: { id: post.id },
            data: { topComments: newComments, commentCrawled: true, commentCount: newCommentCount, likeCount: newLikeCount, killerScore: newKillerScore },
          })
          rvRevived++
          console.log(`[CommentRevive] 부활: usable→${newUsable} 댓글 ${post.commentCount}→${newCommentCount} k=${newKillerScore} ${post.postUrl}`)
        } else {
          rvSkipped++ // usable<5 → 기존 topComments 절대 미변경(보존)
          rvSkippedIds.push(post.id) // 당일 재스캔 쿨다운 대상(반복 실패 후보 slot 낭비 방지)
        }
      } catch (err) {
        rvFailed++
        console.warn(`[CommentRevive] 실패: ${post.postUrl}`, err)
      }
    }
    await prisma.botLog.create({
      data: {
        botType: 'CAFE_CRAWLER', action: 'COMMENT_REVIVE',
        status: rvFailed > 0 && rvRevived === 0 ? 'PARTIAL' : 'SUCCESS',
        itemCount: rvRevived,
        details: JSON.stringify({ scanned: rvScanned, refreshed: rvRefreshed, revivedToUsable5: rvRevived, skipped: rvSkipped, failed: rvFailed, cap: REVIVE_CAP, skippedIds: rvSkippedIds }),
      },
    })
    console.log(`[CommentRevive] 완료: scanned ${rvScanned} · revived ${rvRevived} · skipped ${rvSkipped} · failed ${rvFailed}`)
  }

  // close timeout 보호 — headless:false Chromium이 차단 상태에서 IPC 정리 중 deadlock 방지
  // browser 참조는 context.close() 전에 확보 (close 후에는 null 반환 가능)
  const browser = context.browser()
  await Promise.race([page.close(), new Promise<void>(r => setTimeout(r, 5000))])
    .catch(() => console.warn('[CafeCrawler] page.close() 5초 timeout'))
  await Promise.race([context.close(), new Promise<void>(r => setTimeout(r, 5000))])
    .catch(() => console.warn('[CafeCrawler] context.close() 5초 timeout'))
  if (browser) {
    await Promise.race([browser.close(), new Promise<void>(r => setTimeout(r, 5000))])
      .catch(() => console.warn('[CafeCrawler] browser.close() 5초 timeout'))
  }
  console.log(`[CafeCrawler] 재크롤 완료: ${updated}건 갱신 / ${posts.length}건 확인`)
  return updated
}

// ─── 인기글 동기화 (popular-sync 전용 — 락파일 없음) ────────

export async function syncPopularPosts(page: Page, cafe: CafeConfig): Promise<{ updated: number; created: number }> {
  let updated = 0
  let created = 0

  // Step 0: 해당 카페 isPopular 전체 리셋 (어제 마킹 초기화)
  await prisma.cafePost.updateMany({
    where: { cafeId: cafe.id },
    data: { isPopular: false },
  })

  const articles = await collectPopularArticleUrls(page, cafe)
  if (articles.length === 0) return { updated, created }

  for (const article of articles) {
    try {
      const numericId = parseInt(article.articleId)
      const existing = await prisma.cafePost.findFirst({
        where: { articleId: numericId, cafeId: cafe.id },
      })

      if (existing) {
        // Case A: DB에 있는 글 → 재크롤 → killerScore 갱신 + isPopular=true
        const crawled = await crawlPost(page, article, cafe, true)
        if (!crawled) continue // 삭제/비공개 → 스킵
        const newKillerScore = calculateKillerScore(crawled)
        const newUsable = computeUsableCount(crawled.topComments)
        await prisma.cafePost.update({
          where: { id: existing.id },
          data: {
            viewCount: crawled.viewCount,
            likeCount: crawled.likeCount,
            commentCount: crawled.commentCount,
            killerScore: newKillerScore,
            isPopular: true,
            popularUpdatedAt: new Date(),
            // usable≥5일 때만 덮어쓰기 — 실패·0개·부족 시 기존 topComments/commentCrawled 보호
            ...(newUsable >= 5 ? { topComments: crawled.topComments, commentCrawled: true } : {}),
          },
        })
        updated++
        console.log(`[PopularSync] ${cafe.name} A-${article.articleId}: killerScore=${newKillerScore} usable=${newUsable} 갱신`)
      } else {
        // Case B: DB 없는 글 → /popular 탭이 참여도 보증, 큐레이션 적합성은 추가 확인
        const crawled = await crawlPost(page, article, cafe, true)
        if (!crawled) continue // 삭제/비공개 → 스킵
        const qualityScore = calculateQualityScore(crawled)
        const killerScore = calculateKillerScore(crawled)
        const imageDep = isImageDependentContent(crawled)
        const noticeText = isBoardNoticeContent(crawled.content)
        const accessBlocked = isAccessBlockedContent(crawled.content)
        const videoBlocked = crawled.videoUrls.length > 0 || isVideoPlayerContent(crawled.content)
        if (imageDep) console.log(`[PopularSync] 이미지 의존 isUsable=false: "${crawled.title.slice(0, 25)}"`)
        if (noticeText) console.log(`[PopularSync] 게시판 공지문 isUsable=false: "${crawled.title.slice(0, 25)}"`)
        if (accessBlocked) console.log(`[PopularSync] 접근 차단 안내문 isUsable=false: "${crawled.title.slice(0, 25)}"`)
        if (videoBlocked) console.log(`[PopularSync] 동영상/PZP 포함 isUsable=false: "${crawled.title.slice(0, 25)}"`)
        await prisma.cafePost.create({
          data: {
            cafeId: crawled.cafeId,
            cafeName: crawled.cafeName,
            postUrl: crawled.postUrl,
            title: crawled.title,
            content: crawled.content,
            author: crawled.author,
            category: crawled.category,
            boardName: crawled.boardName,
            boardCategory: crawled.boardCategory,
            qualityScore,
            killerScore,
            isUsable: !imageDep && !noticeText && !accessBlocked && !videoBlocked,
            isPopular: true,
            popularUpdatedAt: new Date(),
            likeCount: crawled.likeCount,
            commentCount: crawled.commentCount,
            viewCount: crawled.viewCount,
            postedAt: crawled.postedAt,
            imageUrls: crawled.imageUrls,
            videoUrls: crawled.videoUrls,
            thumbnailUrl: crawled.thumbnailUrl ?? null,
            mediaCount: crawled.imageUrls.length + crawled.videoUrls.length,
            articleId: crawled.articleId ?? null,
            topComments: crawled.topComments,
            commentCrawled: (crawled.topComments?.length ?? 0) > 0,
          },
        })
        created++
        console.log(`[PopularSync] ${cafe.name} B-${article.articleId}: 신규 저장 (killerScore=${killerScore} usable=${computeUsableCount(crawled.topComments)})`)
      }
    } catch (err) {
      console.warn(`[PopularSync] ${cafe.name} article ${article.articleId} 처리 실패 (스킵):`, err)
    }
  }

  console.log(`[PopularSync] ${cafe.name}: 업데이트 ${updated}건, 신규 ${created}건`)
  return { updated, created }
}

// ─── 메인 실행 ─────────────────────────────────────────

async function main() {
  const crawlMode = process.env.CRAWL_MODE ?? 'deep'

  // ── REFRESH 모드: 7일 이내 게시글 지표 갱신 ──
  if (crawlMode === 'refresh') {
    const updated = await refreshRecentPosts()
    await prisma.botLog.create({
      data: { botType: 'CAFE_CRAWLER', action: 'CAFE_CRAWL', status: 'SUCCESS', details: JSON.stringify({ mode: 'refresh', updated }), itemCount: updated },
    })
    await Promise.race([disconnect(), new Promise(r => setTimeout(r, 5000))])
    process.exit(0)
  }

  const isQuickMode = crawlMode === 'quick'
  const isCrawlOnly = crawlMode === 'crawl-only'  // 전체글보기 전용 (P0 신규)
  const includeComments = !isQuickMode  // QUICK 모드만 미수집 (isQuickMode=true) — DEEP/CRAWL-ONLY 모두 댓글 포함

  console.log(`[CafeCrawler] 시작 — 모드: ${isCrawlOnly ? 'CRAWL-ONLY (전체글보기, 댓글 포함)' : isQuickMode ? 'QUICK (HIGH 게시판 1페이지, 댓글 없음)' : 'DEEP (전체 게시판, 댓글 포함)'}`)
  const startTime = Date.now()

  let totalCollected = 0
  let totalSaved = 0
  let totalUrls = 0
  let totalSkipped = 0

  const { context } = await launchBrowser()
  console.log('[CafeCrawler] 브라우저 실행 (Playwright Chromium + 저장된 쿠키)')
  const page = await context.newPage()
  // 개별 액션/내비게이션 상한 — pageTimeout(15s)보다 느슨한 안전망
  page.setDefaultTimeout(30_000)
  page.setDefaultNavigationTimeout(30_000)

  // CRAWL_CAFE_FILTER: 특정 카페만 크롤링 (쉼표 구분, e.g. "dlxogns01" or "wgang,dlxogns01")
  const cafeFilter = process.env.CRAWL_CAFE_FILTER
    ? process.env.CRAWL_CAFE_FILTER.split(',').map(s => s.trim())
    : null

  try {
    for (const cafe of CAFE_CONFIGS) {
      // 필터 적용: 지정된 카페만 크롤링
      if (cafeFilter && !cafeFilter.includes(cafe.id)) {
        console.log(`[CafeCrawler] ${cafe.name} 스킵 (CRAWL_CAFE_FILTER=${cafeFilter.join(',')})`)
        continue
      }

      console.log(`\n[CafeCrawler] === ${cafe.name} (${cafe.id}, #${cafe.numericId}) ===`)

      // 1) 글 URL 수집 — crawl-only: 전체글보기 / 그 외: board 루프
      const articles = isCrawlOnly && !cafe.legacyCrawler
        ? await collectAllArticleUrls(page, cafe)
        : await collectPostUrls(page, cafe, isQuickMode)
      totalUrls += articles.length

      // 2) 각 글 상세 크롤링 (연속 실패 5회 시 차단 의심 → 카페 스킵)
      const posts: RawCafePost[] = []
      let consecutiveFails = 0
      const MAX_CONSECUTIVE_FAILS = 5

      for (const article of articles) {
        if (consecutiveFails >= MAX_CONSECUTIVE_FAILS) {
          console.warn(`[CafeCrawler] ${cafe.name}: 연속 ${MAX_CONSECUTIVE_FAILS}회 실패 — 차단 의심, 이 카페 스킵`)
          break
        }

        // Pre-crawl 중복 체크 — 이미 DB에 있는 글은 브라우저 방문 없이 스킵
        const alreadySaved = await prisma.cafePost.findUnique({
          where: { postUrl: article.newFormatUrl },
          select: { id: true },
        })
        if (alreadySaved) {
          totalSkipped++
          continue
        }

        const post = await crawlPost(page, article, cafe, includeComments)
        if (post) {
          posts.push(post)
          consecutiveFails = 0
        } else {
          consecutiveFails++
        }
        // QUICK 모드: 딜레이 단축
        await sleep(randomDelay(isQuickMode ? Math.floor(CRAWL_LIMITS.delayBetweenPosts / 2) : CRAWL_LIMITS.delayBetweenPosts))
      }

      const successRate = articles.length > 0 ? Math.round(posts.length / articles.length * 100) : 0
      console.log(`[CafeCrawler] ${cafe.name}: ${posts.length}/${articles.length}개 성공 (수율 ${successRate}%)`)
      totalCollected += posts.length

      // 3) DB 저장
      const saved = await savePosts(posts)
      totalSaved += saved
      console.log(`[CafeCrawler] ${cafe.name}: ${saved}개 신규 저장 (${posts.length - saved}개 중복)`)
    }
  } finally {
    // close() 타임아웃 보호 — headless:false 브라우저가 OS 레벨에서 응답 불가 시 무한 hang 방지
    await Promise.race([
      page.close(),
      new Promise<void>(r => setTimeout(r, 10_000)),
    ]).catch(() => {})
    await Promise.race([
      context.close(),
      new Promise<void>(r => setTimeout(r, 10_000)),
    ]).catch(() => {})
  }

  const durationMs = Date.now() - startTime
  const overallRate = totalUrls > 0 ? Math.round(totalCollected / totalUrls * 100) : 0

  // BotLog 기록
  try {
    await prisma.botLog.create({
      data: {
        botType: 'CAFE_CRAWLER',
        action: isCrawlOnly ? 'CAFE_CRAWL_ALLARTICLES' : 'CAFE_CRAWL',
        status: totalSaved > 0 ? 'SUCCESS' : 'PARTIAL',
        collectedCount: totalCollected,
        publishedCount: totalSaved,
        details: JSON.stringify({
          mode: crawlMode,
          cafes: CAFE_CONFIGS.map(c => c.id),
          collected: totalCollected,
          saved: totalSaved,
          totalUrls,
          successRate: overallRate,
        }),
        itemCount: totalSaved,
        executionTimeMs: durationMs,
      },
    })
  } catch (logErr) {
    await notifySlack({ level: 'important', agent: 'CAFE_CRAWLER', title: 'BotLog 기록 실패 — CAFE_CRAWL', body: logErr instanceof Error ? logErr.message : String(logErr) }).catch(() => {})
  }

  // Slack 알림
  await notifySlack({
    level: 'info',
    agent: 'CAFE_CRAWLER',
    title: '카페 크롤링 완료',
    body: `수집: ${totalCollected}/${totalUrls}개 (수율 ${overallRate}%) / 신규 저장: ${totalSaved}개\n소요: ${Math.round(durationMs / 1000)}초`,
  })

  console.log(`\n[CafeCrawler] 완료 — [${crawlMode.toUpperCase()}] 수집 ${totalCollected}/${totalUrls} (${overallRate}%), 저장 ${totalSaved}, 중복스킵 ${totalSkipped}, ${Math.round(durationMs / 1000)}초`)
  await Promise.race([disconnect(), new Promise(r => setTimeout(r, 5000))])
  process.exit(0)
}

// 전체 실행 90분 안전망 — 정상 DEEP 크롤 40-50분의 2배 여유
// context.close() 10초 fix가 핵심이므로 이 timeout은 backup
// popular-sync.ts 등이 syncPopularPosts를 import할 때 main()이 실행되지 않도록 가드
// run-pipeline.ts는 execFileSync로 subprocess 실행하므로 isDirectRun=true가 됨
const isDirectRun = Boolean(process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]))
if (isDirectRun) {
  const TOTAL_TIMEOUT_MS = 90 * 60 * 1000
  Promise.race([
    main(),
    new Promise<void>((_, reject) =>
      setTimeout(() => reject(new Error('CRAWL_TOTAL_TIMEOUT_90MIN')), TOTAL_TIMEOUT_MS)
    ),
  ]).catch(async (err) => {
    console.error('[CafeCrawler] 치명적 오류:', err)
    const isTimeout = err instanceof Error && err.message.includes('TIMEOUT')
    await notifySlack({
      level: 'critical',
      agent: 'CAFE_CRAWLER',
      title: isTimeout ? '카페 크롤링 90분 타임아웃 — 강제 종료' : '카페 크롤링 실패',
      body: err instanceof Error ? err.message : String(err),
    })
    await Promise.race([disconnect(), new Promise(r => setTimeout(r, 5000))])
    process.exit(1)
  })
}
