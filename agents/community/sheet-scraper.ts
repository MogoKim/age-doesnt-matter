/**
 * 외부 커뮤니티 시트 스크래퍼
 * Google Sheet에서 PENDING URL 읽기 → 스크래핑 → 게시 → Sheet 업데이트
 *
 * 사용:
 *   npx tsx agents/community/sheet-scraper.ts              # 전체 사이트
 *   npx tsx agents/community/sheet-scraper.ts --site fmkorea  # 펨코만 (로컬)
 *
 * 크론: community:sheet-scrape (runner.ts) — agents-scraper.yml (5회/일)
 * 로컬: run-local-fmkorea.ts → launchd — Mac에서 펨코 전용 실행
 * 스케줄: GA 07:30/09:00/12:00/15:00/21:00 KST (오유/네이트판) + 로컬 11:30/21:30 KST (펨코)
 *
 * 환경변수:
 *   SHEET_SCRAPER_EXCLUDE_SITE — GA에서 펨코 제외용 (예: fmkorea)
 *   SHEET_SCRAPER_AI_FILTER    — "true"이면 Haiku로 관련성 점수/카테고리/제목 최적화 실행
 */

import { existsSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { chromium, type BrowserContext, type Page, type Frame } from 'playwright'
import { prisma, disconnect } from '../core/db.js'
import { notifySlack } from '../core/notifier.js'
import { getBotUser } from '../seed/generator.js'
import { generateCommunitySlug } from '../core/slug.js'
import { readPendingRows, updateRow } from './sheets-client.js'
import { detectSite, randomUserAgent, isCloudflareChallenge, type SiteConfig } from './site-configs.js'
import { processContentMedia } from './image-pipeline.js'
import { transformContent, transformRawContent, classifyCategory } from './content-transformer.js'

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

function getPlainTextLength(html: string): number {
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().length
}

function isImageLikePostContent(content: string): boolean {
  return getPlainTextLength(content) < 50
}

function getImageLikeCommentTarget(sourceCommentCount: number): number {
  if (sourceCommentCount <= 2) return 0
  return sourceCommentCount === 3 ? 1 : 2
}

function shuffleArray<T>(arr: T[]): T[] {
  return [...arr].sort(() => Math.random() - 0.5)
}

const WAVE_PERSONAS: Record<string, string[]> = {
  like:     ['BI', 'BJ', 'BK', 'BL', 'BM', 'BN', 'BO', 'BP', 'BQ', 'BR'],
  empathy:  ['BS', 'BT', 'BU', 'BV', 'BW'],
  critical: ['V', 'W', 'AB', 'Y', 'AA'],
  reversal: ['AE', 'P', 'AD', 'BG', 'BH'],
}

// ── 페르소나 5명 매핑 ──

interface PersonaMapping {
  id: string
  nickname: string
  categories: string[]
  boards: Array<'STORY' | 'HUMOR' | 'LIFE2'>
}

// 기존 E/H/P 별칭(봄바람/매일걷기/오후세시)은 Google Sheet E열 override 호환성 유지를 위해 유지.
// 실제 서비스 표시 닉네임은 persona-data.ts(getBotUser) 기준: E=미숙이맘, H=걷기매니아58, P=love1961
// E열 수동 지정은 boardType 검증 없이 존중 (창업자가 LIFE2 탭에 STORY 페르소나를 지정해도 허용)
const PERSONAS: PersonaMapping[] = [
  // ── HUMOR ──
  { id: 'C',  nickname: 'ㅋㅋ요정',   categories: ['유머'],         boards: ['HUMOR'] },
  { id: 'R',  nickname: '밤새봤다',   categories: ['유머', '힐링'], boards: ['HUMOR'] },
  { id: 'AF', nickname: '하하호호',   categories: ['유머', '자랑'], boards: ['HUMOR'] },
  { id: 'I',  nickname: '한페이지',   categories: ['힐링', '추천'], boards: ['HUMOR'] },
  { id: 'AO', nickname: '웃음충전',   categories: ['힐링', '추천'], boards: ['HUMOR'] },
  // ── STORY ──
  { id: 'E',  nickname: '봄바람',     categories: ['일상', '고민'], boards: ['STORY'] },
  { id: 'A',  nickname: '하늘바라기', categories: ['일상', '고민'], boards: ['STORY'] },
  { id: 'H',  nickname: '매일걷기',   categories: ['건강'],         boards: ['STORY'] },
  { id: 'M',  nickname: '등산만보',   categories: ['건강'],         boards: ['STORY'] },
  { id: 'AN', nickname: '약국단골',   categories: ['건강'],         boards: ['STORY'] },
  { id: 'L',  nickname: '손주러브',   categories: ['자녀'],         boards: ['STORY'] },
  { id: 'K',  nickname: '예쁘게살자', categories: ['자랑', '추천'], boards: ['STORY'] },
  // ── 만능 fallback (STORY+HUMOR) ──
  { id: 'P',  nickname: '오후세시',   categories: ['기타'],         boards: ['STORY', 'HUMOR'] },
  { id: 'U',  nickname: '부산아지매', categories: ['기타'],         boards: ['STORY'] },
  { id: 'Q',  nickname: '멍멍이엄마', categories: ['기타'],         boards: ['STORY'] },
  // ── LIFE2 (2막준비 게시판) ──
  { id: 'B',  nickname: '정순씨',     categories: ['일상', '고민', '은퇴'], boards: ['LIFE2'] },
  { id: 'Y',  nickname: '솔직히말해서', categories: ['고민', '기타'],        boards: ['LIFE2'] },
  { id: 'AB', nickname: '따져보자',   categories: ['일상', '기타'],         boards: ['LIFE2'] },
  { id: 'BX', nickname: '말티즈엄마', categories: ['일상', '기타'],         boards: ['LIFE2'] },
]

function getBoardSlug(boardType: 'STORY' | 'HUMOR' | 'LIFE2'): string {
  if (boardType === 'STORY') return 'stories'
  if (boardType === 'HUMOR') return 'humor'
  return 'life2'
}

function pickPersona(
  category: string,
  boardType: 'STORY' | 'HUMOR' | 'LIFE2',
  overrideNickname?: string,
): PersonaMapping {
  // 창업자가 지정한 닉네임/ID 우선
  if (overrideNickname) {
    const match = PERSONAS.find(
      (p) => p.nickname === overrideNickname || p.id === overrideNickname.toUpperCase(),
    )
    if (match) return match
  }

  // category + boardType 매칭 풀에서 랜덤 선택
  const categoryPool = PERSONAS.filter(
    (p) => p.categories.includes(category) && p.boards.includes(boardType),
  )
  if (categoryPool.length > 0)
    return categoryPool[Math.floor(Math.random() * categoryPool.length)]

  // boardType만 매칭 풀에서 랜덤 선택
  const boardPool = PERSONAS.filter((p) => p.boards.includes(boardType))
  if (boardPool.length > 0)
    return boardPool[Math.floor(Math.random() * boardPool.length)]

  // 최종 fallback: 전체 풀 랜덤
  return PERSONAS[Math.floor(Math.random() * PERSONAS.length)]
}

// ── 브라우저 관리 ──

function chromiumLaunchOptions() {
  const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
  return {
    headless: true as const,
    args: [
      '--disable-blink-features=AutomationControlled',
      '--disable-dev-shm-usage',
      '--no-sandbox',
      '--disable-setuid-sandbox',
    ],
    ...(executablePath ? { executablePath } : {}),
  }
}

async function launchBrowser(): Promise<BrowserContext> {
  const browser = await chromium.launch(chromiumLaunchOptions())

  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    userAgent: randomUserAgent(),
    locale: 'ko-KR',
    timezoneId: 'Asia/Seoul',
    colorScheme: 'light',
  })

  return context
}

async function launchBrowserWithSession(storagePath: string): Promise<BrowserContext> {
  const browser = await chromium.launch(chromiumLaunchOptions())
  return browser.newContext({
    viewport: { width: 1920, height: 1080 },
    userAgent: randomUserAgent(),
    locale: 'ko-KR',
    timezoneId: 'Asia/Seoul',
    colorScheme: 'light',
    storageState: storagePath,
  })
}

// ── 단일 URL 스크래핑 ──

interface ScrapeResult {
  title: string
  content: string // 정제된 HTML
  thumbnailUrl: string | null
  imageCount: number
  videoCount: number
  sourceComments: string[] // 원본 사이트 댓글 (파동 댓글 생성 분위기 참고용)
}

async function scrapePage(
  context: BrowserContext,
  url: string,
  siteConfig: SiteConfig,
  boardType: 'STORY' | 'HUMOR' | 'LIFE2' = 'HUMOR',
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

    // iframe 핸들링 (네이버 카페 f-e/ URL은 cafe_main iframe 사용, ca-fe/는 page 직접)
    const target: Page | Frame = siteConfig.contentFrame
      ? (page.frame({ name: siteConfig.contentFrame }) ?? page)
      : page

    // 제목 추출 (댓글 수 [숫자] 패턴 제거)
    const rawTitle = await extractText(target, siteConfig.selectors.title)
    if (!rawTitle) throw new Error('제목 추출 실패')
    const title = rawTitle.replace(/\s*\[\d+\]\s*$/, '').trim()

    // 본문 추출
    const rawContent = await extractHtml(target, siteConfig.selectors.content)
    if (!rawContent) throw new Error('본문 추출 실패')

    // 원글 작성자 닉네임 추출 (자기 댓글 제외용 — postAuthorSelectors 없는 사이트는 null)
    let postAuthorNick: string | null = null
    if (siteConfig.postAuthorSelectors) {
      try {
        for (const sel of siteConfig.postAuthorSelectors) {
          const el = await target.$(sel)
          if (el) {
            const raw = (await el.textContent())?.trim() ?? ''
            postAuthorNick = raw.split(/[\s(]/)[0] || null
            break
          }
        }
      } catch { /* 원글 작성자 추출 실패해도 계속 */ }
    }

    // 원본 댓글 수집 (removeElements 실행 전 — 최대 10개)
    const sourceComments: string[] = []
    if (siteConfig.commentSelectors) {
      try {
        // 댓글 섹션이 AJAX 비동기 로딩될 수 있으므로 최대 5초 대기
        await target.waitForSelector(siteConfig.commentSelectors.item, { timeout: 5000 }).catch(() => {})
        const items = await target.$$(siteConfig.commentSelectors.item)
        for (const item of items.slice(0, 10)) {
          try {
            if (siteConfig.commentSelectors.author && postAuthorNick) {
              const authorEl = await item.$(siteConfig.commentSelectors.author)
              if (authorEl) {
                const commentAuthor = (await authorEl.textContent())?.trim() ?? ''
                if (commentAuthor.split(/[\s(]/)[0] === postAuthorNick) continue
              }
            }
            const text = await item.$eval(
              siteConfig.commentSelectors.text,
              (el: Element) => el.textContent?.trim() ?? '',
            )
            if (text.length > 5) sourceComments.push(text)
          } catch { continue }
        }
      } catch { /* 댓글 수집 실패해도 스크래핑 계속 */ }
    }
    console.log(`  [scrapePage] 원본 댓글 ${sourceComments.length}개 수집`)

    // 콘텐츠 변환
    const transformed = transformContent(rawContent, url, siteConfig, boardType)

    // 이미지 파이프라인
    const dateKey = new Date().toISOString().slice(0, 10)
    const postKey = `${dateKey}/${Date.now()}`
    const { html: finalContent, thumbnailUrl, imageCount, videoCount } = await processContentMedia(
      transformed,
      url,
      postKey,
    )

    return { title, content: finalContent, thumbnailUrl, imageCount, videoCount, sourceComments }
  } finally {
    await page.close()
  }
}

async function extractText(page: Page | Frame, selectors: string[]): Promise<string | null> {
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

async function extractHtml(page: Page | Frame, selectors: string[]): Promise<string | null> {
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

// ── 핵심 키워드 추출 (댓글 품질 검증용) ──

function extractKeyTerms(title: string): string[] {
  return title
    .replace(/[^가-힣a-zA-Z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length >= 2 && w.length <= 6)
    .slice(0, 5)
}

// ── sourceComments 필터 (P1: sc SKIP/PARTIAL/FULL 정책) ──

const HARD_REMOVE_RE = /^[ㄱ-ㅎㅏ-ㅣ\s!?.,♡♥★☆]+$|^[\d\s.,!?]+$/

function filterSourceComments(raw: string[]): string[] {
  const seen = new Set<string>()
  return raw
    .map(c => c
      .replace(/@\S+/g, '')
      .replace(/https?:\/\/\S+/g, '')
      .trim()
    )
    .filter(c => {
      if (c.length < 5) return false
      if (HARD_REMOVE_RE.test(c)) return false
      const key = c.slice(0, 4)
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    .filter(c => c.length >= 10)
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

export async function main() {
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
    let sessionContext: BrowserContext | null = null

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

            // SESSION_REQUIRED 사이트: storage-state.json 없으면 PENDING 유지 (GHA skip)
            if (siteConfig?.requiresSession) {
              const storagePath = resolve(dirname(fileURLToPath(import.meta.url)), '../cafe/storage-state.json')
              if (!existsSync(storagePath)) {
                console.log(`  → SKIP (SESSION_REQUIRED — storage-state.json 없음, PENDING 유지)`)
                totalSkippedFilter++
                continue
              }
              if (!sessionContext) {
                sessionContext = await launchBrowserWithSession(storagePath)
                console.log(`  [session] 네이버 세션 컨텍스트 초기화: ${storagePath}`)
              }
            }

            // PROCESSING 상태로 업데이트
            await updateRow(tab.tabName, row.rowIndex, { status: 'PROCESSING' })

            // 중복 체크 — 삭제된 게시글은 재활용(update), 활성 게시글은 파동 유무 확인 후 처리
            const existingActive = await prisma.post.findFirst({
              where: { sourceUrl: row.sourceUrl, status: { not: 'DELETED' } },
              select: { id: true, title: true, content: true },
            })
            if (existingActive) {
              // 파동 BotLog 존재 여부 확인 (PENDING + SUCCESS 전체 — status 필터 없음)
              const waveCount = await prisma.botLog.count({
                where: {
                  action: {
                    in: [
                      'SHEET_LIKE_WAVE_PENDING',
                      'SHEET_COMMENT_WAVE_PENDING',
                      'SHEET_ENGAGE_COMMENT_PENDING',
                      'SHEET_ENGAGE_LIKE_PENDING',
                    ],
                  },
                  details: { contains: existingActive.id },
                },
              })

              if (waveCount === 0) {
                // 파동 없음 → 재예약 (FAILED 후 B~J 공백 재시도 케이스)
                const retryNow = new Date()
                const retryPostUrl = `${process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.age-doesnt-matter.com'}/community/${getBoardSlug(tab.boardType)}/${existingActive.id}`
                const imageLikePost = isImageLikePostContent(existingActive.content ?? '')

                if (tab.isFeatured) {
                  const keyTerms = extractKeyTerms(existingActive.title)
                  const rawContent = (existingActive.content ?? '').slice(0, 2000)
                  const empathyTarget = imageLikePost ? 0 : 3
                  const criticalTarget = imageLikePost ? 0 : 2
                  const reversalTarget = imageLikePost ? 0 : 2
                  const retryWaves = [
                    { waveType: 'like',     action: 'SHEET_LIKE_WAVE_PENDING',    delayMin: 1,  targetCount: undefined },
                    { waveType: 'empathy',  action: 'SHEET_COMMENT_WAVE_PENDING', delayMin: 3,  targetCount: empathyTarget },
                    { waveType: 'critical', action: 'SHEET_COMMENT_WAVE_PENDING', delayMin: 6,  targetCount: criticalTarget },
                    { waveType: 'reversal', action: 'SHEET_COMMENT_WAVE_PENDING', delayMin: 10, targetCount: reversalTarget },
                  ].filter(w => w.targetCount === undefined || w.targetCount > 0)
                  for (const wave of retryWaves) {
                    await prisma.botLog.create({
                      data: {
                        botType: 'SEED',
                        action: wave.action,
                        status: 'PENDING',
                        details: JSON.stringify({
                          postId: existingActive.id,
                          waveType: wave.waveType,
                          scheduledAt: new Date(retryNow.getTime() + wave.delayMin * 60 * 1000).toISOString(),
                          personaIds: shuffleArray(WAVE_PERSONAS[wave.waveType] ?? []),
                          rawContent,
                          keyTerms,
                          imageLikePost,
                          ...(wave.targetCount !== undefined ? { targetCount: wave.targetCount } : {}),
                        }),
                      },
                    })
                  }
                  console.log(`  → [재시도] 화제성 파동 ${retryWaves.length}개 재예약 → PUBLISHED`)
                } else {
                  if (!imageLikePost) {
                    await prisma.botLog.create({
                      data: {
                        botType: 'SEED',
                        action: 'SHEET_ENGAGE_COMMENT_PENDING',
                        status: 'PENDING',
                        details: JSON.stringify({
                          postId: existingActive.id,
                          scheduledAt: new Date(retryNow.getTime() + 2 * 60 * 1000).toISOString(),
                          personaIds: shuffleArray(['BI', 'BJ', 'BK', 'BL', 'BM', 'BN', 'BO', 'BP', 'BQ', 'BR']),
                          targetCount: 4,
                          imageLikePost,
                        }),
                      },
                    })
                  }
                  await prisma.botLog.create({
                    data: {
                      botType: 'SEED',
                      action: 'SHEET_ENGAGE_LIKE_PENDING',
                      status: 'PENDING',
                      details: JSON.stringify({
                        postId: existingActive.id,
                        scheduledAt: new Date(retryNow.getTime() + 6 * 60 * 1000).toISOString(),
                        personaIds: ['BL', 'BM', 'BN', 'BO', 'BP'],
                        imageLikePost,
                      }),
                    },
                  })
                  console.log(`  → [재시도] 일반 engagement 파동 ${imageLikePost ? 1 : 2}개 재예약 → PUBLISHED`)
                }

                await updateRow(tab.tabName, row.rowIndex, {
                  status: 'PUBLISHED',
                  postUrl: retryPostUrl,
                  error: '',
                  publishedAt: kstNow(),
                })
                totalPublished++
                continue
              }

              // 파동 이미 존재 → 중복 스킵
              await updateRow(tab.tabName, row.rowIndex, {
                status: 'SKIPPED',
                error: '이미 게시됨',
              })
              console.log(`  → SKIPPED (중복, 파동 ${waveCount}개 기존 존재)`)
              continue
            }
            const existingDeleted = await prisma.post.findFirst({
              where: { sourceUrl: row.sourceUrl, status: 'DELETED' },
              select: { id: true, slug: true },
            })

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
            let sourceComments: string[] = []

            if (row.rawContent) {
              // 수동 붙여넣기 모드
              title = row.title || '(제목 없음)'
              content = transformRawContent(row.rawContent, row.sourceUrl, siteConfig.name, tab.boardType)
              console.log(`  → raw_content 사용 (스크래핑 스킵)`)
            } else {
              // 자동 스크래핑
              const activeContext = siteConfig?.requiresSession && sessionContext ? sessionContext : context
              const result = await scrapePage(activeContext, row.sourceUrl, siteConfig, tab.boardType)
              title = row.title || result.title // 창업자 제목 우선
              content = result.content
              thumbnailUrl = result.thumbnailUrl
              imageCount = result.imageCount
              videoCount = result.videoCount
              sourceComments = result.sourceComments
            }

            // 접근 차단 안내문 / 게시판 안내문 필터 (ea1ae6a sheet-scraper 경로 누락 보완)
            const ACCESS_BLOCKED_SIGNALS = [
              '검색 비허용 게시물',
              '게시물을 확인하기 위해서는 가입이 필요합니다',
              '가입이 필요합니다',
              '카페의 멤버가 되어보세요',
              '카페에 가입하면 바로 글을 볼 수 있어요',
              '10초 만에 가입하기',
            ]
            const BOARD_NOTICE_SIGNALS = [
              '게시판 안내를 확인해 주세요',
              '게시판에 작성 바랍니다',
            ]
            const _isAccessBlocked = ACCESS_BLOCKED_SIGNALS.some(s => content.includes(s))
            const _isBoardNotice = BOARD_NOTICE_SIGNALS.some(s => content.includes(s))
            if (_isAccessBlocked || _isBoardNotice) {
              const _blockReason = _isAccessBlocked ? '접근 차단 안내문 포함' : '게시판 안내문 포함'
              await updateRow(tab.tabName, row.rowIndex, {
                status: 'FAILED',
                error: `${_blockReason} — 발행 제외`,
              })
              totalFailed++
              console.log(`  → FAILED: ${_blockReason} 감지`)
              continue
            }

            // 동영상 포함 글 발행 차단 (navercafe: 동영상은 임베드/보존 금지, 3차 방어선)
            const _pzpStrong = ['.pzp', 'pzp-pc', 'pzp-poster', 'webplayer-internal-video', '광고 후 계속됩니다', '디버그 정보 다운로드', '고화질 재생이 가능한 영상입니다']
            const _pzpWeak = ['재생 속도', '해상도', '자막', '음소거', '전체 화면', '자동 (480p)', '0초']
            const _isVideoContent = videoCount > 0
              || _pzpStrong.some(s => content.includes(s))
              || _pzpWeak.filter(s => content.includes(s)).length >= 2
            if (_isVideoContent) {
              await updateRow(tab.tabName, row.rowIndex, {
                status: 'FAILED',
                error: '네이버 카페 동영상 포함 글은 발행 제외',
              })
              totalFailed++
              console.log(`  → FAILED: 동영상 포함 글 발행 제외 (videoCount=${videoCount})`)
              continue
            }

            // 카테고리 결정 (창업자 지정 우선, 아니면 게시판별 자동 분류)
            const category = row.category || classifyCategory(title, content, tab.boardType)
            const finalTitle = title

            // 페르소나 선택
            const persona = pickPersona(category, tab.boardType, row.persona)
            const userId = await getBotUser(persona.id)

            // 게시 (삭제된 게시글 재활용 또는 신규 생성)
            const slug = await generateCommunitySlug(finalTitle)
            const postData = {
              title: finalTitle,
              content,
              boardType: tab.boardType,
              category,
              authorId: userId,
              source: 'SHEET' as const,
              status: 'PUBLISHED' as const,
              sourceUrl: row.sourceUrl,
              sourceSite: siteConfig.id,
              thumbnailUrl,
              publishedAt: new Date(),
              isFeatured: tab.isFeatured,
            }

            const post = existingDeleted
              ? await prisma.post.update({
                  where: { id: existingDeleted.id },
                  // 복원 글: 기존 slug가 있으면 유지, 없으면 신규 slug 부여
                  data: existingDeleted.slug ? postData : { ...postData, slug },
                })
              : await prisma.post.create({ data: { ...postData, slug } })

            // 게시글 URL 생성 (slug 우선)
            const postUrl = `${process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.age-doesnt-matter.com'}/community/${getBoardSlug(tab.boardType)}/${post.slug ?? post.id}`

            // BotLog 파동 예약 — details는 scheduler가 JSON.parse()로 읽는 구조
            const now = new Date()
            const imageLikePost = isImageLikePostContent(content)
            if (tab.isFeatured) {
              // 화제성 글: sc 필터 → SKIP/PARTIAL/FULL 정책 + 좋아요 항상 예약
              const keyTerms = extractKeyTerms(title)
              const filteredComments = filterSourceComments(sourceComments)
              const usable = filteredComments.length
              const empathyTarget = imageLikePost
                ? getImageLikeCommentTarget(usable)
                : usable >= 3 ? 3 : 0
              const criticalTarget = imageLikePost ? 0 : usable >= 5 ? 2 : usable >= 4 ? 1 : 0
              const reversalTarget = imageLikePost ? 0 : usable >= 7 ? 2 : usable >= 6 ? 1 : 0
              console.log(`  [sc] raw=${sourceComments.length} filtered=${usable} imageLike=${imageLikePost} empathy=${empathyTarget} critical=${criticalTarget} reversal=${reversalTarget}`)

              if (usable <= 2) {
                await prisma.botLog.create({
                  data: {
                    botType: 'SEED',
                    action: 'SHEET_WAVE_SKIP',
                    status: 'SKIP',
                    details: JSON.stringify({
                      postId: post.id,
                      reason: usable === 0 ? 'SC_ZERO' : 'SC_INSUFFICIENT',
                      sourceCommentsRawCount: sourceComments.length,
                      sourceCommentsFilteredCount: usable,
                      imageLikePost,
                    }),
                  },
                })
              } else {
                if (usable < 7) {
                  await prisma.botLog.create({
                    data: {
                      botType: 'SEED',
                      action: 'SHEET_WAVE_PARTIAL',
                      status: 'PARTIAL',
                      details: JSON.stringify({
                        postId: post.id,
                        sourceCommentsRawCount: sourceComments.length,
                        sourceCommentsFilteredCount: usable,
                        imageLikePost,
                        targetCount: empathyTarget + criticalTarget + reversalTarget,
                      }),
                    },
                  })
                }
                const commentWaves: Array<{ waveType: string; delayMin: number; targetCount: number }> = [
                  { waveType: 'empathy',  delayMin: 3,  targetCount: empathyTarget },
                  ...(criticalTarget > 0 ? [{ waveType: 'critical', delayMin: 6,  targetCount: criticalTarget }] : []),
                  ...(reversalTarget > 0 ? [{ waveType: 'reversal', delayMin: 10, targetCount: reversalTarget }] : []),
                ]
                for (const wave of commentWaves.filter(w => w.targetCount > 0)) {
                  await prisma.botLog.create({
                    data: {
                      botType: 'SEED',
                      action: 'SHEET_COMMENT_WAVE_PENDING',
                      status: 'PENDING',
                      details: JSON.stringify({
                        postId: post.id,
                        waveType: wave.waveType,
                        scheduledAt: new Date(now.getTime() + wave.delayMin * 60 * 1000).toISOString(),
                        personaIds: shuffleArray(WAVE_PERSONAS[wave.waveType] ?? []),
                        rawContent: content.slice(0, 2000),
                        keyTerms,
                        sourceComments: filteredComments,
                        sourceCommentsRaw: sourceComments,
                        imageLikePost,
                        targetCount: wave.targetCount,
                      }),
                    },
                  })
                }
              }
              // 좋아요 파동 — 항상 예약 (sc 무관)
              await prisma.botLog.create({
                data: {
                  botType: 'SEED',
                  action: 'SHEET_LIKE_WAVE_PENDING',
                  status: 'PENDING',
                  details: JSON.stringify({
                    postId: post.id,
                    waveType: 'like',
                    scheduledAt: new Date(now.getTime() + 1 * 60 * 1000).toISOString(),
                    personaIds: shuffleArray(WAVE_PERSONAS['like'] ?? []),
                    rawContent: content.slice(0, 2000),
                    keyTerms,
                    imageLikePost,
                  }),
                },
              })
              const totalWaves = 1 + (empathyTarget > 0 ? 1 : 0) + (criticalTarget > 0 ? 1 : 0) + (reversalTarget > 0 ? 1 : 0)
              console.log(`  → 화제성 파동 ${totalWaves}개 예약 (raw=${sourceComments.length} filtered=${usable})`)
            } else {
              // 일반 스크래퍼 글: sc 필터 → SKIP/PARTIAL/FULL 정책 + 좋아요 항상 예약
              const filteredComments = filterSourceComments(sourceComments)
              const usable = filteredComments.length
              const commentTargetCount = imageLikePost
                ? getImageLikeCommentTarget(usable)
                : usable >= 4 ? 4 : usable === 3 ? 3 : 0
              console.log(`  [sc] raw=${sourceComments.length} filtered=${usable} imageLike=${imageLikePost} target=${commentTargetCount}`)

              if (usable <= 2) {
                await prisma.botLog.create({
                  data: {
                    botType: 'SEED',
                    action: 'SHEET_WAVE_SKIP',
                    status: 'SKIP',
                    details: JSON.stringify({
                      postId: post.id,
                      reason: usable === 0 ? 'SC_ZERO' : 'SC_INSUFFICIENT',
                      sourceCommentsRawCount: sourceComments.length,
                      sourceCommentsFilteredCount: usable,
                      imageLikePost,
                    }),
                  },
                })
              } else {
                if (usable === 3 || imageLikePost) {
                  await prisma.botLog.create({
                    data: {
                      botType: 'SEED',
                      action: 'SHEET_WAVE_PARTIAL',
                      status: 'PARTIAL',
                      details: JSON.stringify({
                        postId: post.id,
                        sourceCommentsRawCount: sourceComments.length,
                        sourceCommentsFilteredCount: usable,
                        imageLikePost,
                        targetCount: commentTargetCount,
                      }),
                    },
                  })
                }
                await prisma.botLog.create({
                  data: {
                    botType: 'SEED',
                    action: 'SHEET_ENGAGE_COMMENT_PENDING',
                    status: 'PENDING',
                    details: JSON.stringify({
                      postId: post.id,
                      scheduledAt: new Date(now.getTime() + 2 * 60 * 1000).toISOString(),
                      personaIds: shuffleArray(['BI', 'BJ', 'BK', 'BL', 'BM', 'BN', 'BO', 'BP', 'BQ', 'BR']),
                      targetCount: commentTargetCount,
                      sourceComments: filteredComments,
                      sourceCommentsRaw: sourceComments,
                      imageLikePost,
                    }),
                  },
                })
              }
              // 좋아요 파동 — 항상 예약 (sc 무관)
              await prisma.botLog.create({
                data: {
                  botType: 'SEED',
                  action: 'SHEET_ENGAGE_LIKE_PENDING',
                  status: 'PENDING',
                  details: JSON.stringify({
                    postId: post.id,
                    scheduledAt: new Date(now.getTime() + 6 * 60 * 1000).toISOString(),
                    personaIds: ['BL', 'BM', 'BN', 'BO', 'BP'],
                    imageLikePost,
                  }),
                },
              })
            }

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
            const featuredTag = tab.isFeatured ? ' [화제성]' : ''
            console.log(`  → PUBLISHED${featuredTag}: ${postUrl} ${mediaSummary}`)

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
      if (sessionContext) await sessionContext.browser()?.close()
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
    await notifySlack({
      level: 'info',
      agent: 'COO',
      title: `[시트 스크래퍼]${filterLabel} 처리 완료`,
      body: `${emoji} ${totalProcessed}건 처리 → ${totalPublished}건 게시, ${totalFailed}건 실패${skipInfo}`,
    })
  } catch (err) {
    console.error('[sheet-scraper] 치명적 오류:', err)
    await notifySlack({
      level: 'critical',
      agent: 'COO',
      title: '[시트 스크래퍼] 치명적 오류',
      body: `❌ ${err instanceof Error ? err.message : String(err)}`,
    }).catch(() => {})
  } finally {
    await disconnect()
  }

  console.log(
    `[sheet-scraper]${filterLabel} 완료: 게시 ${totalPublished}, 실패 ${totalFailed}, 필터 스킵 ${totalSkippedFilter} (${kstNow()})`,
  )
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().then(() => process.exit(0)).catch(() => process.exit(1))
}
