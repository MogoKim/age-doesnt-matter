/**
 * 82cook 등 외부 사이트 크롤러
 * 네이버 카페와 다른 구조 → Playwright로 직접 HTML 파싱
 *
 * 82cook 커뮤니티 게시판(bn=15) 전용
 * - 목록: https://www.82cook.com/entiz/enti.php?bn=15&page=1
 * - 글: https://www.82cook.com/entiz/read.php?num=XXXXX&bn=15
 * - 로그인 불필요 (공개 게시판)
 *
 * 사용: npx tsx agents/cafe/external-crawler.ts
 */
import { chromium, type BrowserContext } from 'playwright'
import { prisma, disconnect } from '../core/db.js'
import { notifySlack } from '../core/notifier.js'
import { EXTERNAL_CONFIGS, CRAWL_LIMITS, TOPIC_BLACKLIST, QUALITY_THRESHOLDS } from './config.js'
import type { RawCafePost, ContentCategory } from './types.js'
import { calculateQualityScore } from './quality-scorer.js'

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function launchBrowser(): Promise<{ context: BrowserContext }> {
  const browser = await chromium.launch({
    headless: true,  // 82cook은 headless OK (네이버처럼 차단 안 함)
    args: ['--disable-blink-features=AutomationControlled'],
  })
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  })
  return { context }
}

interface ListItem {
  num: string
  title: string
  url: string
  author: string
  commentCount: number
  viewCount: number
  date: string
}

/** 82cook 게시판 목록 페이지에서 글 목록 추출 */
async function crawlListPage(
  context: BrowserContext,
  boardNumber: number,
  page: number,
): Promise<ListItem[]> {
  const url = `https://www.82cook.com/entiz/enti.php?bn=${boardNumber}&page=${page}`
  const p = await context.newPage()
  const items: ListItem[] = []

  try {
    await p.goto(url, { timeout: CRAWL_LIMITS.pageTimeout, waitUntil: 'domcontentloaded' })
    await sleep(1000)

    // 82cook 게시판 목록은 table 기반
    const rows = await p.$$('table.list_table tbody tr, div.list_item')

    for (const row of rows) {
      try {
        // 제목 링크 추출
        const linkEl = await row.$('a.title, td.title a, a[href*="read.php"]')
        if (!linkEl) continue

        const title = (await linkEl.textContent())?.trim() ?? ''
        const href = await linkEl.getAttribute('href')
        if (!title || !href) continue

        // num 추출 (URL에서)
        const numMatch = href.match(/num=(\d+)/)
        const num = numMatch?.[1] ?? ''
        if (!num) continue

        // 작성자
        const authorEl = await row.$('td.user_id, span.author, td:nth-child(3)')
        const author = (await authorEl?.textContent())?.trim() ?? '익명'

        // 댓글수
        const commentEl = await row.$('span.comment_count, em.reply_num')
        const commentText = (await commentEl?.textContent())?.trim() ?? '0'
        const commentCount = parseInt(commentText.replace(/[^\d]/g, ''), 10) || 0

        // 조회수
        const viewEl = await row.$('td.hit, td:nth-child(5), span.views')
        const viewText = (await viewEl?.textContent())?.trim() ?? '0'
        const viewCount = parseInt(viewText.replace(/[^\d]/g, ''), 10) || 0

        // 날짜
        const dateEl = await row.$('td.date, td:nth-child(4), span.date')
        const date = (await dateEl?.textContent())?.trim() ?? ''

        const fullUrl = href.startsWith('http')
          ? href
          : `https://www.82cook.com${href.startsWith('/') ? '' : '/entiz/'}${href}`

        items.push({ num, title, url: fullUrl, author, commentCount, viewCount, date })
      } catch {
        // 개별 row 파싱 실패 → 스킵
        continue
      }
    }
  } catch (err) {
    console.error(`[82cook] 목록 페이지 크롤링 실패 (page ${page}):`, err)
  } finally {
    await p.close()
  }

  return items
}

/** 82cook 개별 글 상세 크롤링 */
async function crawlPost(
  context: BrowserContext,
  item: ListItem,
  boardName: string,
  boardCategory: ContentCategory,
): Promise<RawCafePost | null> {
  const page = await context.newPage()

  try {
    await page.goto(item.url, { timeout: CRAWL_LIMITS.pageTimeout, waitUntil: 'domcontentloaded' })
    await sleep(1500)

    // 본문 추출 — 82cook은 div.view_content 또는 div#articleBody
    const contentEl = await page.$('div.view_content, div#articleBody, div.article_content')
    let content = ''
    if (contentEl) {
      content = (await contentEl.textContent())?.trim() ?? ''
      content = content.slice(0, CRAWL_LIMITS.maxContentLength)
    }

    if (!content || content.length < 50) return null

    // 블랙리스트 체크
    const fullText = `${item.title} ${content}`
    if (TOPIC_BLACKLIST.some((t) => fullText.includes(t))) return null

    // 좋아요 수 추출
    const likeEl = await page.$('span.like_count, em.sympathy_count, span.recomm_count')
    const likeText = (await likeEl?.textContent())?.trim() ?? '0'
    const likeCount = parseInt(likeText.replace(/[^\d]/g, ''), 10) || 0

    // 이미지 추출
    const images = await page.$$eval(
      'div.view_content img, div#articleBody img',
      (imgs: HTMLImageElement[]) =>
        imgs
          .map((img) => img.src)
          .filter((src) => src && !src.includes('icon') && !src.includes('btn_') && src.startsWith('http'))
          .slice(0, 10),
    )

    // 날짜 파싱
    let postedAt = new Date()
    if (item.date) {
      // 82cook 날짜 형식: "2026-03-29 14:30" 또는 "03-29 14:30" 또는 "14:30"
      try {
        if (item.date.includes('-') && item.date.length >= 10) {
          postedAt = new Date(item.date)
        } else if (item.date.includes('-')) {
          // MM-DD HH:MM
          const year = new Date().getFullYear()
          postedAt = new Date(`${year}-${item.date}`)
        }
      } catch {
        postedAt = new Date()
      }
    }

    return {
      cafeId: '82cook',
      cafeName: '82쿡',
      postUrl: item.url,
      title: item.title,
      content,
      author: item.author,
      category: null,
      boardName,
      boardCategory,
      likeCount,
      commentCount: item.commentCount,
      viewCount: item.viewCount,
      postedAt,
      imageUrls: images,
      videoUrls: [],
      thumbnailUrl: images[0] ?? null,
    }
  } catch (err) {
    console.error(`[82cook] 글 크롤링 실패 (${item.num}):`, err)
    return null
  } finally {
    await page.close()
  }
}

async function main() {
  console.log('[82cook] 크롤링 시작')
  const startTime = Date.now()

  const { context } = await launchBrowser()
  let totalSaved = 0
  let totalSkipped = 0

  for (const site of EXTERNAL_CONFIGS) {
    console.log(`[82cook] 사이트: ${site.name}`)

    for (const board of site.boards) {
      console.log(`[82cook]   게시판: ${board.name} (bn=${board.boardNumber})`)
      const allItems: ListItem[] = []

      // 페이지별 목록 수집
      for (let page = 1; page <= board.maxPages; page++) {
        const items = await crawlListPage(context, board.boardNumber, page)
        allItems.push(...items)
        console.log(`[82cook]     페이지 ${page}: ${items.length}건`)
        await sleep(CRAWL_LIMITS.delayBetweenPages)
      }

      // 중복 제거
      const uniqueItems = Array.from(
        new Map(allItems.map((item) => [item.num, item])).values(),
      ).slice(0, CRAWL_LIMITS.maxPostsPerCafe)

      // 개별 글 크롤링
      for (const item of uniqueItems) {
        // DB 중복 체크
        const existing = await prisma.cafePost.findUnique({
          where: { postUrl: item.url },
        })
        if (existing) {
          totalSkipped++
          continue
        }

        const post = await crawlPost(context, item, board.name, board.category)
        if (!post) {
          totalSkipped++
          continue
        }

        // 품질 점수 계산
        const qualityScore = calculateQualityScore(post)
        if (qualityScore < QUALITY_THRESHOLDS.minSave) {
          totalSkipped++
          continue
        }

        // DB 저장
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
            likeCount: post.likeCount,
            commentCount: post.commentCount,
            viewCount: post.viewCount,
            postedAt: post.postedAt,
            imageUrls: post.imageUrls,
            videoUrls: post.videoUrls,
            thumbnailUrl: post.thumbnailUrl,
            qualityScore,
            isUsable: qualityScore >= QUALITY_THRESHOLDS.minUsable,
            mediaCount: post.imageUrls.length + post.videoUrls.length,
          },
        })
        totalSaved++
        console.log(`[82cook]   저장: "${post.title.slice(0, 40)}" (점수: ${qualityScore})`)

        await sleep(CRAWL_LIMITS.delayBetweenPosts)
      }
    }
  }

  const elapsed = Date.now() - startTime

  // BotLog 기록
  await prisma.botLog.create({
    data: {
      botType: 'CAFE_CRAWLER',
      action: 'EXTERNAL_CRAWL',
      status: 'SUCCESS',
      details: JSON.stringify({
        sites: EXTERNAL_CONFIGS.map((s) => s.id),
        saved: totalSaved,
        skipped: totalSkipped,
      }),
      itemCount: totalSaved,
      executionTimeMs: elapsed,
    },
  })

  console.log(`[82cook] 완료: 저장 ${totalSaved}건, 스킵 ${totalSkipped}건 (${Math.round(elapsed / 1000)}초)`)
  await context.browser()?.close()
  await disconnect()
}

main().catch(async (err) => {
  console.error('[82cook] 치명적 오류:', err)
  await notifySlack({
    level: 'important',
    agent: 'CAFE_CRAWLER',
    title: '82cook 크롤러 에러',
    body: `82cook 크롤링 실패: ${err instanceof Error ? err.message : String(err)}`,
  }).catch(() => {})
  process.exit(1)
})
