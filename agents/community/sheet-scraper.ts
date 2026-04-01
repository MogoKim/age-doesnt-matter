/**
 * 외부 커뮤니티 시트 스크래퍼
 * Google Sheet에서 PENDING URL 읽기 → 스크래핑 → 게시 → Sheet 업데이트
 *
 * 사용:
 *   npx tsx agents/community/sheet-scraper.ts              # 전체 사이트
 *   npx tsx agents/community/sheet-scraper.ts --site fmkorea  # 펨코만 (로컬)
 *
 * 크론: community:sheet-scrape (runner.ts) — GA에서 실행
 * 로컬: run-local-fmkorea.ts → launchd — Mac에서 펨코 전용 실행
 * 스케줄: GA 11:00/21:00 KST (오유/네이트판) + 로컬 11:30/21:30 KST (펨코)
 *
 * 환경변수:
 *   SHEET_SCRAPER_EXCLUDE_SITE — GA에서 펨코 제외용 (예: fmkorea)
 */

import { chromium, type BrowserContext, type Page } from 'playwright'
import { prisma, disconnect } from '../core/db.js'
import { notifySlack } from '../core/notifier.js'
import { getBotUser } from '../seed/generator.js'
import { readPendingRows, updateRow, type SheetTab } from './sheets-client.js'
import { detectSite, randomUserAgent, isCloudflareChallenge, type SiteConfig } from './site-configs.js'
import { processContentMedia } from './image-pipeline.js'
import { transformContent, transformRawContent, classifyCategory } from './content-transformer.js'

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

// ── 페르소나 5명 매핑 ──

interface PersonaMapping {
  id: string
  nickname: string
  categories: string[]
  boards: Array<'STORY' | 'HUMOR'>
}

const PERSONAS: PersonaMapping[] = [
  { id: 'C', nickname: 'ㅋㅋ요정', categories: ['유머'], boards: ['HUMOR'] },
  { id: 'E', nickname: '봄바람', categories: ['일상', '고민'], boards: ['STORY'] },
  { id: 'H', nickname: '매일걷기', categories: ['건강'], boards: ['STORY'] },
  { id: 'I', nickname: '한페이지', categories: ['감동'], boards: ['STORY'] },
  { id: 'P', nickname: '오후세시', categories: ['기타'], boards: ['STORY', 'HUMOR'] },
]

function pickPersona(
  category: string,
  boardType: 'STORY' | 'HUMOR',
  overrideNickname?: string,
): PersonaMapping {
  // 창업자가 지정한 닉네임 우선
  if (overrideNickname) {
    const match = PERSONAS.find(
      (p) => p.nickname === overrideNickname || p.id === overrideNickname.toUpperCase(),
    )
    if (match) return match
  }

  // 카테고리 매칭
  const categoryMatch = PERSONAS.find((p) => p.categories.includes(category))
  if (categoryMatch && categoryMatch.boards.includes(boardType)) return categoryMatch

  // 게시판 매칭 폴백
  const boardMatch = PERSONAS.find((p) => p.boards.includes(boardType))
  if (boardMatch) return boardMatch

  // 최종 폴백: 오후세시 (만능형)
  return PERSONAS[4]
}

// ── 브라우저 관리 ──

async function launchBrowser(): Promise<BrowserContext> {
  const browser = await chromium.launch({
    headless: true,
    args: [
      '--disable-blink-features=AutomationControlled',
      '--disable-dev-shm-usage',
      '--no-sandbox',
      '--disable-setuid-sandbox',
    ],
  })

  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    userAgent: randomUserAgent(),
    locale: 'ko-KR',
    timezoneId: 'Asia/Seoul',
    colorScheme: 'light',
  })

  return context
}

// ── 단일 URL 스크래핑 ──

interface ScrapeResult {
  title: string
  content: string // 정제된 HTML
  thumbnailUrl: string | null
  imageCount: number
  videoCount: number
  category: string
}

async function scrapePage(
  context: BrowserContext,
  url: string,
  siteConfig: SiteConfig,
): Promise<ScrapeResult> {
  const page = await context.newPage()

  try {
    await page.goto(url, {
      waitUntil: 'domcontentloaded',
      timeout: 45000,
    })

    // Cloudflare 대기
    await sleep(siteConfig.minDelay)

    // CF 챌린지 감지
    const bodyHtml = await page.content()
    if (siteConfig.cloudflareProtected && isCloudflareChallenge(bodyHtml)) {
      throw new Error('CF_BLOCKED')
    }

    // 제목 추출 (댓글 수 [숫자] 패턴 제거)
    const rawTitle = await extractText(page, siteConfig.selectors.title)
    if (!rawTitle) throw new Error('제목 추출 실패')
    const title = rawTitle.replace(/\s*\[\d+\]\s*$/, '').trim()

    // 본문 추출
    const rawContent = await extractHtml(page, siteConfig.selectors.content)
    if (!rawContent) throw new Error('본문 추출 실패')

    // 콘텐츠 변환
    const transformed = transformContent(rawContent, url, siteConfig)

    // 이미지 파이프라인
    const dateKey = new Date().toISOString().slice(0, 10)
    const postKey = `${dateKey}/${Date.now()}`
    const { html: finalContent, thumbnailUrl, imageCount, videoCount } = await processContentMedia(
      transformed,
      url,
      postKey,
    )

    // 카테고리 자동분류
    const category = classifyCategory(title, finalContent)

    return { title, content: finalContent, thumbnailUrl, imageCount, videoCount, category }
  } finally {
    await page.close()
  }
}

async function extractText(page: Page, selectors: string[]): Promise<string | null> {
  for (const sel of selectors) {
    try {
      const el = page.locator(sel).first()
      if (await el.isVisible({ timeout: 3000 }).catch(() => false)) {
        const text = await el.textContent()
        if (text?.trim()) return text.trim()
      }
    } catch {
      continue
    }
  }
  return null
}

async function extractHtml(page: Page, selectors: string[]): Promise<string | null> {
  for (const sel of selectors) {
    try {
      const el = page.locator(sel).first()
      if (await el.isVisible({ timeout: 3000 }).catch(() => false)) {
        const html = await el.innerHTML()
        if (html?.trim()) return html.trim()
      }
    } catch {
      continue
    }
  }
  return null
}

// ── KST 시간 포맷 ──

function kstNow(): string {
  return new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })
}

// ── 메인 파이프라인 ──

// ── CLI 인자 + 환경변수 파싱 ──

function parseSiteFilter(): { siteOnly: string | null; siteExclude: string | null } {
  const args = process.argv.slice(2)
  const siteIdx = args.indexOf('--site')
  const siteOnly = siteIdx !== -1 ? args[siteIdx + 1] ?? null : null
  const siteExclude = process.env.SHEET_SCRAPER_EXCLUDE_SITE ?? null
  return { siteOnly, siteExclude }
}

async function main() {
  const { siteOnly, siteExclude } = parseSiteFilter()
  const filterLabel = siteOnly ? `[${siteOnly} only]` : siteExclude ? `[${siteExclude} 제외]` : ''
  console.log(`[sheet-scraper]${filterLabel} 시작:`, kstNow())

  let totalProcessed = 0
  let totalPublished = 0
  let totalFailed = 0
  let totalSkippedFilter = 0

  try {
    // 1. Sheet에서 PENDING 행 읽기
    const tabs = await readPendingRows()

    if (tabs.length === 0) {
      console.log('[sheet-scraper] 처리할 PENDING 행 없음')
      return
    }

    const totalRows = tabs.reduce((sum, t) => sum + t.rows.length, 0)
    console.log(`[sheet-scraper] ${totalRows}건 PENDING 발견`)

    // 2. 브라우저 시작
    const context = await launchBrowser()

    try {
      for (const tab of tabs) {
        for (const row of tab.rows) {
          totalProcessed++
          console.log(`[sheet-scraper] [${totalProcessed}/${totalRows}] ${row.sourceUrl}`)

          try {
            // 사이트 감지 (필터링 전에 먼저 수행 — PROCESSING 마킹 방지)
            const siteConfig = detectSite(row.sourceUrl)

            // 사이트 필터: --site fmkorea → 펨코만 처리, 나머지 PENDING 유지
            if (siteOnly && siteConfig && siteConfig.id !== siteOnly) {
              console.log(`  → SKIP (필터: ${siteOnly} only)`)
              totalSkippedFilter++
              continue
            }
            // 사이트 제외: SHEET_SCRAPER_EXCLUDE_SITE=fmkorea → 펨코 건너뜀
            if (siteExclude && siteConfig && siteConfig.id === siteExclude) {
              console.log(`  → SKIP (제외: ${siteExclude})`)
              totalSkippedFilter++
              continue
            }

            // PROCESSING 상태로 업데이트
            await updateRow(tab.tabName, row.rowIndex, { status: 'PROCESSING' })

            // 중복 체크
            const existing = await prisma.post.findFirst({
              where: { sourceUrl: row.sourceUrl },
              select: { id: true },
            })
            if (existing) {
              await updateRow(tab.tabName, row.rowIndex, {
                status: 'SKIPPED',
                error: '이미 게시됨',
              })
              console.log(`  → SKIPPED (중복)`)
              continue
            }

            if (!siteConfig) {
              await updateRow(tab.tabName, row.rowIndex, {
                status: 'FAILED',
                error: '지원하지 않는 사이트',
              })
              totalFailed++
              continue
            }

            // raw_content가 있으면 스크래핑 스킵
            let title: string
            let content: string
            let thumbnailUrl: string | null = null
            let imageCount = 0
            let videoCount = 0
            let category: string

            if (row.rawContent) {
              // 수동 붙여넣기 모드
              title = row.title || '(제목 없음)'
              content = transformRawContent(row.rawContent, row.sourceUrl, siteConfig.name)
              category = row.category || classifyCategory(title, content)
              console.log(`  → raw_content 사용 (스크래핑 스킵)`)
            } else {
              // 자동 스크래핑
              const result = await scrapePage(context, row.sourceUrl, siteConfig)
              title = row.title || result.title // 창업자 제목 우선
              content = result.content
              thumbnailUrl = result.thumbnailUrl
              imageCount = result.imageCount
              videoCount = result.videoCount
              category = row.category || result.category // 창업자 카테고리 우선
            }

            // 페르소나 선택
            const persona = pickPersona(category, tab.boardType, row.persona)
            const userId = await getBotUser(persona.id)

            // 게시 (PUBLISHED — 피드 + 검색 모두 노출)
            const post = await prisma.post.create({
              data: {
                title,
                content,
                boardType: tab.boardType,
                category,
                authorId: userId,
                source: 'BOT',
                status: 'PUBLISHED',
                sourceUrl: row.sourceUrl,
                sourceSite: siteConfig.id,
                thumbnailUrl,
                publishedAt: new Date(),
              },
            })

            // 게시글 URL 생성
            const boardSlug = tab.boardType === 'STORY' ? 'stories' : 'humor'
            const postUrl = `https://age-doesnt-matter.com/community/${boardSlug}/${post.id}`

            // Sheet 업데이트
            await updateRow(tab.tabName, row.rowIndex, {
              status: 'PUBLISHED',
              title,
              category,
              persona: persona.nickname,
              postUrl,
              publishedAt: kstNow(),
            })

            totalPublished++
            const mediaSummary = imageCount > 0 || videoCount > 0
              ? `(이미지 ${imageCount}개${videoCount > 0 ? `, 동영상 ${videoCount}개` : ''})`
              : ''
            console.log(`  → PUBLISHED: ${postUrl} ${mediaSummary}`)

            // 요청 간 딜레이
            await sleep(2000 + Math.random() * 3000)
          } catch (err) {
            totalFailed++
            const errorMsg =
              err instanceof Error && err.message === 'CF_BLOCKED'
                ? 'CF 차단 — J열에 본문 붙여넣기 가능'
                : err instanceof Error
                  ? err.message
                  : String(err)

            await updateRow(tab.tabName, row.rowIndex, {
              status: 'FAILED',
              error: errorMsg.slice(0, 200),
            }).catch(() => {})

            console.error(`  → FAILED: ${errorMsg}`)
          }
        }
      }
    } finally {
      await context.browser()?.close()
    }

    // 3. BotLog 기록
    await prisma.botLog.create({
      data: {
        botType: 'CAFE_CRAWLER',
        action: 'SHEET_SCRAPE',
        status: totalFailed === 0 ? 'SUCCESS' : totalPublished > 0 ? 'PARTIAL' : 'FAILED',
        details: `처리 ${totalProcessed}건: 게시 ${totalPublished}, 실패 ${totalFailed}, 필터 스킵 ${totalSkippedFilter}`,
        logData: { totalProcessed, totalPublished, totalFailed, totalSkippedFilter, siteOnly, siteExclude },
      },
    })

    // 4. Slack 알림
    const emoji = totalFailed === 0 ? '✅' : totalPublished > 0 ? '⚠️' : '❌'
    const skipInfo = totalSkippedFilter > 0 ? `, 필터 스킵 ${totalSkippedFilter}` : ''
    await notifySlack(
      'log',
      `${emoji} [시트 스크래퍼]${filterLabel} ${totalProcessed}건 처리 → ${totalPublished}건 게시, ${totalFailed}건 실패${skipInfo}`,
    )
  } catch (err) {
    console.error('[sheet-scraper] 치명적 오류:', err)
    await notifySlack(
      'system',
      `❌ [시트 스크래퍼] 치명적 오류: ${err instanceof Error ? err.message : String(err)}`,
    ).catch(() => {})
  } finally {
    await disconnect()
  }

  console.log(
    `[sheet-scraper]${filterLabel} 완료: 게시 ${totalPublished}, 실패 ${totalFailed}, 필터 스킵 ${totalSkippedFilter} (${kstNow()})`,
  )
}

main().then(() => process.exit(0)).catch(() => process.exit(1))
