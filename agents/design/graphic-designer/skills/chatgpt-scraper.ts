/**
 * Skill: ChatGPT Scraper
 * Playwright로 chatgpt.com/images에서 이미지 자동 생성
 * 기존 Chrome 프로필 재사용 → OpenAI 로그인 세션 활용, 봇 감지 회피
 *
 * 사전 조건:
 * - Chrome 완전 종료 후 실행 (프로필 충돌 방지)
 * - chatgpt.com 로그인 상태 (ChatGPT Plus 필요)
 * - npx playwright install chromium (최초 1회)
 *
 * // LOCAL ONLY — Playwright 기반 스크래핑, 크론 불필요
 */

import { chromium } from '@playwright/test'
import type { BrowserContext, Page, Locator } from '@playwright/test'
import type { GeneratedImage } from './generate-image.js'
import * as fsp from 'fs/promises'
import * as path from 'path'

// ─── 설정 ────────────────────────────────────────────────────────────────────

/**
 * ChatGPT 자동화 전용 고정 프로필 디렉토리.
 * 최초 1회 수동 로그인 후 세션이 여기에 저장됨.
 * --password-store=basic 로 Keychain 없이 평문 저장 → 재사용 가능.
 */
const CHATGPT_PROFILE_DIR =
  process.env.CHATGPT_PROFILE_DIR ??
  path.join(process.env.HOME!, '.chrome-chatgpt-profile')

const CHATGPT_URL = 'https://chatgpt.com/images'

/**
 * 이미지 감지 최소 URL 길이 — 짧은 아이콘/아바타 URL 제외 (CDN URL은 보통 80자 이상)
 * oaiusercontent, blob: 등 도메인에 무관하게 새 img 감지
 */
const IMG_MIN_URL_LEN = 60

/** aspectRatio → 프롬프트 suffix */
const SIZE_SUFFIX: Record<string, string> = {
  '16:9': 'wide landscape 16:9 aspect ratio, horizontal composition',
  '9:16': 'vertical portrait 9:16 aspect ratio, tall mobile format',
  '1:1': 'square 1:1 aspect ratio, centered composition',
  '4:3': 'horizontal 4:3 format',
  '3:4': 'vertical 3:4 portrait format',
}

// ─── 딜레이 헬퍼 ──────────────────────────────────────────────────────────────

const delay = (min: number, max: number) =>
  new Promise<void>((r) => setTimeout(r, min + Math.random() * (max - min)))

/** 인간 타이핑 시뮬레이션 (40~100ms/자) */
async function humanType(page: Page, text: string): Promise<void> {
  for (const char of text) {
    await page.keyboard.type(char)
    await delay(40, 100)
  }
}

// ─── 브라우저 컨텍스트 (싱글톤) ───────────────────────────────────────────────

let _context: BrowserContext | null = null

export async function getChatGPTBrowserContext(): Promise<BrowserContext> {
  if (_context) return _context

  await fsp.mkdir(CHATGPT_PROFILE_DIR, { recursive: true })
  console.log('[ChatGPT Scraper] Chrome 연결 중...')
  console.log(`  프로필 경로: ${CHATGPT_PROFILE_DIR}`)

  _context = await chromium.launchPersistentContext(CHATGPT_PROFILE_DIR, {
    channel: 'chrome',
    headless: false,
    acceptDownloads: true,
    args: [
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-blink-features=AutomationControlled',
      '--password-store=basic', // Keychain 없이 평문 저장 → 세션 재사용 가능
    ],
    viewport: { width: 1280, height: 900 },
  })

  await ensureLoggedIn(_context)
  console.log('[ChatGPT Scraper] Chrome 연결 완료')
  return _context
}

/** ChatGPT 로그인 상태 확인. 미로그인이면 수동 로그인 대기. */
async function ensureLoggedIn(context: BrowserContext): Promise<void> {
  const page = await context.newPage()
  try {
    await page.goto(CHATGPT_URL, { waitUntil: 'domcontentloaded', timeout: 30_000 })
    await delay(2_000, 3_000)

    // chatgpt.com/images는 비로그인 상태에서도 입력창이 렌더링됨.
    // "로그인" 버튼이 보이면 → 비로그인 상태로 판단.
    const loginBtnVisible = await page
      .locator(
        'a[href*="login"], button:has-text("로그인"), a:has-text("로그인"), [data-testid*="login"]'
      )
      .first()
      .isVisible({ timeout: 4_000 })
      .catch(() => false)

    if (loginBtnVisible) {
      console.log('\n[ChatGPT Scraper] ⚠️  OpenAI 로그인 필요!')
      console.log('  1. 열린 Chrome 창에서 chatgpt.com 로그인')
      console.log('  2. 로그인 완료 후 chatgpt.com/images 메인 화면이 보이면')
      console.log('  3. 이 터미널에서 Enter 를 누르세요\n')
      await new Promise<void>((resolve) => {
        process.stdin.setRawMode?.(false)
        process.stdin.resume()
        process.stdin.once('data', () => {
          process.stdin.pause()
          resolve()
        })
      })
    } else {
      console.log('  [ChatGPT Scraper] 로그인 상태 확인 ✅')
    }
  } finally {
    await page.close()
  }
}

export async function closeChatGPTBrowser(): Promise<void> {
  if (_context) {
    await _context.close()
    _context = null
    console.log('[ChatGPT Scraper] Chrome 종료')
  }
}

// ─── 이미지 추출 헬퍼 ─────────────────────────────────────────────────────────

async function extractImageBuffer(page: Page, src: string): Promise<Buffer> {
  if (src.startsWith('data:')) {
    return Buffer.from(src.split(',')[1], 'base64')
  }

  if (src.startsWith('blob:')) {
    const base64 = await page.evaluate(async (blobUrl: string) => {
      const resp = await fetch(blobUrl)
      const blob = await resp.blob()
      return new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve((reader.result as string).split(',')[1])
        reader.onerror = reject
        reader.readAsDataURL(blob)
      })
    }, src)
    return Buffer.from(base64, 'base64')
  }

  // CDN URL (oaiusercontent.com) — page 컨텍스트로 fetch (쿠키 포함)
  const response = await page.request.get(src)
  return Buffer.from(await response.body())
}

// ─── 이미지 생성 완료 감지 + 추출 ────────────────────────────────────────────

async function downloadGeneratedImage(page: Page, beforeSrcs: string[] = []): Promise<Buffer> {
  console.log('  [ChatGPT] 이미지 생성 완료 대기 (최대 120초)...')
  const beforeJson = JSON.stringify(beforeSrcs)
  let newImgSrc: string | null = null

  const deadline = Date.now() + 120_000
  while (Date.now() < deadline) {
    newImgSrc = (await page.evaluate(`
      (function() {
        var before = ${beforeJson};
        var minLen = ${IMG_MIN_URL_LEN};
        var found = null;
        function walk(root) {
          if (!root || found) return;
          try {
            var imgs = root.querySelectorAll('img[src]');
            for (var i = 0; i < imgs.length; i++) {
              var s = imgs[i].src;
              if (s && s.length > minLen && before.indexOf(s) === -1) {
                found = s; return;
              }
            }
            var all = root.querySelectorAll('*');
            for (var j = 0; j < all.length; j++) {
              if (all[j].shadowRoot) walk(all[j].shadowRoot);
            }
          } catch(e) {}
        }
        walk(document);
        return found;
      })()
    `)) as string | null

    if (newImgSrc) {
      console.log('  [ChatGPT] 새 이미지 감지!')
      break
    }
    await delay(2_000, 3_000)
  }

  if (!newImgSrc) {
    throw new Error('이미지 생성 완료를 120초 내 감지하지 못함 (새 img 미출현)')
  }

  // 1차: CDN URL 직접 fetch (page 컨텍스트 — 쿠키 포함)
  try {
    const buffer = await extractImageBuffer(page, newImgSrc)
    if (buffer.length > 10_000) {
      console.log(`  [ChatGPT] CDN fetch 완료 (${Math.round(buffer.length / 1024)}KB)`)
      return buffer
    }
  } catch {
    console.log('  [ChatGPT] CDN fetch 실패 → 다운로드 버튼 시도...')
  }

  // 2차: hover → 다운로드 버튼 클릭 → download 이벤트
  try {
    const imgLocator = page.locator(`img[src="${newImgSrc}"]`).first()
    await imgLocator.hover({ timeout: 8_000 })
    await delay(600, 1_000)

    const downloadBtn: Locator = page
      .getByRole('button', { name: /download/i })
      .or(page.locator('button[aria-label*="Download" i]'))
      .or(page.locator('button[aria-label*="다운로드" i]'))
      .or(page.locator('[data-testid*="download" i]'))
      .first()

    await downloadBtn.waitFor({ state: 'visible', timeout: 10_000 })

    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 15_000 }),
      downloadBtn.click(),
    ])
    const tmpPath = await download.path()
    if (tmpPath) {
      const buffer = await fsp.readFile(tmpPath)
      console.log(`  [ChatGPT] 파일 다운로드 완료 (${Math.round(buffer.length / 1024)}KB)`)
      return buffer
    }
  } catch {
    console.log('  [ChatGPT] 다운로드 버튼 없음 → page.evaluate fetch 시도...')
  }

  // 3차: page.evaluate 내부에서 fetch + blob → base64 (단일 evaluate, revoke 방지)
  const imgSrcJson = JSON.stringify(newImgSrc)
  const result: { base64: string } | null = await page.evaluate(`
    (function() {
      var src = ${imgSrcJson};
      return fetch(src)
        .then(function(r) { return r.blob(); })
        .then(function(b) {
          return new Promise(function(resolve, reject) {
            var reader = new FileReader();
            reader.onload = function() {
              resolve({ base64: reader.result.split(',')[1] });
            };
            reader.onerror = reject;
            reader.readAsDataURL(b);
          });
        });
    })()
  `)

  if (!result) throw new Error('이미지 추출 실패 — 모든 폴백 소진')

  const buffer = Buffer.from(result.base64, 'base64')
  console.log(`  [ChatGPT] evaluate fetch 완료 (${Math.round(buffer.length / 1024)}KB)`)
  return buffer
}

// ─── 모달 닫기 (생성 전 블로킹 모달 제거) ────────────────────────────────────

async function dismissAnyModal(page: Page): Promise<void> {
  // 로그인/회원가입 모달이 뜨면 ESC로 닫기 시도
  const modalClose = page
    .locator('button[aria-label*="Close" i], button[aria-label*="닫기" i], [data-testid="modal-close-button"]')
    .or(page.getByRole('button', { name: /close/i }))
    .first()

  const visible = await modalClose.isVisible({ timeout: 2_000 }).catch(() => false)
  if (visible) {
    await modalClose.click().catch(() => {})
    await delay(500, 800)
    return
  }

  // X 버튼 없으면 ESC
  const hasModal = await page
    .locator('[role="dialog"], [aria-modal="true"]')
    .first()
    .isVisible({ timeout: 1_500 })
    .catch(() => false)

  if (hasModal) {
    await page.keyboard.press('Escape')
    await delay(500, 800)
  }
}

// ─── 입력창 찾기 ──────────────────────────────────────────────────────────────

async function findInputElement(page: Page): Promise<Locator> {
  // 모달 안 input이 잡히지 않도록 dialog/modal 외부의 textarea만 탐색
  const inputSelectors = [
    '#prompt-textarea:not([form])',
    'textarea[placeholder*="Describe"]:not([type="email"])',
    'textarea[placeholder*="describe"]:not([type="email"])',
    'textarea[placeholder*="이미지"]:not([type="email"])',
    'textarea[data-id="root"]',
    'div[contenteditable="true"][role="textbox"]',
  ]

  for (const sel of inputSelectors) {
    try {
      const el = page.locator(sel).first()
      const visible = await el.isVisible({ timeout: 3_000 }).catch(() => false)
      if (!visible) continue

      // 모달/다이얼로그 안에 있는 input인지 확인
      const isInsideModal = await el.evaluate((node) => {
        let parent = node.parentElement
        while (parent) {
          if (
            parent.getAttribute('role') === 'dialog' ||
            parent.getAttribute('aria-modal') === 'true' ||
            parent.classList.contains('modal')
          ) return true
          parent = parent.parentElement
        }
        return false
      }).catch(() => false)

      if (!isInsideModal) return el
    } catch {
      continue
    }
  }

  throw new Error('ChatGPT 입력창을 찾을 수 없음 — 페이지 구조 변경 가능성')
}

// ─── CAPTCHA / 로그인 리다이렉트 감지 ────────────────────────────────────────

async function checkForBlocking(page: Page): Promise<void> {
  const url = page.url()
  if (
    url.includes('auth.openai.com') ||
    url.includes('/login') ||
    url.includes('/auth/login')
  ) {
    throw new Error(
      'OpenAI 로그인 페이지로 리다이렉트됨. Chrome에서 chatgpt.com에 직접 접속해 로그인 후 다시 실행하세요.'
    )
  }

  const captcha = await page
    .locator('[id*="captcha"], .captcha, #recaptcha')
    .first()
    .isVisible({ timeout: 1_000 })
    .catch(() => false)

  if (captcha) {
    console.warn('\n[ChatGPT Scraper] CAPTCHA 감지! 브라우저 창에서 직접 해결 후 Enter를 누르세요...')
    await new Promise<void>((resolve) => {
      process.stdin.once('data', () => resolve())
    })
  }
}

// ─── 메인: 이미지 생성 ────────────────────────────────────────────────────────

/**
 * ChatGPT (DALL-E 3)로 이미지 1장 생성
 * GeneratedImage[] 반환 — generate-image.ts 인터페이스와 호환
 */
export async function generateWithChatGPT(
  prompt: string,
  aspectRatio: '1:1' | '3:4' | '4:3' | '9:16' | '16:9' = '1:1'
): Promise<GeneratedImage[]> {
  const sizeSuffix = SIZE_SUFFIX[aspectRatio] ?? SIZE_SUFFIX['1:1']
  const fullPrompt = `${prompt}, ${sizeSuffix}`

  console.log(`\n[ChatGPT Scraper] 생성 시작: ${aspectRatio}`)
  console.log(`  프롬프트 (${fullPrompt.length}자): ${fullPrompt.slice(0, 80)}...`)

  const context = await getChatGPTBrowserContext()
  const page = await context.newPage()

  try {
    // 1. chatgpt.com/images 접속
    await page.goto(CHATGPT_URL, { waitUntil: 'domcontentloaded', timeout: 30_000 })
    await delay(2_000, 3_000)
    await checkForBlocking(page)

    // 2. 기존 img src 스냅샷 (생성된 이미지와 기존 이미지 구분용)
    const beforeSrcs: string[] = await page.evaluate(`
      (function() {
        var found = [];
        var minLen = ${IMG_MIN_URL_LEN};
        function walk(root) {
          if (!root) return;
          try {
            var imgs = root.querySelectorAll('img[src]');
            for (var i = 0; i < imgs.length; i++) {
              if (imgs[i].src && imgs[i].src.length > minLen) found.push(imgs[i].src);
            }
            var all = root.querySelectorAll('*');
            for (var j = 0; j < all.length; j++) {
              if (all[j].shadowRoot) walk(all[j].shadowRoot);
            }
          } catch(e) {}
        }
        walk(document);
        return found;
      })()
    `)

    // 3. 모달 닫기 + 입력창 찾기 + 클리어
    await dismissAnyModal(page)
    const inputEl = await findInputElement(page)
    await inputEl.click()
    await delay(400, 700)
    await page.keyboard.press('Meta+A') // Mac
    await page.keyboard.press('Control+A') // Windows 호환
    await page.keyboard.press('Backspace')
    await delay(300, 500)

    // 4. 프롬프트 타이핑 (인간 속도)
    await humanType(page, fullPrompt)
    await delay(1_000, 2_000)

    // 5. Enter 제출
    await page.keyboard.press('Enter')
    console.log('  [ChatGPT] 생성 요청 전송...')

    // 6. 이미지 생성 완료 감지 + 추출
    const buffer = await downloadGeneratedImage(page, beforeSrcs)
    console.log(`  [ChatGPT] 이미지 추출 완료 (${Math.round(buffer.length / 1024)}KB)`)

    return [
      {
        buffer,
        prompt: fullPrompt,
        revisedPrompt: undefined,
        model: 'chatgpt-dalle',
        aspectRatio,
      },
    ]
  } finally {
    await page.close()
    // 소재 간 대기 (15~30초) — rate limit + 봇 감지 회피 핵심
    console.log('  [ChatGPT] 다음 생성 전 대기 중 (15~30초)...')
    await delay(15_000, 30_000)
  }
}
