/**
 * 네이버 카페 크롤러
 * 로컬 Chrome 프로필을 사용해 로그인 상태로 3개 카페 수집
 * 실행: 로컬 Mac에서만 (cron / 수동)
 */
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright'
import { prisma, disconnect } from '../core/db.js'
import { notifyTelegram } from '../core/notifier.js'
import { CAFE_CONFIGS, CHROME_USER_DATA_DIR, CHROME_PROFILE, CRAWL_LIMITS } from './config.js'
import type { RawCafePost, CafeConfig } from './types.js'

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** Chrome 로그인 세션으로 브라우저 열기 */
async function launchBrowser(): Promise<{ browser: Browser; context: BrowserContext }> {
  const browser = await chromium.launchPersistentContext(
    `${CHROME_USER_DATA_DIR}/${CHROME_PROFILE}`,
    {
      headless: false,
      channel: 'chrome',
      args: [
        '--disable-blink-features=AutomationControlled',
        '--no-first-run',
      ],
      viewport: { width: 1280, height: 900 },
      timeout: CRAWL_LIMITS.pageTimeout,
    },
  )
  return { browser: browser.browser()!, context: browser }
}

/** 네이버 카페 글 목록에서 URL 수집 */
async function collectPostUrls(page: Page, cafe: CafeConfig): Promise<string[]> {
  const urls: string[] = []

  for (const board of cafe.boards) {
    const listUrl = board.menuId === 'popular'
      ? `${cafe.url}?iframe_url=/PopularArticleList.nhn`
      : `${cafe.url}?iframe_url=/ArticleList.nhn%3Fsearch.clubid=0%26search.boardtype=L`

    console.log(`[CafeCrawler] ${cafe.name} — ${board.name} 수집 중...`)

    for (let pageNum = 1; pageNum <= board.maxPages; pageNum++) {
      try {
        await page.goto(listUrl, { waitUntil: 'domcontentloaded', timeout: CRAWL_LIMITS.pageTimeout })
        await sleep(2000)

        // 네이버 카페는 iframe 구조
        const cafeFrame = page.frame('cafe_main') ?? page.frames().find(f => f.url().includes('ArticleList') || f.url().includes('PopularArticle'))

        if (!cafeFrame) {
          console.warn(`[CafeCrawler] ${cafe.name} iframe not found, trying direct`)
          // iframe 없이 직접 접근 시도
          const links = await page.locator('a.article').all()
          for (const link of links) {
            const href = await link.getAttribute('href')
            if (href && href.includes('/articles/')) {
              const fullUrl = href.startsWith('http') ? href : `https://cafe.naver.com${href}`
              urls.push(fullUrl)
            }
          }
          continue
        }

        await cafeFrame.waitForSelector('.article-board', { timeout: 10000 }).catch(() => null)

        // 글 목록에서 링크 수집
        const articleLinks = await cafeFrame.locator('.article-board .board-list .inner_list a.article').all()
        if (articleLinks.length === 0) {
          // 다른 셀렉터 시도
          const altLinks = await cafeFrame.locator('a[href*="/articles/"]').all()
          for (const link of altLinks) {
            const href = await link.getAttribute('href')
            if (href) {
              const fullUrl = href.startsWith('http') ? href : `https://cafe.naver.com${href}`
              urls.push(fullUrl)
            }
          }
        } else {
          for (const link of articleLinks) {
            const href = await link.getAttribute('href')
            if (href) {
              const fullUrl = href.startsWith('http') ? href : `https://cafe.naver.com${href}`
              urls.push(fullUrl)
            }
          }
        }
      } catch (err) {
        console.warn(`[CafeCrawler] ${cafe.name} ${board.name} page ${pageNum} 실패:`, err)
      }

      await sleep(CRAWL_LIMITS.delayBetweenPages)
    }
  }

  // 중복 제거 + 제한
  const unique = [...new Set(urls)].slice(0, CRAWL_LIMITS.maxPostsPerCafe)
  console.log(`[CafeCrawler] ${cafe.name}: ${unique.length}개 URL 수집`)
  return unique
}

/** 개별 글 상세 크롤링 */
async function crawlPost(page: Page, url: string, cafe: CafeConfig): Promise<RawCafePost | null> {
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: CRAWL_LIMITS.pageTimeout })
    await sleep(2000)

    // iframe 내부 접근
    const cafeFrame = page.frame('cafe_main') ?? page.frames().find(f =>
      f.url().includes('ArticleRead') || f.url().includes('/articles/'),
    )

    const frame = cafeFrame ?? page

    // 제목
    const titleEl = await frame.locator('.title_text, .se-title-text, h3.title_text').first()
    const title = (await titleEl.textContent().catch(() => null))?.trim()
    if (!title) return null

    // 본문
    const contentEl = await frame.locator('.se-main-container, .ContentRenderer, .article_viewer').first()
    let content = (await contentEl.textContent().catch(() => null))?.trim() ?? ''
    if (content.length > CRAWL_LIMITS.maxContentLength) {
      content = content.slice(0, CRAWL_LIMITS.maxContentLength)
    }
    if (!content || content.length < 10) return null

    // 작성자
    const authorEl = await frame.locator('.profile_info .nickname, .nick_area .nick, .WriterInfo .nickname').first()
    const author = (await authorEl.textContent().catch(() => null))?.trim() ?? '익명'

    // 카테고리
    const categoryEl = await frame.locator('.link_board, .article_category').first()
    const category = (await categoryEl.textContent().catch(() => null))?.trim() ?? null

    // 좋아요
    const likeEl = await frame.locator('.like_article .u_cnt, .sympathy_count, .like_article em').first()
    const likeText = (await likeEl.textContent().catch(() => null))?.trim() ?? '0'
    const likeCount = parseInt(likeText.replace(/[^0-9]/g, ''), 10) || 0

    // 댓글 수
    const commentEl = await frame.locator('.comment_count, .comment_info_count .num').first()
    const commentText = (await commentEl.textContent().catch(() => null))?.trim() ?? '0'
    const commentCount = parseInt(commentText.replace(/[^0-9]/g, ''), 10) || 0

    // 조회수
    const viewEl = await frame.locator('.article_info .count, .article_viewer_head .count').first()
    const viewText = (await viewEl.textContent().catch(() => null))?.trim() ?? '0'
    const viewCount = parseInt(viewText.replace(/[^0-9]/g, ''), 10) || 0

    // 작성일
    const dateEl = await frame.locator('.article_info .date, .article_writer .date, .WriterInfo .date').first()
    const dateText = (await dateEl.textContent().catch(() => null))?.trim()
    const postedAt = dateText ? new Date(dateText) : new Date()
    if (isNaN(postedAt.getTime())) postedAt.setTime(Date.now())

    return {
      cafeId: cafe.id,
      cafeName: cafe.name,
      postUrl: url,
      title,
      content,
      author,
      category,
      likeCount,
      commentCount,
      viewCount,
      postedAt,
    }
  } catch (err) {
    console.warn(`[CafeCrawler] 글 크롤링 실패: ${url}`, err)
    return null
  }
}

/** DB에 저장 (중복 skip) */
async function savePosts(posts: RawCafePost[]): Promise<number> {
  let saved = 0
  for (const post of posts) {
    try {
      const existing = await prisma.cafePost.findUnique({
        where: { postUrl: post.postUrl },
      })
      if (existing) continue

      await prisma.cafePost.create({
        data: {
          cafeId: post.cafeId,
          cafeName: post.cafeName,
          postUrl: post.postUrl,
          title: post.title,
          content: post.content,
          author: post.author,
          category: post.category,
          likeCount: post.likeCount,
          commentCount: post.commentCount,
          viewCount: post.viewCount,
          postedAt: post.postedAt,
        },
      })
      saved++
    } catch (err) {
      console.warn(`[CafeCrawler] DB 저장 실패: ${post.title}`, err)
    }
  }
  return saved
}

/** 메인 실행 */
async function main() {
  console.log('[CafeCrawler] 시작 — 네이버 카페 3곳 크롤링')
  const startTime = Date.now()

  let totalCollected = 0
  let totalSaved = 0

  const { context } = await launchBrowser()
  const page = await context.newPage()

  try {
    for (const cafe of CAFE_CONFIGS) {
      console.log(`\n[CafeCrawler] === ${cafe.name} (${cafe.id}) ===`)

      // 1) 글 URL 수집
      const urls = await collectPostUrls(page, cafe)

      // 2) 각 글 상세 크롤링
      const posts: RawCafePost[] = []
      for (const url of urls) {
        const post = await crawlPost(page, url, cafe)
        if (post) posts.push(post)
        await sleep(CRAWL_LIMITS.delayBetweenPosts)
      }

      console.log(`[CafeCrawler] ${cafe.name}: ${posts.length}개 글 크롤링 완료`)
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
      }),
      itemCount: totalSaved,
      executionTimeMs: durationMs,
    },
  })

  // 텔레그램 알림
  await notifyTelegram({
    level: 'info',
    agent: 'CAFE_CRAWLER',
    title: '카페 크롤링 완료',
    body: `수집: ${totalCollected}개 / 신규 저장: ${totalSaved}개\n소요: ${Math.round(durationMs / 1000)}초`,
  })

  console.log(`\n[CafeCrawler] 완료 — 수집 ${totalCollected}, 저장 ${totalSaved}, ${Math.round(durationMs / 1000)}초`)
  await disconnect()
}

main().catch(async (err) => {
  console.error('[CafeCrawler] 치명적 오류:', err)
  await notifyTelegram({
    level: 'critical',
    agent: 'CAFE_CRAWLER',
    title: '카페 크롤링 실패',
    body: err instanceof Error ? err.message : String(err),
  })
  await disconnect()
  process.exit(1)
})
