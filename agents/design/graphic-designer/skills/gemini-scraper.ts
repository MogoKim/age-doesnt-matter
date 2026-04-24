/**
 * Skill: Gemini Scraper
 * Playwright로 gemini.google.com에서 이미지 자동 생성
 * 기존 Chrome 프로필 재사용 → 구글 로그인 세션 활용, 봇 감지 회피
 *
 * 사전 조건:
 * - Chrome 완전 종료 후 실행 (프로필 충돌 방지)
 * - gemini.google.com 로그인 상태 (Google One AI Plus 필요)
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
 * Gemini 자동화 전용 고정 프로필 디렉토리.
 * 최초 1회 수동 로그인 후 세션이 여기에 저장됨.
 * --password-store=basic 로 Keychain 없이 평문 저장 → 재사용 가능.
 */
const GEMINI_PROFILE_DIR =
  process.env.GEMINI_PROFILE_DIR ??
  path.join(process.env.HOME!, '.chrome-gemini-profile')

const GEMINI_URL = 'https://gemini.google.com/app'

/** aspectRatio → 프롬프트 suffix */
const SIZE_SUFFIX: Record<string, string> = {
  '16:9': 'wide horizontal landscape composition, 16:9 aspect ratio',
  '9:16': 'vertical portrait composition, 9:16 aspect ratio, tall mobile format',
  '1:1': 'square composition, 1:1 aspect ratio',
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

/**
 * URL.createObjectURL 패치를 통해 이미지 blob을 캡처하는 콜백.
 * downloadGeneratedImage()가 다운로드 버튼 클릭 전에 설정하고
 * exposeFunction '__captureImageBlob__'이 호출되면 실행됨.
 */
let _captureCallback: ((base64: string) => void) | null = null

export async function getGeminiBrowserContext(): Promise<BrowserContext> {
  if (_context) return _context

  await fsp.mkdir(GEMINI_PROFILE_DIR, { recursive: true })
  console.log('[Gemini Scraper] Chrome 연결 중...')
  console.log(`  프로필 경로: ${GEMINI_PROFILE_DIR}`)

  _context = await chromium.launchPersistentContext(GEMINI_PROFILE_DIR, {
    channel: 'chrome',
    headless: false,
    acceptDownloads: true, // download 이벤트 인터셉트 필수
    args: [
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-blink-features=AutomationControlled',
      '--password-store=basic', // Keychain 없이 평문 저장 → 세션 재사용 가능
    ],
    viewport: { width: 1280, height: 900 },
  })

  // 로그인 상태 확인 → 미로그인이면 사용자에게 수동 로그인 요청
  await ensureLoggedIn(_context)

  // URL.createObjectURL 패치: 이미지 blob 생성 즉시 캡처
  // blob URL은 생성 직후 revoke될 수 있으므로, 생성 시점에 FileReader로 즉시 base64 변환
  await _context.exposeFunction('__captureImageBlob__', (base64: string) => {
    if (_captureCallback) {
      _captureCallback(base64)
      _captureCallback = null
    }
  })

  await _context.addInitScript(`
    (function() {
      var orig = URL.createObjectURL.bind(URL);
      URL.createObjectURL = function(blob) {
        var url = orig(blob);
        if (blob && blob.type && blob.type.indexOf('image/') === 0 && blob.size > 50000) {
          var reader = new FileReader();
          reader.onload = function() {
            if (typeof window.__captureImageBlob__ === 'function') {
              window.__captureImageBlob__(reader.result.split(',')[1]);
            }
          };
          reader.readAsDataURL(blob);
        }
        return url;
      };
    })()
  `)

  console.log('[Gemini Scraper] Chrome 연결 완료')
  return _context
}

/** Gemini 로그인 상태 확인. 미로그인이면 수동 로그인 대기. */
async function ensureLoggedIn(context: BrowserContext): Promise<void> {
  const page = await context.newPage()
  try {
    await page.goto(GEMINI_URL, { waitUntil: 'domcontentloaded', timeout: 30_000 })
    await delay(2_000, 3_000)

    // 채팅 입력창이 보이면 로그인된 상태 (Sign in 버튼 감지보다 정확)
    const chatInputVisible = await page
      .locator('rich-textarea, .ql-editor, [data-placeholder], textarea[aria-label]')
      .first()
      .isVisible({ timeout: 4_000 })
      .catch(() => false)

    if (!chatInputVisible) {
      console.log('\n[Gemini Scraper] ⚠️  구글 로그인 필요!')
      console.log('  1. 열린 Chrome 창에서 Google 계정으로 로그인')
      console.log('  2. gemini.google.com 메인 화면이 열리면')
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
      console.log('  [Gemini Scraper] 로그인 상태 확인 ✅')
    }
  } finally {
    await page.close()
  }
}

export async function closeGeminiBrowser(): Promise<void> {
  if (_context) {
    await _context.close()
    _context = null
    console.log('[Gemini Scraper] Chrome 종료')
  }
}


// ─── 이미지 생성 대기 (DOM 변화 감지 방식) ───────────────────────────────────
// CSS 셀렉터 독립적 — Gemini UI 변경에 강건

/**
 * 생성된 이미지의 다운로드 버튼을 클릭해 Buffer 획득
 * DOM/shadow DOM 구조 완전 무관 — Playwright download event 활용
 *
 * 전략:
 * 1. 새 img 요소 출현 대기 (이미지 생성 완료 감지)
 * 2. 이미지에 hover → 다운로드 버튼 출현 (Gemini UI hover-only 버튼)
 * 3. 다운로드 버튼 클릭
 */
async function downloadGeneratedImage(page: Page, beforeSrcs: string[] = []): Promise<Buffer> {
  // ── Step A: 새 img 요소 출현 대기 (이미지 생성 완료 감지) ──────────────────
  console.log('  [Gemini] 이미지 생성 완료 대기 (최대 120초)...')
  const beforeJson = JSON.stringify(beforeSrcs)
  let newImgLocator: Locator | null = null

  const deadline = Date.now() + 120_000
  while (Date.now() < deadline) {
    // Shadow DOM 포함 새 img 탐색
    const newSrc: string | null = await page.evaluate(`
      (function() {
        var before = ${beforeJson};
        var found = null;
        function walk(root) {
          if (!root || found) return;
          try {
            var imgs = root.querySelectorAll('img[src]');
            for (var i = 0; i < imgs.length; i++) {
              var s = imgs[i].src;
              if (s && s.length > 10 && before.indexOf(s) === -1) { found = s; return; }
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
    if (newSrc) {
      // src 기반 locator (Shadow DOM 관통)
      newImgLocator = page.locator(`img[src="${newSrc}"]`).first()
      console.log('  [Gemini] 새 이미지 감지 — hover 시도...')
      break
    }
    await delay(1_500, 2_500)
  }

  if (!newImgLocator) {
    throw new Error('이미지 생성 완료를 120초 내 감지하지 못함 (새 img 요소 미출현)')
  }

  // ── Step B: 이미지 hover → 다운로드 버튼 출현 유도 ────────────────────────
  try {
    await newImgLocator.hover({ timeout: 10_000 })
    await delay(800, 1_200)
  } catch {
    console.log('  [Gemini] hover 실패 — 다운로드 버튼 직접 탐색 시도...')
  }

  // ── Step C: 다운로드 버튼 대기 ─────────────────────────────────────────────
  const downloadBtn = page
    .getByRole('button', { name: /download/i })
    .or(page.locator('button[aria-label*="Download" i]'))
    .or(page.locator('button[aria-label*="다운로드" i]'))
    .or(page.locator('[data-tooltip*="download" i]'))
    .or(page.locator('button[data-mat-icon-name*="download" i]'))
    .or(page.locator('button.download-button, button.download, [class*="download"]'))
    .first()

  console.log('  [Gemini] 다운로드 버튼 대기 (최대 15초)...')
  await downloadBtn.waitFor({ state: 'visible', timeout: 15_000 })
  console.log('  [Gemini] 이미지 생성 완료 — 다운로드 시도...')

  // 1차: URL.createObjectURL 패치로 blob 생성 즉시 캡처 (revoke 전에 데이터 확보)
  const capturePromise = new Promise<string>((resolve) => {
    _captureCallback = resolve
  })
  await downloadBtn.click()
  try {
    const base64 = await Promise.race([
      capturePromise,
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('capture timeout')), 30_000)),
    ])
    const buffer = Buffer.from(base64, 'base64')
    console.log(`  [Gemini] URL.createObjectURL 캡처 완료 (${Math.round(buffer.length / 1024)}KB)`)
    return buffer
  } catch {
    _captureCallback = null
    console.log('  [Gemini] createObjectURL 캡처 실패 → download 이벤트 시도...')
  }

  // 2차: download 이벤트 방식
  try {
    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 15_000 }),
      downloadBtn.click(),
    ])
    const tmpPath = await download.path()
    if (tmpPath) {
      const buffer = await fsp.readFile(tmpPath)
      console.log(`  [Gemini] 파일 다운로드 완료 (${Math.round(buffer.length / 1024)}KB)`)
      return buffer
    }
  } catch {
    console.log('  [Gemini] download 이벤트 없음 → Shadow DOM 이미지 직접 추출...')
  }

  // 2차 폴백: Shadow DOM 탐색 + blob 즉시 base64 변환 (단일 evaluate)
  // ⚠️ page.evaluate(fn) 금지 — tsx/esbuild __name 주입 문제.
  //    문자열로 전달 + 찾기/변환을 한 번에 처리 (blob URL은 2단계 접근 시 revoke 가능).
  const result: { base64: string; src: string } | null = await page.evaluate(`
    (function() {
      var before = ${beforeJson};
      var foundSrc = null;
      function walk(root) {
        if (!root || foundSrc) return;
        try {
          var imgs = root.querySelectorAll('img[src]');
          for (var i = 0; i < imgs.length; i++) {
            var s = imgs[i].src;
            if (s && before.indexOf(s) === -1) { foundSrc = s; return; }
          }
          var all = root.querySelectorAll('*');
          for (var j = 0; j < all.length; j++) {
            if (all[j].shadowRoot) walk(all[j].shadowRoot);
          }
        } catch(e) {}
      }
      walk(document);
      if (!foundSrc) return null;

      if (foundSrc.startsWith('blob:') || foundSrc.startsWith('http')) {
        return fetch(foundSrc)
          .then(function(r) { return r.blob(); })
          .then(function(b) {
            return new Promise(function(resolve, reject) {
              var reader = new FileReader();
              reader.onload = function() {
                var b64 = reader.result.split(',')[1];
                resolve({ base64: b64, src: foundSrc });
              };
              reader.onerror = reject;
              reader.readAsDataURL(b);
            });
          });
      }
      if (foundSrc.startsWith('data:')) {
        return { base64: foundSrc.split(',')[1], src: foundSrc };
      }
      return null;
    })()
  `)

  if (!result) {
    throw new Error('생성된 이미지를 Shadow DOM에서 찾을 수 없음')
  }

  console.log(`  [Gemini] Shadow DOM에서 이미지 발견: ${result.src.slice(0, 70)}...`)
  const buffer = Buffer.from(result.base64, 'base64')
  console.log(`  [Gemini] 이미지 추출 완료 (${Math.round(buffer.length / 1024)}KB)`)
  return buffer
}

// ─── 입력창 찾기 ──────────────────────────────────────────────────────────────

async function findInputElement(page: Page): Promise<Locator> {
  const inputSelectors = [
    'div[contenteditable="true"][role="textbox"]',
    'div[contenteditable="true"]',
    'textarea[placeholder]',
    'div[role="textbox"]',
    'rich-textarea div[contenteditable]',
  ]

  for (const sel of inputSelectors) {
    const el = page.locator(sel).first()
    const visible = await el.isVisible({ timeout: 3_000 }).catch(() => false)
    if (visible) return el
  }

  throw new Error('Gemini 입력창을 찾을 수 없음 — 페이지 구조 변경 가능성')
}

// ─── 이미지 만들기 모드 활성화 ────────────────────────────────────────────────

async function enableImageMode(page: Page): Promise<void> {
  // "이미지 만들기" 버튼이 있으면 클릭, 없으면 스킵
  const toggleSelectors = [
    'button[aria-label*="이미지 만들기"]',
    'button:has-text("이미지 만들기")',
    '[data-tool-id="image_generation"]',
  ]

  for (const sel of toggleSelectors) {
    const btn = page.locator(sel).first()
    const visible = await btn.isVisible({ timeout: 2_000 }).catch(() => false)
    if (visible) {
      await btn.click()
      await delay(800, 1200)
      console.log('  [Gemini] 이미지 만들기 모드 활성화')
      return
    }
  }

  console.log('  [Gemini] 이미지 만들기 버튼 없음 (이미 활성화 또는 UI 변경)')
}

// ─── CAPTCHA / 로그인 감지 ────────────────────────────────────────────────────

async function checkForBlocking(page: Page): Promise<void> {
  const url = page.url()
  if (url.includes('accounts.google.com') || url.includes('/signin')) {
    throw new Error(
      '구글 로그인 페이지로 리다이렉트됨. Chrome에서 gemini.google.com에 직접 접속해 로그인 후 다시 실행하세요.'
    )
  }

  const captcha = await page.locator('[id*="captcha"], .captcha, #recaptcha').first().isVisible({ timeout: 1_000 }).catch(() => false)
  if (captcha) {
    console.warn('\n[Gemini Scraper] CAPTCHA 감지! 브라우저 창에서 직접 해결 후 Enter를 누르세요...')
    await new Promise<void>((resolve) => {
      process.stdin.once('data', () => resolve())
    })
  }
}

// ─── 메인: 이미지 생성 ────────────────────────────────────────────────────────

/**
 * Gemini로 이미지 1장 생성
 * GeneratedImage[] 반환 — 기존 generate-image.ts 인터페이스와 호환
 */
export async function generateWithGemini(
  prompt: string,
  aspectRatio: '1:1' | '3:4' | '4:3' | '9:16' | '16:9' = '16:9'
): Promise<GeneratedImage[]> {
  const sizeSuffix = SIZE_SUFFIX[aspectRatio] ?? SIZE_SUFFIX['16:9']
  const fullPrompt = `${prompt}, ${sizeSuffix}`

  console.log(`\n[Gemini Scraper] 생성 시작: ${aspectRatio}`)
  console.log(`  프롬프트 (${fullPrompt.length}자): ${fullPrompt.slice(0, 80)}...`)

  const context = await getGeminiBrowserContext()
  const page = await context.newPage()

  try {
    // 1. Gemini 접속
    await page.goto(GEMINI_URL, { waitUntil: 'domcontentloaded', timeout: 30_000 })
    await delay(2_000, 3_000)
    await checkForBlocking(page)

    // 2. 이미지 만들기 모드 활성화
    await enableImageMode(page)

    // 3. 입력창 찾기 + 클리어
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

    // 4.5 제출 전 기존 img src 스냅샷 (생성된 이미지와 기존 이미지 구분용)
    const beforeSrcs: string[] = await page.evaluate(`
      (function() {
        var found = [];
        function walk(root) {
          if (!root) return;
          try {
            var imgs = root.querySelectorAll('img[src]');
            for (var i = 0; i < imgs.length; i++) { found.push(imgs[i].src); }
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

    // 5. Enter 제출
    await page.keyboard.press('Enter')
    console.log('  [Gemini] 생성 요청 전송...')

    // 6. 다운로드 버튼 대기 + 클릭으로 이미지 획득 (shadow DOM 완전 우회)
    const buffer = await downloadGeneratedImage(page, beforeSrcs)
    console.log(`  [Gemini] 이미지 추출 완료 (${Math.round(buffer.length / 1024)}KB)`)

    return [
      {
        buffer,
        prompt: fullPrompt,
        revisedPrompt: undefined, // Gemini는 프롬프트 수정 없음
        model: 'gemini-imagen',
        aspectRatio,
      },
    ]
  } finally {
    await page.close()
    // 소재 간 대기 (15~30초) — rate limit + 봇 감지 회피 핵심
    console.log('  [Gemini] 다음 생성 전 대기 중 (15~30초)...')
    await delay(15_000, 30_000)
  }
}
