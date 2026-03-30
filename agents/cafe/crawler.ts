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
import { chromium, type BrowserContext, type Page, type Frame } from 'playwright'
import { existsSync, readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { prisma, disconnect } from '../core/db.js'
import { notifySlack } from '../core/notifier.js'
import { CAFE_CONFIGS, CRAWL_LIMITS, BOARD_BLACKLIST, TOPIC_BLACKLIST, QUALITY_THRESHOLDS } from './config.js'
import type { RawCafePost, CafeConfig, ContentCategory } from './types.js'
import { calculateQualityScore } from './quality-scorer.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const STORAGE_STATE_PATH = resolve(__dirname, 'storage-state.json')

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** Playwright 자체 Chromium + 저장된 쿠키로 브라우저 열기 */
async function launchBrowser(): Promise<{ context: BrowserContext }> {
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
): Promise<string> {
  for (const sel of selectors) {
    try {
      const el = frame.locator(sel).first()
      const count = await el.count()
      if (count > 0) {
        const text = await el.textContent({ timeout: 3000 })
        if (text?.trim()) return text.trim()
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

// ─── URL 수집 ─────────────────────────────────────────

interface ArticleInfo {
  articleId: string
  newFormatUrl: string   // f-e/cafes/{numericId}/articles/{id}
  oldFormatUrl: string   // cafe.naver.com/{name}?iframe_url_utf8=...
  boardName: string | null
  boardCategory: ContentCategory | null
}

/** 글 목록 URL 수집 — 게시판별 크롤링 + 메인 페이지 폴백 */
async function collectPostUrls(page: Page, cafe: CafeConfig): Promise<ArticleInfo[]> {
  const collectedMap = new Map<string, ArticleInfo>() // articleId → ArticleInfo (중복 방지)

  // 방법 1: 게시판별 크롤링 (priority !== 'skip' 인 게시판만)
  const activeBoards = cafe.boards.filter(b => b.priority !== 'skip')

  for (const board of activeBoards) {
    try {
      const boardUrl = `https://cafe.naver.com/f-e/cafes/${cafe.numericId}/menus/${board.menuId}`
      console.log(`[CafeCrawler] ${cafe.name} — 게시판 "${board.name}" (menuId=${board.menuId}) 수집 중...`)
      await page.goto(boardUrl, { waitUntil: 'domcontentloaded', timeout: CRAWL_LIMITS.pageTimeout })
      await sleep(3000)

      // 스크롤하여 더 많은 글 로드
      const scrollCount = board.menuId === 0 ? 3 : Math.min(board.maxPages, 3)
      for (let i = 0; i < scrollCount; i++) {
        await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
        await sleep(1500)
      }

      const links = await page.locator('a[href*="/articles/"]').all()
      let boardCount = 0
      for (const link of links) {
        const href = await link.getAttribute('href')
        if (!href) continue
        const match = href.match(/\/articles\/(\d+)/)
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

      // 게시판 간 딜레이
      if (activeBoards.indexOf(board) < activeBoards.length - 1) {
        await sleep(CRAWL_LIMITS.delayBetweenPages)
      }
    } catch (err) {
      console.warn(`[CafeCrawler] ${cafe.name} 게시판 "${board.name}" 실패:`, err)
    }
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
  const limited = articles.slice(0, CRAWL_LIMITS.maxPostsPerCafe)
  console.log(`[CafeCrawler] ${cafe.name}: ${limited.length}개 URL 준비`)
  return limited
}

// ─── 신 형식 크롤링 (f-e URL — iframe 불필요) ─────────────

/** 신 형식 URL에서 글 상세 크롤링 — cafe_main iframe 안에서 콘텐츠 추출 */
async function crawlNewFormat(page: Page, article: ArticleInfo, cafe: CafeConfig): Promise<RawCafePost | null> {
  try {
    await page.goto(article.newFormatUrl, { waitUntil: 'domcontentloaded', timeout: CRAWL_LIMITS.pageTimeout })
    await sleep(3000)

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

    return await buildPostFromTarget(target, article.newFormatUrl, cafe, title, article.boardName, article.boardCategory)
  } catch (err) {
    console.warn(`[CafeCrawler] 신형식 실패: ${article.articleId}`, err instanceof Error ? err.message : '')
    return null
  }
}

// ─── 구 형식 크롤링 (iframe URL — 폴백) ─────────────

/** 구 형식 URL (iframe) 에서 글 상세 크롤링 */
async function crawlOldFormat(page: Page, article: ArticleInfo, cafe: CafeConfig): Promise<RawCafePost | null> {
  try {
    await page.goto(article.oldFormatUrl, { waitUntil: 'domcontentloaded', timeout: CRAWL_LIMITS.pageTimeout })
    await sleep(2500)

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

    return await buildPostFromTarget(cafeFrame, article.oldFormatUrl, cafe, title, article.boardName, article.boardCategory)
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
): Promise<RawCafePost | null> {
  if (!title || title.length < 2) return null

  // 본문
  let content = await safeText(target, [
    '.se-main-container',
    '.ContentRenderer',
    '.article_viewer',
    '.content_area .se-component',
    '.article_container .article_viewer',
    '#body',
    '.NHN_Writeform_Main',
  ])

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

  // 댓글 수
  const commentCount = await safeNumber(target, [
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
  if (isNaN(postedAt.getTime())) {
    const match = dateText.match(/(\d{4})\.(\d{2})\.(\d{2})\.?\s*(\d{2}):(\d{2})/)
    if (match) {
      postedAt = new Date(
        parseInt(match[1]), parseInt(match[2]) - 1, parseInt(match[3]),
        parseInt(match[4]), parseInt(match[5]),
      )
    } else {
      postedAt = new Date()
    }
  }

  // 미디어 추출
  const media = await extractMedia(target)

  const mediaInfo = media.imageUrls.length + media.videoUrls.length > 0
    ? ` 이미지=${media.imageUrls.length} 동영상=${media.videoUrls.length}`
    : ''
  console.log(`[CafeCrawler] ✓ "${title.slice(0, 30)}..." 작성자=${author} 좋아요=${likeCount} 댓글=${commentCount} 조회=${viewCount}${mediaInfo}`)

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
    imageUrls: media.imageUrls,
    videoUrls: media.videoUrls,
    thumbnailUrl: media.thumbnailUrl,
  }
}

// ─── 개별 글 크롤링 (신 형식 우선 → 구 형식 폴백) ─────────

/** 개별 글 크롤링 — 신 형식 먼저 시도, 실패 시 구 형식으로 폴백 */
async function crawlPost(page: Page, article: ArticleInfo, cafe: CafeConfig): Promise<RawCafePost | null> {
  // 1차: 신 형식 (직접 렌더링, 성공률 높음)
  const result = await crawlNewFormat(page, article, cafe)
  if (result) return result

  // 2차: 구 형식 (iframe 기반, 폴백)
  return crawlOldFormat(page, article, cafe)
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

      // 3. 품질 점수 계산
      const qualityScore = calculateQualityScore(post)
      if (qualityScore < QUALITY_THRESHOLDS.minSave) {
        continue
      }

      // 4. 중복 체크
      const existing = await prisma.cafePost.findUnique({
        where: { postUrl: post.postUrl },
      })
      if (existing) continue

      // 5. 새 필드 포함하여 저장
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
          isUsable: qualityScore >= QUALITY_THRESHOLDS.minUsable,
          likeCount: post.likeCount,
          commentCount: post.commentCount,
          viewCount: post.viewCount,
          postedAt: post.postedAt,
          imageUrls: post.imageUrls,
          videoUrls: post.videoUrls,
          thumbnailUrl: post.thumbnailUrl,
          mediaCount: post.imageUrls.length + post.videoUrls.length,
        },
      })
      saved++
    } catch (err) {
      console.warn(`[CafeCrawler] DB 저장 실패: ${post.title}`, err)
    }
  }
  return saved
}

// ─── 메인 실행 ─────────────────────────────────────────

async function main() {
  console.log('[CafeCrawler] 시작 — 네이버 카페 3곳 크롤링')
  const startTime = Date.now()

  let totalCollected = 0
  let totalSaved = 0
  let totalUrls = 0

  const { context } = await launchBrowser()
  console.log('[CafeCrawler] 브라우저 실행 (Playwright Chromium + 저장된 쿠키)')
  const page = await context.newPage()

  try {
    for (const cafe of CAFE_CONFIGS) {
      console.log(`\n[CafeCrawler] === ${cafe.name} (${cafe.id}, #${cafe.numericId}) ===`)

      // 1) 글 URL 수집
      const articles = await collectPostUrls(page, cafe)
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

        const post = await crawlPost(page, article, cafe)
        if (post) {
          posts.push(post)
          consecutiveFails = 0
        } else {
          consecutiveFails++
        }
        await sleep(CRAWL_LIMITS.delayBetweenPosts)
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
    await page.close()
    await context.close()
  }

  const durationMs = Date.now() - startTime
  const overallRate = totalUrls > 0 ? Math.round(totalCollected / totalUrls * 100) : 0

  // BotLog 기록
  await prisma.botLog.create({
    data: {
      botType: 'CAFE_CRAWLER',
      action: 'CAFE_CRAWL',
      status: totalSaved > 0 ? 'SUCCESS' : 'PARTIAL',
      collectedCount: totalCollected,
      publishedCount: totalSaved,
      details: JSON.stringify({
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

  // Slack 알림
  await notifySlack({
    level: 'info',
    agent: 'CAFE_CRAWLER',
    title: '카페 크롤링 완료',
    body: `수집: ${totalCollected}/${totalUrls}개 (수율 ${overallRate}%) / 신규 저장: ${totalSaved}개\n소요: ${Math.round(durationMs / 1000)}초`,
  })

  console.log(`\n[CafeCrawler] 완료 — 수집 ${totalCollected}/${totalUrls} (${overallRate}%), 저장 ${totalSaved}, ${Math.round(durationMs / 1000)}초`)
  await disconnect()
}

main().catch(async (err) => {
  console.error('[CafeCrawler] 치명적 오류:', err)
  await notifySlack({
    level: 'critical',
    agent: 'CAFE_CRAWLER',
    title: '카페 크롤링 실패',
    body: err instanceof Error ? err.message : String(err),
  })
  await disconnect()
  process.exit(1)
})
