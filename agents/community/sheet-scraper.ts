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
import { findPoliticalKeyword } from '../core/political-blocklist.js'
import { findSheetContentQualityViolation } from '../core/content-quality-rules.js'
import { readPendingRows, updateRow } from './sheets-client.js'
import { detectSite, normalizeNaverCafeUrl, resolveNaverShortUrl, randomUserAgent, isCloudflareChallenge, type SiteConfig } from './site-configs.js'
import { processContentMedia } from './image-pipeline.js'
import { transformContent, transformRawContent, classifyCategory, hasYoungDemographicMarker } from './content-transformer.js'
import { polishTitleForSeo } from './title-seo.js'
import { normalizeSourceReferences } from '../cafe/normalize-source-references.js'

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
// 2026-07-07 다양화: 게시글 작성자 쏠림(오후햇살 22%) 완화. persona-data.ts 미사용 봇을 category별로 편입.
// - 기존 19명의 nickname(별칭)은 E열 override 호환 위해 유지(봄바람=E, 매일걷기=H, 오후세시=P 등).
// - 신규 추가분은 persona-data.ts 실제 nickname 사용. id는 persona-data key(getBotUser 매핑).
// - BI~BW는 댓글 wave 전용(WAVE_PERSONAS)이라 게시글 풀에 넣지 않음. JOB/EN/N 특수 persona 제외.
const PERSONAS: PersonaMapping[] = [
  // ── HUMOR (7) ──
  { id: 'C',  nickname: 'ㅋㅋ요정',   categories: ['유머'],         boards: ['HUMOR'] },
  { id: 'AF', nickname: '하하호호',   categories: ['유머'],         boards: ['HUMOR'] },
  { id: 'AY', nickname: '웃음보따리', categories: ['유머'],         boards: ['HUMOR'] },
  { id: 'R',  nickname: '밤새봤다',   categories: ['힐링'],         boards: ['HUMOR'] },
  { id: 'AO', nickname: '웃음충전',   categories: ['힐링', '추천'], boards: ['HUMOR'] },
  { id: 'AP', nickname: '짤방요정',   categories: ['힐링'],         boards: ['HUMOR'] },
  { id: 'AX', nickname: '밴드여왕',   categories: ['추천'],         boards: ['HUMOR'] },
  // ── STORY 일상 ──
  { id: 'A',  nickname: '하늘바라기', categories: ['일상'], boards: ['STORY'] },
  { id: 'E',  nickname: '봄바람',     categories: ['일상'], boards: ['STORY'] },
  { id: 'I',  nickname: '한페이지',   categories: ['일상'], boards: ['STORY'] },
  { id: 'F',  nickname: '경기댁',     categories: ['일상'], boards: ['STORY'] },
  { id: 'G',  nickname: '혼자여행ok', categories: ['일상'], boards: ['STORY'] },
  { id: 'S',  nickname: '제주살이',   categories: ['일상'], boards: ['STORY'] },
  { id: 'AC', nickname: '느긋이',     categories: ['일상'], boards: ['STORY'] },
  { id: 'AI', nickname: '마당있는집', categories: ['일상'], boards: ['STORY'] },
  { id: 'AV', nickname: '혼밥일기',   categories: ['일상'], boards: ['STORY'] },
  { id: 'AW', nickname: '손뜨개',     categories: ['일상'], boards: ['STORY'] },
  { id: 'AQ', nickname: '조용한수다', categories: ['일상'], boards: ['STORY'] },
  // ── STORY 고민 ──
  { id: 'X',  nickname: '걱정인형',     categories: ['고민'], boards: ['STORY'] },
  { id: 'AA', nickname: '어휴답답',     categories: ['고민'], boards: ['STORY'] },
  { id: 'AM', nickname: '불안한밤',     categories: ['고민'], boards: ['STORY'] },
  { id: 'AH', nickname: '피곤해요',     categories: ['고민'], boards: ['STORY'] },
  { id: 'BC', nickname: '억울한아내',   categories: ['고민'], boards: ['STORY'] },
  { id: 'BD', nickname: '고부갈등맘',   categories: ['고민'], boards: ['STORY'] },
  { id: 'BF', nickname: '속터지는현실', categories: ['고민'], boards: ['STORY'] },
  { id: 'AJ', nickname: '가족곁에서',   categories: ['고민', '자녀'], boards: ['STORY'] },
  // ── STORY 건강 ──
  { id: 'H',  nickname: '매일걷기', categories: ['건강'],         boards: ['STORY'] },
  { id: 'M',  nickname: '등산만보', categories: ['건강'],         boards: ['STORY'] },
  { id: 'AN', nickname: '약국단골', categories: ['건강'],         boards: ['STORY'] },
  { id: 'AL', nickname: '헬스덕후', categories: ['건강'],         boards: ['STORY'] },
  { id: 'AU', nickname: '체력왕',   categories: ['건강', '자랑'], boards: ['STORY'] },
  // ── STORY 자녀 ──
  { id: 'L',  nickname: '손주러브',   categories: ['자녀'], boards: ['STORY'] },
  { id: 'AK', nickname: '엄마뭐해요', categories: ['자녀'], boards: ['STORY'] },
  // ── STORY 자랑 ──
  { id: 'K',  nickname: '예쁘게살자', categories: ['자랑'], boards: ['STORY'] },
  { id: 'J',  nickname: '이밥차밥',   categories: ['자랑'], boards: ['STORY'] },
  // ── STORY 추천 ──
  { id: 'T',  nickname: '배움은즐거워', categories: ['추천'], boards: ['STORY'] },
  { id: 'AT', nickname: '자격증도전',   categories: ['추천'], boards: ['STORY'] },
  { id: 'AG', nickname: '비교분석왕',   categories: ['추천'], boards: ['STORY'] },
  { id: 'O',  nickname: '올드팝',       categories: ['추천'], boards: ['STORY'] },
  { id: 'AR', nickname: '요즘세상',     categories: ['추천'], boards: ['STORY'] },
  // ── STORY 기타 ──
  { id: 'P',  nickname: '오후세시',   categories: ['기타'], boards: ['STORY'] },
  { id: 'U',  nickname: '부산아지매', categories: ['기타'], boards: ['STORY'] },
  { id: 'Q',  nickname: '멍멍이엄마', categories: ['기타'], boards: ['STORY'] },
  { id: 'AD', nickname: '그때그시절', categories: ['기타'], boards: ['STORY'] },
  { id: 'AE', nickname: '새벽감성',   categories: ['기타'], boards: ['STORY'] },
  { id: 'V',  nickname: '웃음천만개', categories: ['기타'], boards: ['STORY'] },
  { id: 'W',  nickname: '참나진짜',   categories: ['기타'], boards: ['STORY'] },
  { id: 'Z',  nickname: '혼자잘산다', categories: ['기타'], boards: ['STORY'] },
  { id: 'BG', nickname: '황당목격자', categories: ['기타'], boards: ['STORY'] },
  { id: 'BH', nickname: '반전언니',   categories: ['기타'], boards: ['STORY'] },
  // ── LIFE2 (6, category 세분 없이 board pool 공유) ──
  { id: 'B',  nickname: '정순씨',     categories: ['일상', '고민', '은퇴'], boards: ['LIFE2'] },
  { id: 'Y',  nickname: '솔직히말해서', categories: ['고민', '기타'],        boards: ['LIFE2'] },
  { id: 'AB', nickname: '따져보자',   categories: ['일상', '기타'],         boards: ['LIFE2'] },
  { id: 'BX', nickname: '말티즈엄마', categories: ['일상', '기타'],         boards: ['LIFE2'] },
  { id: 'AZ', nickname: '돈공부중',   categories: ['재테크', '은퇴', '기타'], boards: ['LIFE2'] },
  { id: 'BA', nickname: '은퇴준비중', categories: ['은퇴', '기타'],         boards: ['LIFE2'] },
]

function getBoardSlug(boardType: 'STORY' | 'HUMOR' | 'LIFE2'): string {
  if (boardType === 'STORY') return 'stories'
  if (boardType === 'HUMOR') return 'humor'
  return 'life2'
}

// cooldown: 최근 같은 boardType SHEET 게시글에서 쓴 persona를 자동 선택 후보에서 제외.
const PERSONA_COOLDOWN_RECENT = 10   // 최근 N개 SHEET 게시글 조회
const PERSONA_CATEGORY_MIN = 5       // categoryPool이 이 수 미만이면 boardPool로 확장

/** 최근 같은 board SHEET 게시글 author.email에서 최근 사용 persona id 추출 (getBotUser 미호출) */
async function recentSheetPersonaIds(boardType: 'STORY' | 'HUMOR' | 'LIFE2'): Promise<Set<string>> {
  const recent = await prisma.post.findMany({
    where: { source: 'SHEET', boardType },
    orderBy: { createdAt: 'desc' },
    take: PERSONA_COOLDOWN_RECENT,
    select: { author: { select: { email: true } } },
  })
  const ids = new Set<string>()
  for (const p of recent) {
    const m = p.author?.email?.match(/^bot-(.+)@unao\.bot$/i)
    if (m) ids.add(m[1].toUpperCase())
  }
  return ids
}

async function pickPersona(
  category: string,
  boardType: 'STORY' | 'HUMOR' | 'LIFE2',
  overrideNickname?: string,
): Promise<PersonaMapping> {
  // 창업자가 지정한 닉네임/ID 우선 (cooldown보다 최우선 — 기존 동작 유지)
  if (overrideNickname) {
    const match = PERSONAS.find(
      (p) => p.nickname === overrideNickname || p.id === overrideNickname.toUpperCase(),
    )
    if (match) return match
  }

  // 최근 사용 persona 제외 (cooldown)
  const recentIds = await recentSheetPersonaIds(boardType)
  const pick = <T>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)]

  // category + boardType 매칭 풀 (cooldown 적용)
  let categoryPool = PERSONAS.filter(
    (p) => p.categories.includes(category) && p.boards.includes(boardType) && !recentIds.has(p.id),
  )
  // cooldown 후 5명 미만이면 boardPool로 확장 (cooldown 유지)
  if (categoryPool.length < PERSONA_CATEGORY_MIN) {
    const boardPoolCooled = PERSONAS.filter((p) => p.boards.includes(boardType) && !recentIds.has(p.id))
    if (boardPoolCooled.length > categoryPool.length) categoryPool = boardPoolCooled
  }
  if (categoryPool.length > 0) return pick(categoryPool)

  // fallback 1: cooldown 무시하고 boardType 매칭
  const boardPool = PERSONAS.filter((p) => p.boards.includes(boardType))
  if (boardPool.length > 0) return pick(boardPool)

  // fallback 2: 전체 풀 랜덤
  return pick(PERSONAS)
}

// ── 카테고리 결정 (하이브리드: 시트 D열 → 자동분류 → 게시판 기본값) ──
// 스크래퍼는 큐레이션과 독립. 어떤 경우에도 DB BoardConfig에 존재하는 값만 저장한다.

/** 게시판별 안전 기본값 — 각 게시판 BoardConfig 유효값 중 가장 중립적인 것 */
const BOARD_DEFAULT_CATEGORY: Record<'STORY' | 'HUMOR' | 'LIFE2', string> = {
  STORY: '자유수다',
  HUMOR: '기타',
  LIFE2: '은퇴준비',
}

/** DB BoardConfig에서 게시판별 유효 카테고리 set 로드 (스크랩 시작 시 1회, 메모리 캐시) */
async function loadValidCategories(): Promise<Record<string, Set<string>>> {
  const configs = await prisma.boardConfig.findMany({ select: { boardType: true, categories: true } })
  const map: Record<string, Set<string>> = {}
  for (const c of configs) map[c.boardType] = new Set(c.categories)
  return map
}

/**
 * 하이브리드 카테고리 결정.
 *  ① 시트 D열(manual)이 해당 게시판 유효 set에 있으면 그대로
 *  ② classifyCategory 결과가 유효 set에 있으면 그대로
 *  ③ 둘 다 실패 시 게시판 안전 기본값
 * BoardConfig 로드 실패(빈 set) 시에는 잘못된 자동분류 저장을 막기 위해 manual→기본값만 사용.
 */
function resolveScraperCategory(
  manual: string | undefined,
  title: string,
  content: string,
  boardType: 'STORY' | 'HUMOR' | 'LIFE2',
  validSet: Set<string> | undefined,
): string {
  const fallback = BOARD_DEFAULT_CATEGORY[boardType]
  const m = manual?.trim()
  if (!validSet || validSet.size === 0) return m || fallback
  if (m && validSet.has(m)) return m
  const auto = classifyCategory(title, content, boardType)
  if (validSet.has(auto)) return auto
  return fallback
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

// 원문 댓글 직접 사용(2차 PR) 전 위험 댓글 차단 (2026-07-07 안전장치).
// 복합 패턴 중심 — "보험/투자/카톡" 단독어는 정상 경험담 오탐이라 차단하지 않는다.
const SC_HARD_REJECT_PATTERNS: RegExp[] = [
  // 1. 광고/홍보/오픈채팅 (유도 문구 복합)
  /오픈\s*채팅/, /카톡\s*(검색|추가|아디|아이디)/, /검색\s*후\s*(연락|문의)/,
  /상담\s*(문의|가능)/, /문의\s*주세요/, /프로필\s*(참고|링크)/,
  // 2. PII (전화번호/이메일)
  /01[0-9][-\s.]?\d{3,4}[-\s.]?\d{4}/, /[\w.+-]+@[\w-]+\.[\w.]+/,
  // 3. 정치/정당/선거
  /좌파|우파|민주당|국민의힘|이재명|윤석열|정권|종북/,
  // 4. 노골 욕설
  /씨발|시발|병신|개새끼|좆|지랄/,
  // 5. 노골 성적 표현
  /섹스리스|자위|야동|성기/,
]

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
      if (SC_HARD_REJECT_PATTERNS.some(re => re.test(c))) return false  // 광고/PII/정치/욕설/성적 차단
      const key = c.slice(0, 4)
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    .filter(c => c.length >= 10)
}

// ── 메인 파이프라인 ──

// ── CLI 인자 + 환경변수 파싱 ──

/** 콤마 구분 다중값 파싱 — "navercafe,bboom" → ['navercafe','bboom'], 빈값은 [] */
function parseSiteList(value: string | null | undefined): string[] {
  if (!value) return []
  return value.split(',').map(s => s.trim()).filter(Boolean)
}

function parseSiteFilter(): { siteOnly: string[]; siteExclude: string[] } {
  const args = process.argv.slice(2)
  const siteIdx = args.indexOf('--site')
  // --site(argv) 우선, 없으면 SHEET_SCRAPER_ONLY_SITE(env) — runner 경유(GHA dawn)에서 argv가 모호하므로 env도 지원
  const argvOnly = parseSiteList(siteIdx !== -1 ? args[siteIdx + 1] : null)
  const siteOnly = argvOnly.length > 0 ? argvOnly : parseSiteList(process.env.SHEET_SCRAPER_ONLY_SITE)
  const siteExclude = parseSiteList(process.env.SHEET_SCRAPER_EXCLUDE_SITE)
  return { siteOnly, siteExclude }
}

export async function main() {
  const { siteOnly, siteExclude } = parseSiteFilter()
  // 탭 모드: SHEET_SCRAPER_MODE=dawn 이면 새벽 탭만, 기본 daytime(기존 6탭, 새벽 탭 제외 — 회귀 방지)
  const sheetMode: 'daytime' | 'dawn' = process.env.SHEET_SCRAPER_MODE === 'dawn' ? 'dawn' : 'daytime'
  const filterLabel = siteOnly.length > 0 ? `[${siteOnly.join(',')} only]` : siteExclude.length > 0 ? `[${siteExclude.join(',')} 제외]` : ''
  console.log(`[sheet-scraper]${filterLabel} 시작:`, kstNow())

  let totalProcessed = 0
  let totalPublished = 0
  let totalFailed = 0
  let totalSkippedFilter = 0

  try {
    // 1. Sheet에서 PENDING 행 읽기 (daytime=기존 6탭 / dawn=사는이야기_새벽만)
    const tabs = await readPendingRows({ mode: sheetMode })

    if (tabs.length === 0) {
      console.log('[sheet-scraper] 처리할 PENDING 행 없음')
      return
    }

    const totalRows = tabs.reduce((sum, t) => sum + t.rows.length, 0)
    console.log(`[sheet-scraper] ${totalRows}건 PENDING 발견`)

    // BoardConfig 유효 카테고리 set 로드 (게시판별, 1회) — 자동분류 결과를 실제 운영값과 대조
    const validCategories = await loadValidCategories()

    // 2. 브라우저 시작
    const context = await launchBrowser()
    let sessionContext: BrowserContext | null = null

    try {
      for (const tab of tabs) {
        for (const row of tab.rows) {
          totalProcessed++
          console.log(`[sheet-scraper] [${totalProcessed}/${totalRows}] ${row.sourceUrl}`)

          try {
            // naver.me 단축링크 → 실제 URL 해석 (naver.me 아니면 원본 그대로)
            const resolvedUrl = await resolveNaverShortUrl(row.sourceUrl)
            // 네이버 카페 구형 URL → f-e article URL 정규화 (Sheet 원본 source_url은 불변)
            const normalizedUrl = normalizeNaverCafeUrl(resolvedUrl)
            // dedup/저장 키: naver.me로 해석된 행만 정규화 URL 사용 (비-naver 행은 기존 동작 유지 → 회귀 방지)
            const effectiveUrl = resolvedUrl !== row.sourceUrl ? normalizedUrl : row.sourceUrl

            // 사이트 감지 (필터링 전에 먼저 수행 — PROCESSING 마킹 방지)
            const siteConfig = detectSite(normalizedUrl)

            // 사이트 필터: --site navercafe,bboom → 지정 사이트만 처리, 나머지 PENDING 유지
            if (siteOnly.length > 0 && siteConfig && !siteOnly.includes(siteConfig.id)) {
              console.log(`  → SKIP (필터: ${siteOnly.join(',')} only)`)
              totalSkippedFilter++
              continue
            }
            // 사이트 제외: SHEET_SCRAPER_EXCLUDE_SITE=fmkorea,bboom → 지정 사이트 건너뜀
            if (siteExclude.length > 0 && siteConfig && siteExclude.includes(siteConfig.id)) {
              console.log(`  → SKIP (제외: ${siteConfig.id})`)
              totalSkippedFilter++
              continue
            }
            // 새벽 탭 scheduled_hour_kst 필터 (dawn 탭 전용) — 일반 탭은 tab.isDawn=false라 영향 없음.
            // 예약시각(1~7) 없거나 범위 밖 → PENDING 유지(처리 안 함). 현재 KST hour보다 미래 → PENDING 유지.
            if (tab.isDawn) {
              if (row.scheduledHourKst === undefined) {
                console.log(`  → SKIP (새벽: scheduled_hour_kst 범위밖/미입력, PENDING 유지)`)
                totalSkippedFilter++
                continue
              }
              const nowKstHour = new Date(Date.now() + 9 * 3600_000).getUTCHours()
              if (nowKstHour < row.scheduledHourKst) {
                console.log(`  → SKIP (새벽: 예약 ${row.scheduledHourKst}:00 > 현재 ${nowKstHour}시, PENDING 유지)`)
                totalSkippedFilter++
                continue
              }
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
              where: { sourceUrl: effectiveUrl, status: { not: 'DELETED' } },
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
              where: { sourceUrl: effectiveUrl, status: 'DELETED' },
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
              // [③ 가드 2026-06-15] 잘못된 행(본문이 링크 한 줄/내부 CUID뿐, 또는 제목 없음) 발행 차단.
              // 원인: 시트 J열(rawContent)에 실제 글이 아닌 링크/ID가 수동 입력된 행 → "(제목 없음)" 깨진 글 발행되던 문제.
              const _plain = row.rawContent.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()
              const _isUrlOnly = /^https?:\/\/\S+$/.test(_plain)
              const _isCuid = /^c[a-z0-9]{20,}$/.test(_plain)
              if (!row.title?.trim() || _isUrlOnly || _isCuid) {
                await updateRow(tab.tabName, row.rowIndex, {
                  status: 'FAILED',
                  error: '본문이 링크/ID뿐이거나 제목 없음 — 발행 제외 (rawContent 확인 필요)',
                })
                totalFailed++
                console.log(`  → FAILED: 수동모드 본문 부적합(링크/ID/무제목)`)
                continue
              }
              title = row.title || '(제목 없음)'
              content = transformRawContent(row.rawContent, row.sourceUrl, siteConfig.name, tab.boardType)
              console.log(`  → raw_content 사용 (스크래핑 스킵)`)
            } else {
              // 자동 스크래핑
              const activeContext = siteConfig?.requiresSession && sessionContext ? sessionContext : context
              const result = await scrapePage(activeContext, normalizedUrl, siteConfig, tab.boardType)
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

            // P2(2026-06-16): 50-60 커뮤니티 부적합 — 본인 임신/출산/산후/영아육아 단계 글(20-30대) 발행 제외.
            //   레몬테라스 등 젊은층 카페 글 유입 차단. 손주/어린이집 등 모호어는 마커에서 제외(오탐 방지).
            if (hasYoungDemographicMarker(`${title} ${content}`)) {
              await updateRow(tab.tabName, row.rowIndex, {
                status: 'FAILED',
                error: '20-30대 데모그래픽(임신/출산/육아) 글 — 50-60 부적합으로 발행 제외',
              })
              totalFailed++
              console.log('  → FAILED: 젊은층 데모그래픽 글 발행 제외')
              continue
            }

            // 정치 키워드 hard block (P0) — 제목/본문에 정치 키워드가 있으면 자동 발행 제외.
            //   이미지 제거 발행 X, Post 생성 X. row만 FAILED 처리.
            const political = findPoliticalKeyword(title, content)
            if (political) {
              await updateRow(tab.tabName, row.rowIndex, {
                status: 'FAILED',
                error: `정치 키워드 포함 — 자동 발행 제외: ${political.keyword}`,
              })
              totalFailed++
              console.log(`  → FAILED: 정치 키워드 포함 (${political.keyword}/${political.field})`)
              continue
            }

            // 콘텐츠 품질 rule gate (PR-1, 2026-07-14) — 날짜 스탬프 연재/브리핑·원카페 흔적·광고 차단.
            //   image-router append 게이트의 2차 방어(수동/외부 row 커버). title-seo가 원문 제목의
            //   날짜/연재 신호를 약화시키므로 반드시 SEO 다듬기 **전**에 검사한다.
            const quality = findSheetContentQualityViolation(title, content, new Date())
            if (quality) {
              await updateRow(tab.tabName, row.rowIndex, {
                status: 'FAILED',
                error: `콘텐츠 품질 rule 차단: ${quality}`,
              })
              totalFailed++
              console.log(`  → FAILED: 콘텐츠 품질 rule 차단 (${quality})`)
              continue
            }

            // 제목 SEO 다듬기 (SHEET_TITLE_SEO=true + 시트 C열 수동 제목 없을 때만). 본문은 절대 불변.
            if (process.env.SHEET_TITLE_SEO === 'true' && !row.title) {
              title = await polishTitleForSeo(title, content, isImageLikePostContent(content))
            }

            // 카테고리 결정 (하이브리드: 시트 D열 → 자동분류 → 게시판 기본값, 모두 BoardConfig 유효값으로 보장)
            const category = resolveScraperCategory(row.category, title, content, tab.boardType, validCategories[tab.boardType])
            const finalTitle = title

            // '가입인사'는 회원 첫 참여 온보딩 전용 — SHEET(시트 D열)로는 생성 차단.
            // (src import 금지: 리터럴 비교. src/lib/greeting.ts GREETING_CATEGORY와 동기화)
            if (category === '가입인사') {
              console.warn(`[sheet-scraper] '가입인사'는 회원 전용 카테고리 — 행 건너뜀: ${finalTitle}`)
              continue
            }

            // 페르소나 선택
            const persona = await pickPersona(category, tab.boardType, row.persona)
            const userId = await getBotUser(persona.id)

            // 원문 사이트명/카페 호칭 정규화 — 발행 직전, CafePost/시트 원본 보존 (P0 2026-07-16)
            const normTitle = normalizeSourceReferences(finalTitle)
            const normContent = normalizeSourceReferences(content)
            if (normTitle.replacements.length + normContent.replacements.length > 0) {
              console.log(`[sheet-scraper] 출처 정규화 ${normTitle.replacements.length + normContent.replacements.length}건: "${finalTitle.slice(0, 24)}"`)
            }
            if (normContent.flags.length > 0) {
              console.warn(`[sheet-scraper] 맥락 의존 신호(${normContent.flags.join(',')}) — 치환 없이 기록만: "${finalTitle.slice(0, 24)}"`)
            }

            // 게시 (삭제된 게시글 재활용 또는 신규 생성)
            const slug = await generateCommunitySlug(normTitle.text)
            const postData = {
              title: normTitle.text,
              content: normContent.text,
              boardType: tab.boardType,
              category,
              authorId: userId,
              source: 'SHEET' as const,
              status: 'PUBLISHED' as const,
              sourceUrl: effectiveUrl,
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

/**
 * placeholder로 깨진 기존 글의 미디어 백필 — 원글(sourceUrl) 재스크랩 → content/thumbnailUrl 갱신.
 * GIF→mp4 파이프라인 도입(2026-06) 이전에 5MB 초과로 placeholder 처리된 글 복구용.
 * targetSlugs 미지정 시 placeholder 포함 글 전체. DB write는 sheet-scraper 권한 내에서 수행.
 */
export async function backfillPlaceholderMedia(targetSlugs?: string[]): Promise<void> {
  const posts = await prisma.post.findMany({
    where: {
      content: { contains: 'image-placeholder' },
      ...(targetSlugs && targetSlugs.length > 0 ? { slug: { in: targetSlugs } } : {}),
    },
    select: { id: true, slug: true, sourceUrl: true },
  })
  console.log(`[backfill] 대상 ${posts.length}개`)
  if (posts.length === 0) return

  const context = await launchBrowser()
  let sessionContext: BrowserContext | null = null
  let fixed = 0
  let failed = 0
  let stillBroken = 0

  try {
    for (const post of posts) {
      if (!post.sourceUrl) {
        console.log(`  SKIP ${post.slug} — sourceUrl 없음`)
        failed++
        continue
      }
      try {
        const normalizedUrl = normalizeNaverCafeUrl(post.sourceUrl)
        const siteConfig = detectSite(normalizedUrl)
        if (!siteConfig) {
          console.log(`  SKIP ${post.slug} — 사이트 미감지: ${post.sourceUrl}`)
          failed++
          continue
        }

        let ctx: BrowserContext = context
        if (siteConfig.requiresSession) {
          const storagePath = resolve(dirname(fileURLToPath(import.meta.url)), '../cafe/storage-state.json')
          if (!existsSync(storagePath)) {
            console.log(`  SKIP ${post.slug} — storage-state.json 없음 (세션 필요)`)
            failed++
            continue
          }
          if (!sessionContext) sessionContext = await launchBrowserWithSession(storagePath)
          ctx = sessionContext
        }

        const result = await scrapePage(ctx, normalizedUrl, siteConfig)
        const stillPlaceholder = /image-placeholder/.test(result.content)
        await prisma.post.update({
          where: { id: post.id },
          data: {
            content: result.content,
            ...(result.thumbnailUrl ? { thumbnailUrl: result.thumbnailUrl } : {}),
          },
        })
        if (stillPlaceholder) stillBroken++
        console.log(`  ${stillPlaceholder ? '⚠️' : '✅'} ${post.slug} — img:${result.imageCount} vid:${result.videoCount}${stillPlaceholder ? ' (placeholder 잔존)' : ''}`)
        fixed++
      } catch (err) {
        console.warn(`  ❌ ${post.slug} — ${err instanceof Error ? err.message : String(err)}`)
        failed++
      }
    }
  } finally {
    await context.close()
    if (sessionContext) await sessionContext.close()
  }
  console.log(`[backfill] 완료: 갱신 ${fixed} / 실패 ${failed} / placeholder잔존 ${stillBroken}`)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().then(() => process.exit(0)).catch(() => process.exit(1))
}
