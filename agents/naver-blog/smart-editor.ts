/**
 * 네이버 SmartEditor ONE 자동화 (Phase 1 MVP)
 * Playwright로 블로그 글쓰기 페이지를 제어해 글 발행
 *
 * Phase 1 범위: 제목 + 본문 plain text + 이미지 업로드 + 태그 + 발행
 * Phase 2 (이후): Bold 처리, 인용구 블록, 배너 이미지 링크
 *
 * 구조:
 *   - 글쓰기 페이지는 PostWriteForm.naver iframe 안에 렌더링됨
 *   - 모든 에디터 조작은 editorFrame(Frame) 에서 수행
 *   - 파일 선택 이벤트는 page 레벨에서 캡처
 *   - 발행 2단계: [data-click-area="tpb.publish"] 클릭 → 패널 오픈 → 태그 입력 → 재클릭
 *
 * // LOCAL ONLY — headless:false 필요. GitHub Actions 실행 불가.
 */

import { mkdirSync, writeFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { chromium, type BrowserContext, type Page, type Frame } from 'playwright'
import {
  BLOG_STORAGE_STATE_PATH,
  SELECTORS,
  BROWSER_ARGS,
  USER_AGENT,
  TIMING,
  NAVER_BLOG_WRITE_URL,
  DRY_RUN_SCREENSHOTS_DIR,
  sleep,
  randomDelay,
  kstNow,
} from './config.js'
import type { BlogContent } from './content-transformer.js'
import type { LocalImageSet } from './image-handler.js'

void dirname(fileURLToPath(import.meta.url)) // path ref kept for future use

// ── 에러 타입 ──

export type EditorErrorType =
  | 'SESSION_EXPIRED'       // 로그인 만료 → BLOG_HALTED 트리거
  | 'SELECTOR_NOT_FOUND'    // SmartEditor 셀렉터 변경 → CRITICAL 알림
  | 'IMAGE_UPLOAD_FAILED'   // 이미지 업로드 실패 → 텍스트만 발행으로 계속
  | 'PUBLISH_FAILED'        // 발행 버튼 실패 → retry
  | 'VERIFICATION_FAILED'   // 발행 후 URL 확인 실패 → 경고, 수동 확인 요청

export class EditorError extends Error {
  constructor(
    public readonly type: EditorErrorType,
    message: string,
  ) {
    super(message)
    this.name = 'EditorError'
  }
}

// ── 발행 결과 ──

export interface PublishResult {
  naverBlogUrl: string
  titleVerified: boolean
  imageCount: number
  dryRun: boolean
}

// ── 브라우저 생성 ──

async function launchBlogBrowser(): Promise<{ context: BrowserContext; page: Page }> {
  const browser = await chromium.launch({
    headless: false,   // Naver 봇 탐지 회피 — headless 차단
    args: BROWSER_ARGS,
  })

  const context = await browser.newContext({
    storageState: BLOG_STORAGE_STATE_PATH,
    userAgent: USER_AGENT,
    viewport: { width: 1280, height: 900 },
  })

  // navigator.webdriver 은폐 — SmartEditor가 자동화 감지 시 편집 모드 진입 차단함
  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined })
    // chrome 런타임 위장 (Naver fingerprinting 우회)
    ;(window as Record<string, unknown>)['chrome'] = {
      runtime: {},
      loadTimes: () => ({}),
      csi: () => ({}),
      app: {},
    }
  })

  const page = await context.newPage()
  return { context, page }
}

// ── 로그인 확인 ──
// 글쓰기 URL 진입 시 nid.naver.com 리다이렉트 여부로 판단

async function verifyLogin(page: Page): Promise<void> {
  await page.goto(NAVER_BLOG_WRITE_URL, {
    waitUntil: 'domcontentloaded',
    timeout: 25_000,
  })
  await sleep(randomDelay(2000))

  const currentUrl = page.url()
  if (currentUrl.includes('nid.naver.com') || currentUrl.includes('nidlogin')) {
    throw new EditorError('SESSION_EXPIRED', `로그인 페이지로 리다이렉트됨 — NID_SES 만료 의심 (${currentUrl})`)
  }
  console.log(`[SmartEditor] 로그인 확인 ✅ (${currentUrl.slice(0, 60)})`)
}

// ── 에디터 iframe 획득 ──
// 글쓰기 페이지는 PostWriteForm.naver iframe 안에 렌더링됨

async function getEditorFrame(page: Page): Promise<Frame> {
  const timeout = 15_000
  const start = Date.now()
  while (Date.now() - start < timeout) {
    const frame = page.frames().find(f => f.url().includes('PostWriteForm.naver'))
    if (frame) return frame
    await sleep(500)
  }
  throw new EditorError('SELECTOR_NOT_FOUND', 'PostWriteForm 에디터 iframe 15초 대기 후 미발견 — 로그인 상태 또는 URL 확인')
}

// ── 도움말 패널 제거 ──
// 글쓰기 진입 시 자동 노출되는 도움말이 클릭을 막으므로 JS로 숨김 처리

async function dismissHelpDialog(frame: Frame): Promise<void> {
  const removed = await frame.evaluate(() => {
    // 확인된 도움말 오버레이 클래스 (container__HW_tc — CSS 모듈 hash)
    const overlay = document.querySelector('[class*="container__HW"]') as HTMLElement | null
    if (overlay) { overlay.style.display = 'none'; return true }
    // fallback: se-help-title h1의 부모 컨테이너
    const h1 = document.querySelector('h1.se-help-title')
    const parent = h1?.closest('div') as HTMLElement | null
    if (parent) { parent.style.display = 'none'; return true }
    return false
  }).catch(() => false)

  if (removed) console.log('[SmartEditor] 도움말 패널 제거')
  await sleep(300)
}

// SmartEditor ONE 클릭 구조 (DevTools 검증):
//   .se-title-text (mainFrame) 클릭
//   → SmartEditor가 iframe#input_buffer (about:blank, position:fixed, h:1px, z-index:-9999) 포커스
//   → page.keyboard.type() → input_buffer 수신 → 에디터 렌더링
//
// 좌표 계산 전략:
//   1. outer page에서 mainFrame iframe 위치 획득 (멀티 셀렉터)
//   2. frame 내 .se-title-text 위치: getBoundingClientRect 폴링 → offsetTop 체인 폴백
//   3. 클릭 후 activeElement == input_buffer 확인 → 미확인 시 재시도

async function getMainFramePos(page: Page): Promise<{ x: number; y: number; found: string }> {
  return page.evaluate(() => {
    const candidates = [
      document.querySelector('#mainFrame'),
      document.querySelector('iframe[name="mainFrame"]'),
      document.querySelector('iframe[src*="PostWriteForm"]'),
      document.querySelector('iframe[src*="blog.naver"]'),
    ]
    const iframe = candidates.find(Boolean) as HTMLIFrameElement | null
    if (!iframe) return { x: 0, y: 0, found: 'none' }
    const r = iframe.getBoundingClientRect()
    return { x: r.left, y: r.top, found: iframe.name || iframe.id || iframe.src.slice(0, 60) }
  }).catch(() => ({ x: 0, y: 0, found: 'error' }))
}

async function isInputBufferFocused(frame: Frame): Promise<boolean> {
  return frame.evaluate(() => {
    const ae = document.activeElement as HTMLElement | null
    // input_buffer ID는 동적 suffix 포함 (input_buffer1778634609408 등)
    return ae?.id?.startsWith('input_buffer') === true || ae?.tagName === 'IFRAME'
  }).catch(() => false)
}

async function clickTitleAndVerify(page: Page, frame: Frame): Promise<boolean> {
  // Phase 1: frame.click() — Playwright가 프레임 레벨에서 직접 클릭
  // force:true = getBoundingClientRect가 0×0이어도 강제 클릭
  // page.mouse.click()과 달리 frame 내부 좌표계로 이벤트 전달 보장
  try {
    await frame.click('.se-title-text', { force: true, timeout: 5_000 })
    await sleep(700)
    const focused = await isInputBufferFocused(frame)
    console.log(`[SmartEditor] Phase1 frame.click('.se-title-text') → input_buffer 포커스: ${focused}`)
    if (focused) return true
  } catch (e) {
    console.warn('[SmartEditor] Phase1 frame.click 실패:', (e as Error).message?.slice(0, 80))
  }

  // Phase 2: frame.locator 클릭 (다른 셀렉터 시도)
  const altSelectors = [
    '[contenteditable="true"]',
    '[class*="title"]',
    '.se-documentTitle',
  ]
  for (const sel of altSelectors) {
    try {
      const count = await frame.locator(sel).count()
      if (count === 0) continue
      await frame.locator(sel).first().click({ force: true, timeout: 3_000 })
      await sleep(600)
      const focused = await isInputBufferFocused(frame)
      console.log(`[SmartEditor] Phase2 frame.click('${sel}') → focused: ${focused}`)
      if (focused) return true
    } catch { /* try next */ }
  }

  // Phase 3: page.mouse.click Y-sweep (outer page 좌표)
  const iframePos = await getMainFramePos(page)
  // input_buffer가 265px에 있다는 DevTools 확인값 포함
  const sweepYs = [265, 50, 70, 90, 110, 130, 150, 180, 220, 280, 350]
  for (const y of sweepYs) {
    await page.mouse.click(iframePos.x + 640, iframePos.y + y)
    await sleep(400)
    const ae = await frame.evaluate(() => {
      const el = document.activeElement as HTMLElement | null
      return { tag: el?.tagName ?? '', id: el?.id ?? '' }
    }).catch(() => ({ tag: '', id: '' }))
    console.log(`[SmartEditor] Phase3 sweep y=${y} → activeElement: ${ae.tag}#${ae.id.slice(0, 20)}`)
    if (ae.id?.startsWith('input_buffer') || ae.tag === 'IFRAME') {
      console.log(`[SmartEditor] ✅ 포커스 성공 y=${y}`)
      return true
    }
  }

  // Phase 4: input_buffer 자식 프레임 직접 focus (JS)
  const childFrames = frame.childFrames()
  const inputBuf = childFrames.find(f => f.url() === 'about:blank')
  if (inputBuf) {
    console.warn('[SmartEditor] Phase4: input_buffer frame.evaluate focus 시도')
    await inputBuf.evaluate(() => { window.focus(); document.body.focus() }).catch(() => {})
    await sleep(400)
    if (await isInputBufferFocused(frame)) return true
  }

  return false
}

// ── 제목 입력 ──
async function fillTitle(page: Page, frame: Frame, title: string): Promise<void> {
  await frame.waitForSelector('.se-title-text', { timeout: 25_000, state: 'attached' })
    .catch(() => { throw new EditorError('SELECTOR_NOT_FOUND', '.se-title-text 25초 대기 타임아웃 — SmartEditor 초기화 실패') })
  await sleep(1000)

  // 1차 시도: 계산된 좌표로 클릭
  let focused = await clickTitleAndVerify(page, frame)

  // 2차 시도: 포커스 실패 시 JS 이벤트 디스패치 (mousedown+click)
  if (!focused) {
    console.warn('[SmartEditor] input_buffer 미포커스 — JS 이벤트 디스패치 시도')
    await frame.evaluate(() => {
      const el = document.querySelector('.se-title-text') as HTMLElement | null
      if (!el) return
      ;['mouseenter', 'mouseover', 'mousedown', 'mouseup', 'click'].forEach(type => {
        el.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, view: window }))
      })
    })
    await sleep(600)
    focused = await frame.evaluate(() => {
      const ae = document.activeElement as HTMLElement | null
      return ae?.id === 'input_buffer' || ae?.tagName === 'IFRAME'
    }).catch(() => false)
    console.log(`[SmartEditor] JS 디스패치 후 focus: ${focused}`)
  }

  // 3차 시도: 하드코딩 좌표 (에디터 상단 120px 중앙)
  if (!focused) {
    console.warn('[SmartEditor] JS 디스패치 실패 — 하드코딩 좌표 시도 (640, 120)')
    await page.mouse.click(640, 120)
    await sleep(600)
  }

  await page.keyboard.press('Control+A')
  await page.keyboard.press('Delete')
  await sleep(200)
  await page.keyboard.type(title, { delay: TIMING.typingDelay })

  const insertedText = await frame.evaluate(() =>
    (document.querySelector('.se-title-text')?.textContent ?? '').trim().slice(0, 50),
  ).catch(() => '')
  console.log(`[SmartEditor] 입력 확인: "${insertedText}"`)
  console.log(`[SmartEditor] 제목 입력 완료: "${title}"`)
}

// ── 본문 섹션 입력 ──
// 제목 입력 후 Enter로 body 블록으로 이동, page.keyboard.type()으로 입력

async function fillContent(page: Page, content: BlogContent): Promise<void> {
  // 제목에서 본문으로 이동 (SmartEditor: Enter = 새 블록 생성)
  await page.keyboard.press('Enter')
  await sleep(randomDelay(800))

  for (const section of content.sections) {
    if (section.heading) {
      await page.keyboard.type(section.heading, { delay: TIMING.typingDelay })
      await page.keyboard.press('Enter')
      await sleep(randomDelay(400))
    }
    await page.keyboard.type(section.body, { delay: TIMING.typingDelay })
    await page.keyboard.press('Enter')
    await page.keyboard.press('Enter')
    await sleep(randomDelay(600))
  }

  console.log(`[SmartEditor] 본문 입력 완료 — ${content.sections.length}섹션`)
}

// ── 이미지 업로드 ──
// 파일 선택 이벤트는 page 레벨에서 캡처, 사진 버튼 클릭은 frame 레벨

async function uploadImage(page: Page, frame: Frame, imagePath: string, label: string): Promise<boolean> {
  try {
    // 1단계: 사진 버튼 JS click (플로팅 버튼 — visibility 체크 우회)
    const photoClicked = await frame.evaluate((sel: string) => {
      const btn = document.querySelector(sel) as HTMLElement | null
      if (!btn) return false
      btn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
      return true
    }, SELECTORS.PHOTO_BUTTON)

    if (!photoClicked) {
      console.warn(`[SmartEditor] 사진 버튼 미발견 — ${label} 건너뜀`)
      return false
    }
    await sleep(randomDelay(1000))

    // 2단계: "내 PC에서" 버튼 — filechooser 트리거 필요, Playwright click 사용
    const uploadLocator = frame.locator(SELECTORS.UPLOAD_FROM_PC)
    const uploadExists = await uploadLocator.count().catch(() => 0)
    if (!uploadExists) {
      console.warn(`[SmartEditor] 내 PC 업로드 버튼 미발견 — ${label} 건너뜀 (드롭다운 미오픈 가능성)`)
      return false
    }

    const [chooser] = await Promise.all([
      page.waitForEvent('filechooser', { timeout: 10_000 }),
      uploadLocator.click({ force: true }),
    ])

    await chooser.setFiles(imagePath)
    console.log(`[SmartEditor] ${label} 파일 선택: ${imagePath}`)

    await frame.waitForSelector(SELECTORS.UPLOADED_IMAGE, {
      timeout: TIMING.imageUploadTimeout,
    })
    await sleep(randomDelay(TIMING.actionDelay))

    console.log(`[SmartEditor] ${label} 업로드 완료 ✅`)
    return true
  } catch (err) {
    console.warn(`[SmartEditor] ${label} 업로드 실패:`, err)
    return false
  }
}

// ── 해시태그 입력 ──
// 발행 패널 오픈 후 #tag-input에 입력

async function fillHashtags(page: Page, frame: Frame, hashtags: string[]): Promise<void> {
  const tagEl = await frame.waitForSelector(SELECTORS.TAG_INPUT, { timeout: 10_000 }).catch(() => null)
  if (!tagEl) {
    console.warn('[SmartEditor] 태그 입력창 미발견 — 태그 건너뜀')
    return
  }

  await tagEl.click()
  await sleep(randomDelay(500))

  for (const tag of hashtags.slice(0, 10)) {
    const tagText = tag.startsWith('#') ? tag.slice(1) : tag
    await page.keyboard.type(tagText, { delay: TIMING.typingDelay })
    await page.keyboard.press('Enter')
    await sleep(randomDelay(300))
  }

  console.log(`[SmartEditor] 태그 입력 완료 — ${hashtags.length}개`)
}

// ── 발행 버튼 클릭 (JS evaluate — 오버레이 우회) ──

async function clickPublishButton(frame: Frame): Promise<boolean> {
  return frame.evaluate(() => {
    const btn = document.querySelector('[data-click-area="tpb.publish"]') as HTMLButtonElement | null
    if (btn) { btn.click(); return true }
    return false
  }).catch(() => false)
}

// ── 발행 후 URL 검증 ──

async function verifyPublishedPost(
  context: BrowserContext,
  url: string,
  expectedTitle: string,
): Promise<{ titleVerified: boolean; imageCount: number }> {
  const verifyPage = await context.newPage()
  try {
    await verifyPage.goto(url, { waitUntil: 'domcontentloaded', timeout: 20_000 })
    await sleep(2000)

    const titleEl = await verifyPage.$('.se-title-text, h3.se_textarea')
    const actualTitle = await titleEl?.textContent() ?? ''
    const titleVerified = actualTitle.includes(expectedTitle.slice(0, 10))

    const imageCount = await verifyPage.$$eval(
      '.se-image-resource, img.se_mediaImage',
      els => els.length,
    )

    return { titleVerified, imageCount }
  } catch {
    return { titleVerified: false, imageCount: 0 }
  } finally {
    await verifyPage.close().catch(() => { /* ignore */ })
  }
}

// ── 메인 발행 함수 ──

export async function publishToBlog(
  content: BlogContent,
  imageSet: LocalImageSet,
  dryRun = false,
): Promise<PublishResult> {
  const { context, page } = await launchBlogBrowser()

  try {
    // 1. 로그인 확인 + 글쓰기 페이지 진입
    await verifyLogin(page)
    // 창 포그라운드 보장 — document.hidden=true면 SmartEditor requestAnimationFrame 미실행
    await page.bringToFront()
    await sleep(randomDelay(TIMING.pageStabilize))

    // 2. 에디터 iframe 획득 + 로드 대기
    const editorFrame = await getEditorFrame(page)
    console.log('[SmartEditor] 에디터 iframe 획득 ✅')
    // SmartEditor JS 초기화 대기 — networkidle로 CSS/JS 번들 완전 로드 확인
    await editorFrame.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {})
    await sleep(randomDelay(3000))

    // 3. 도움말 패널 제거
    await dismissHelpDialog(editorFrame)
    await sleep(randomDelay(1500))

    // 3.5 프레임 재획득 + networkidle 재확인
    const liveFrame = await getEditorFrame(page)
    await liveFrame.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {})

    // contenteditable 렌더링 대기
    await liveFrame.waitForSelector('[contenteditable="true"]', { timeout: 20_000, state: 'attached' })
      .catch(() => console.warn('[SmartEditor] contenteditable 대기 타임아웃 — 계속 진행'))
    await sleep(randomDelay(1000))

    // DOM 진단
    const ceElements = await liveFrame.evaluate(() => {
      return Array.from(document.querySelectorAll('[contenteditable]')).map(el => ({
        tag: el.tagName,
        ce: el.getAttribute('contenteditable'),
        classes: el.className.toString().slice(0, 80),
        id: (el as HTMLElement).id?.slice(0, 40) || '-',
      }))
    }).catch(() => [])
    console.log(`[SmartEditor] contenteditable 요소 ${ceElements.length}개:`,
      ceElements.map(e => `${e.tag}[ce="${e.ce}"] .${e.classes.split(' ').slice(0, 3).join('.')}`).join(' | '))

    // SmartEditor 렌더링 진단
    const renderDiag = await liveFrame.evaluate(() => {
      const seEls = document.querySelectorAll('[class*="se-"]')
      const titleEl = document.querySelector('.se-title-text') as HTMLElement | null
      const titleRect = titleEl ? titleEl.getBoundingClientRect() : null
      // document.hidden 확인 — true이면 SmartEditor rAF 미실행
      const docHidden = document.hidden
      const visState = document.visibilityState
      // editing area에 실제 렌더된 요소 확인 (y>50 이후)
      const editingEls = Array.from(document.querySelectorAll('*'))
        .filter(el => {
          const r = el.getBoundingClientRect()
          return r.width > 50 && r.height > 20 && r.top > 50
        })
        .slice(0, 5)
        .map(el => `${el.tagName}.${(el as HTMLElement).className.toString().slice(0, 30)}@(${Math.round(el.getBoundingClientRect().top)})`)
      // elementsFromPoint — 에디터 영역에 무엇이 있나
      const at640_120 = document.elementsFromPoint(640, 120)
        .slice(0, 3)
        .map(el => `${el.tagName}.${(el as HTMLElement).className.toString().split(' ')[0] || '-'}`)
      const webdriver = (navigator as Record<string, unknown>)['webdriver']
      const innerW = window.innerWidth
      const innerH = window.innerHeight
      return { seElCount: seEls.length, docHidden, visState, titleH: titleRect?.height ?? -1, editingEls, at640_120, webdriver, innerW, innerH }
    }).catch(() => null)
    console.log(`[SmartEditor] 렌더링 진단:`, JSON.stringify(renderDiag))

    // outer page의 mainFrame iframe 스타일 진단
    const iframeStyle = await page.evaluate(() => {
      const iframe = document.querySelector('iframe[name="mainFrame"], #mainFrame') as HTMLIFrameElement | null
      if (!iframe) return null
      const s = window.getComputedStyle(iframe)
      const r = iframe.getBoundingClientRect()
      return {
        display: s.display, visibility: s.visibility, opacity: s.opacity,
        width: s.width, height: s.height, position: s.position,
        top: s.top, left: s.left, zIndex: s.zIndex,
        rectW: Math.round(r.width), rectH: Math.round(r.height),
        rectTop: Math.round(r.top), rectLeft: Math.round(r.left),
      }
    }).catch(() => null)
    console.log(`[SmartEditor] mainFrame iframe 스타일:`, JSON.stringify(iframeStyle))

    // 진단 스크린샷 (클릭 전 — 에디터 렌더링 상태 확인용)
    if (dryRun) {
      mkdirSync(DRY_RUN_SCREENSHOTS_DIR, { recursive: true })
      const diagTs = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
      await page.screenshot({ path: resolve(DRY_RUN_SCREENSHOTS_DIR, `${diagTs}-before-click.png`), fullPage: false })
      // mainFrame iframe 직접 스크린샷 (cross-origin 여부 확인용)
      try {
        await page.locator('iframe[name="mainFrame"]').screenshot({
          path: resolve(DRY_RUN_SCREENSHOTS_DIR, `${diagTs}-mainframe.png`),
        })
        console.log(`[SmartEditor] [DRY_RUN] mainFrame 직접 스크린샷 저장`)
      } catch (e) {
        console.warn(`[SmartEditor] mainFrame 스크린샷 실패:`, (e as Error).message?.slice(0, 80))
      }
      console.log(`[SmartEditor] [DRY_RUN] 진단 스크린샷 저장 (클릭 전)`)
    }

    // 4. 제목 입력
    await fillTitle(page, liveFrame, content.blogTitle)
    await sleep(randomDelay(TIMING.actionDelay))

    // 5. 본문 입력
    await fillContent(page, content)
    await sleep(randomDelay(TIMING.actionDelay))

    // 6. 대표 이미지 업로드 (실패해도 계속)
    let heroUploaded = false
    if (imageSet.heroPath) {
      heroUploaded = await uploadImage(page, liveFrame, imageSet.heroPath, '대표 이미지')
      if (!heroUploaded) {
        console.warn('[SmartEditor] 대표 이미지 업로드 실패 — 텍스트만 발행')
      }
    }

    // 7. 본문 이미지 업로드 (최대 2개, 실패 무시)
    for (let i = 0; i < imageSet.bodyPaths.length; i++) {
      await uploadImage(page, liveFrame, imageSet.bodyPaths[i], `본문 이미지 ${i + 1}`)
      await sleep(randomDelay(1500))
    }

    // ── DRY_RUN: 스크린샷 저장 후 종료 ──
    if (dryRun) {
      mkdirSync(DRY_RUN_SCREENSHOTS_DIR, { recursive: true })
      const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
      const screenshotPath = resolve(DRY_RUN_SCREENSHOTS_DIR, `${ts}.png`)
      await page.screenshot({ path: screenshotPath, fullPage: false })
      console.log(`[SmartEditor] [DRY_RUN] 스크린샷 저장: ${screenshotPath}`)
      writeFileSync(
        resolve(DRY_RUN_SCREENSHOTS_DIR, `${ts}-content.json`),
        JSON.stringify({ title: content.blogTitle, sections: content.sections.length, hashtags: content.hashtags }, null, 2),
      )
      return {
        naverBlogUrl: 'DRY_RUN',
        titleVerified: true,
        imageCount: heroUploaded ? 1 : 0,
        dryRun: true,
      }
    }

    // 8. 발행 1단계: 버튼 클릭 → 패널 오픈
    const opened = await clickPublishButton(liveFrame)
    if (!opened) {
      throw new EditorError('SELECTOR_NOT_FOUND', `발행 버튼 미발견: ${SELECTORS.PUBLISH_BUTTON}`)
    }
    console.log('[SmartEditor] 발행 패널 오픈')
    await sleep(randomDelay(2000))

    // 9. 태그 입력 (패널 내 #tag-input)
    await fillHashtags(page, liveFrame, content.hashtags)
    await sleep(randomDelay(TIMING.actionDelay))

    // 10. 발행 2단계: 동일 버튼 재클릭 → 최종 발행
    const confirmed = await clickPublishButton(liveFrame)
    if (!confirmed) {
      throw new EditorError('PUBLISH_FAILED', '발행 확인 버튼 미발견 — 패널이 닫혔거나 셀렉터 변경')
    }
    console.log('[SmartEditor] 발행 확인 클릭')

    // 11. 발행 완료 대기 (페이지 URL 변경)
    try {
      await page.waitForNavigation({ timeout: TIMING.publishTimeout })
    } catch {
      console.warn('[SmartEditor] waitForNavigation 타임아웃 — 현재 URL 확인')
    }

    await sleep(randomDelay(3000))
    const naverBlogUrl = page.url()

    if (naverBlogUrl.includes('PostWriteForm') || naverBlogUrl.includes('Redirect=Write')) {
      throw new EditorError('PUBLISH_FAILED', `발행 실패 — 여전히 글쓰기 페이지: ${naverBlogUrl}`)
    }

    console.log(`[SmartEditor] ✅ 발행 완료: ${naverBlogUrl}`)

    // 12. 발행 후 검증
    const { titleVerified, imageCount } = await verifyPublishedPost(context, naverBlogUrl, content.blogTitle)
    if (!titleVerified) {
      console.warn(`[SmartEditor] ⚠️ 발행 검증: 제목 불일치 — ${naverBlogUrl}`)
    }
    console.log(`[SmartEditor] 검증 — 제목: ${titleVerified ? '✅' : '❌'}, 이미지: ${imageCount}개`)

    return { naverBlogUrl, titleVerified, imageCount, dryRun: false }
  } finally {
    await Promise.race([
      context.close(),
      sleep(10_000),
    ]).catch(() => { /* ignore */ })
    console.log(`[SmartEditor] 브라우저 종료 (${kstNow()})`)
  }
}
