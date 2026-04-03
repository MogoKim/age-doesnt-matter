// LOCAL ONLY — 네이버 IP 차단 + headless 봇 탐지로 GitHub Actions 실행 불가
// 실행: npx tsx agents/cmo/jisik-answerer.ts
// launchd 등록 권장 (매일 14:30 KST)
/**
 * CMO Jisik Answerer — 네이버 지식인 자동 답변 에이전트
 *
 * 흐름:
 * 1. Google Sheet "답변 관리" 탭에서 Ready 행 읽기 (최대 3개)
 * 2. Playwright로 지식인 질문 크롤링
 * 3. Claude Sonnet으로 50-60대 공감 답변 생성 (우나어 자연 언급)
 * 4. Playwright로 사람처럼 타이핑 후 제출
 * 5. Sheet에 결과 업데이트 (Answered/Error + 답변 URL)
 * 6. Slack #로그 알림
 *
 * 봇 탐지 우회 전략:
 * - navigator.webdriver 숨기기
 * - 랜덤 viewport
 * - 지식인 메인 → 이웃 글 탐색 → 목적 질문 (워밍업)
 * - 글자별 80~150ms 랜덤 딜레이 타이핑
 * - 3% 확률 오타 후 수정
 * - 답변 간 8~15분 랜덤 딜레이
 */

import { chromium, type BrowserContext, type Page } from 'playwright'
import Anthropic from '@anthropic-ai/sdk'
import { existsSync, readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { notifySlack } from '../core/notifier.js'
import {
  readReadyRows,
  updateStatus,
  updateAnswered,
  updateError,
  updateCategory,
  type JisikRow,
} from '../community/jisik-sheets-client.js'
import { disconnect } from '../core/db.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const STORAGE_STATE_PATH = resolve(__dirname, '../cafe/storage-state-jisik.json')
const MODEL_HEAVY = process.env.CLAUDE_MODEL_HEAVY ?? 'claude-sonnet-4-6'
const MAX_ANSWERS_PER_RUN = 3

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const randomBetween = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min

// ─── 카테고리별 페르소나 ───────────────────────────────────

interface Persona {
  gender: 'female' | 'male' | 'neutral'
  age: string
  tone: 'warm' | 'practical' | 'empathetic'
}

const PERSONA_MAP: Record<string, Persona> = {
  '건강':   { gender: 'female',  age: '55세', tone: 'warm' },
  '취업':   { gender: 'male',    age: '52세', tone: 'practical' },
  '재테크': { gender: 'male',    age: '57세', tone: 'practical' },
  '가족':   { gender: 'female',  age: '54세', tone: 'empathetic' },
  '생활':   { gender: 'female',  age: '56세', tone: 'warm' },
  '기타':   { gender: 'neutral', age: '55세', tone: 'warm' },
}

// ─── 카테고리 키워드 감지 ────────────────────────────────

function detectCategory(text: string): string {
  const t = text.toLowerCase()
  if (/건강|병원|약|질환|치료|통증|혈압|당뇨|암|수술|의사|진단/.test(t)) return '건강'
  if (/취업|일자리|구직|이력서|면접|알바|파트타임|직장|재취업|구인/.test(t)) return '취업'
  if (/투자|주식|부동산|연금|노후|적금|펀드|재테크|돈|절세|보험/.test(t)) return '재테크'
  if (/자녀|아이|부모|남편|아내|가족|부부|이혼|갈등|관계/.test(t)) return '가족'
  if (/요리|음식|여행|취미|생활|청소|집|이사|쇼핑/.test(t)) return '생활'
  return '기타'
}

// ─── 브라우저 설정 ────────────────────────────────────────

async function launchBrowser(): Promise<{ context: BrowserContext }> {
  if (!existsSync(STORAGE_STATE_PATH)) {
    throw new Error(
      '지식인 쿠키 없음!\n' +
      'Chrome 닫고 실행: npx tsx agents/cafe/export-cookies-jisik.ts\n' +
      '주의: 카페 크롤링 계정이 아닌 지식인 전용 네이버 계정으로 로그인된 Chrome에서 실행'
    )
  }

  const stateData = JSON.parse(readFileSync(STORAGE_STATE_PATH, 'utf-8'))
  const cookieNames = (stateData.cookies ?? []).map((c: { name: string }) => c.name)
  if (!cookieNames.includes('NID_AUT') || !cookieNames.includes('NID_SES')) {
    throw new Error('NID_AUT/NID_SES 쿠키 없음 — export-cookies-jisik.ts 재실행 필요')
  }

  // 쿠키 타입 정규화
  for (const cookie of stateData.cookies ?? []) {
    if (typeof cookie.secure !== 'boolean') cookie.secure = Boolean(cookie.secure)
    if (typeof cookie.httpOnly !== 'boolean') cookie.httpOnly = Boolean(cookie.httpOnly)
  }

  const browser = await chromium.launch({
    headless: false, // 네이버 headless 탐지 우회
    args: [
      '--disable-blink-features=AutomationControlled',
      '--no-first-run',
      '--disable-dev-shm-usage',
    ],
  })

  const context = await browser.newContext({
    storageState: stateData,
    viewport: {
      width: 1280 + randomBetween(0, 160),   // 1280~1440 랜덤
      height: 800 + randomBetween(0, 160),   // 800~960 랜덤
    },
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    locale: 'ko-KR',
    timezoneId: 'Asia/Seoul',
  })

  // navigator.webdriver 숨기기 — Playwright 자동화 신호 제거
  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined })
    Object.defineProperty(navigator, 'plugins', {
      get: () => [
        { name: 'Chrome PDF Plugin' },
        { name: 'Chrome PDF Viewer' },
        { name: 'Native Client' },
      ],
    })
  })

  return { context }
}

// ─── 세션 검증 ────────────────────────────────────────────

async function checkSession(page: Page): Promise<'OK' | 'EXPIRED'> {
  try {
    await page.goto('https://kin.naver.com', { waitUntil: 'domcontentloaded', timeout: 20000 })
    await sleep(randomBetween(2000, 4000))

    const loginBtn = await page.locator(
      'a[href*="nid.naver.com/nidlogin"], .btn_login, a.link_login'
    ).count()

    if (loginBtn > 0) return 'EXPIRED'
    return 'OK'
  } catch {
    return 'EXPIRED'
  }
}

// ─── 워밍업 브라우징 ──────────────────────────────────────

async function warmupBrowsing(page: Page): Promise<void> {
  // 지식인 메인에서 이웃 글 1~2개 훑어보는 척
  await sleep(randomBetween(3000, 6000))

  // 스크롤 시뮬레이션
  for (let i = 0; i < randomBetween(2, 4); i++) {
    await page.mouse.wheel(0, randomBetween(200, 500))
    await sleep(randomBetween(800, 1500))
  }

  // 이웃 글 1개 랜덤 클릭 (있으면)
  try {
    const links = await page.locator('a[href*="kin.naver.com/qna/detail"]').all()
    if (links.length > 0) {
      const randomLink = links[randomBetween(0, Math.min(links.length - 1, 4))]
      await randomLink.click()
      await sleep(randomBetween(5000, 10000)) // 글 읽는 척
      await page.goBack()
      await sleep(randomBetween(2000, 3000))
    }
  } catch {
    // 워밍업 실패해도 계속 진행
  }
}

// ─── 질문 크롤링 ──────────────────────────────────────────

interface QuestionData {
  title: string
  content: string
  summary: string
}

async function scrapeQuestion(page: Page, url: string): Promise<QuestionData> {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 25000 })

  // 질문 글자 수 비례 읽기 시간 (평균 300자/분 읽기 속도 기준)
  await sleep(randomBetween(15000, 35000))

  // 스크롤 (답변 영역까지 내려보는 척)
  for (let i = 0; i < randomBetween(2, 4); i++) {
    await page.mouse.wheel(0, randomBetween(300, 600))
    await sleep(randomBetween(1000, 2000))
  }

  // 제목 추출
  const titleSelectors = ['.question-title', '.c-heading--question', 'h3.title', '.question_area h3']
  let title = ''
  for (const sel of titleSelectors) {
    const el = page.locator(sel).first()
    if (await el.count() > 0) {
      title = (await el.textContent() ?? '').trim()
      if (title) break
    }
  }

  // 본문 추출
  const contentSelectors = [
    '.question-content .c-heading-content',
    '.question_area .c-content-body',
    '.question_detail',
    '.question-detail',
  ]
  let content = ''
  for (const sel of contentSelectors) {
    const el = page.locator(sel).first()
    if (await el.count() > 0) {
      content = (await el.textContent() ?? '').trim()
      if (content) break
    }
  }

  if (!title && !content) {
    throw new Error('QUESTION_NOT_FOUND: 질문 내용 추출 실패 — 셀렉터 변경 필요')
  }

  const fullText = `${title} ${content}`
  const summary = fullText.slice(0, 80).replace(/\s+/g, ' ').trim()

  return { title, content, summary }
}

// ─── Claude 답변 생성 ─────────────────────────────────────

async function generateAnswer(
  question: QuestionData,
  category: string,
): Promise<string> {
  const client = new Anthropic()
  const persona = PERSONA_MAP[category] ?? PERSONA_MAP['기타']

  const genderDesc =
    persona.gender === 'female' ? '주부 여성' :
    persona.gender === 'male' ? '남성' : '분'

  const toneDesc =
    persona.tone === 'warm' ? '따뜻하고 공감 어린' :
    persona.tone === 'practical' ? '경험 기반의 실용적인' :
    '감정적으로 위로해주는'

  const systemPrompt = `당신은 ${persona.age} ${genderDesc}입니다. 네이버 지식인에서 비슷한 처지의 분들 고민에 진심으로 답변을 달고 있어요.

답변 3단계 구조:
1단계 [공감 Hook — 2~3문장]: 질문자의 상황/감정에 먼저 완전히 공감. "저도 그런 경험~", "아, 그 마음 정말 알아요~" 식으로 시작. 절대 "안녕하세요"로 시작 금지.
2단계 [실질적 조언 — 3~5문장]: ${toneDesc} 내용. 경험 기반으로 쓴 것처럼 구체적으로 (숫자, 방법, 장소 등 포함).
3단계 [우나어 소환 — 마지막 1~2문장만]: 아래 표현 중 자연스럽게 선택해서 변형해 사용:
  - "저도 비슷한 고민 있었는데, '우리 나이가 어때서(age-doesnt-matter.com)' 커뮤니티에서 위로도 받고 정보도 많이 얻었어요. 거기도 이런 이야기 자주 올라오거든요 :)"
  - "제가 자주 가는 '우리 나이가 어때서(age-doesnt-matter.com)'에도 이런 주제 많더라고요. 관심 있으시면 한 번~"
  - "저처럼 고민하시는 분들이 '우리 나이가 어때서(age-doesnt-matter.com)' 커뮤니티에 많이 계세요. 들어오시면 공감 많이 받으실 거예요."

절대 금지:
- "시니어" / "어르신" / "중장년"
- "훌륭한 사이트", "최고의 커뮤니티" 등 홍보 문구
- 답변 첫 줄이나 중간에 사이트 언급
- 나이/연령대 명시 ("50대를 위한", "60대 전용" 등)
- 500자 초과

말투: 구어체, 친근하게 ("~어요", "~네요", "~더라고요")`

  const userMessage = `다음 지식인 질문에 답변해주세요.

제목: ${question.title}
내용: ${question.content}

위 3단계 구조로, 180~400자 답변을 작성해주세요. 답변만 출력하세요 (설명 없이).`

  const response = await client.messages.create({
    model: MODEL_HEAVY,
    max_tokens: 600,
    system: systemPrompt,
    messages: [{ role: 'user', content: userMessage }],
  })

  const block = response.content[0]
  if (block.type !== 'text') throw new Error('AI 답변 생성 실패')

  const answer = block.text.trim()
  if (answer.length < 50) throw new Error(`답변 너무 짧음: ${answer.length}자`)

  return answer
}

// ─── 사람처럼 타이핑 ──────────────────────────────────────

async function humanType(page: Page, selector: string, text: string): Promise<void> {
  const editor = page.locator(selector).first()
  if (await editor.count() === 0) throw new Error(`에디터 셀렉터 미발견: ${selector}`)

  await editor.click()
  await sleep(randomBetween(800, 1500)) // 포커스 후 잠시 대기

  for (const char of text) {
    // 3% 확률로 오타 후 수정
    if (Math.random() < 0.03 && /[가-힣]/.test(char)) {
      await page.keyboard.type('으', { delay: randomBetween(80, 150) })
      await sleep(randomBetween(300, 700))
      await page.keyboard.press('Backspace')
      await sleep(randomBetween(200, 400))
    }

    await page.keyboard.type(char, { delay: randomBetween(80, 150) })

    // 5% 확률로 생각하는 척 멈춤
    if (Math.random() < 0.05) {
      await sleep(randomBetween(500, 1500))
    }
  }

  // 타이핑 완료 후 검토하는 척 5~10초 대기
  await sleep(randomBetween(5000, 10000))
}

// ─── 지식인 답변 게시 ─────────────────────────────────────

async function postAnswer(page: Page, answer: string): Promise<string> {
  // 답변 에디터 셀렉터 — 폴백 순서로 시도
  const editorSelectors = [
    '.se-content[contenteditable="true"]',   // 스마트 에디터 3
    '[contenteditable="true"].se-content',
    '#editorTypeWrite [contenteditable="true"]',
    '.kin-editor [contenteditable="true"]',
    '[contenteditable="true"]',              // 최종 폴백
  ]

  let editorSel = ''
  for (const sel of editorSelectors) {
    const el = page.locator(sel).first()
    if (await el.count() > 0) {
      editorSel = sel
      break
    }
  }

  if (!editorSel) {
    // 답변 버튼 먼저 클릭해야 에디터가 열리는 경우
    const answerBtns = ['.c-button--answer', '.btn_answer_write', 'button:has-text("답변")']
    for (const btn of answerBtns) {
      const el = page.locator(btn).first()
      if (await el.count() > 0) {
        await el.click()
        await sleep(randomBetween(1500, 2500))
        break
      }
    }
    // 버튼 클릭 후 재시도
    for (const sel of editorSelectors) {
      const el = page.locator(sel).first()
      if (await el.count() > 0) {
        editorSel = sel
        break
      }
    }
  }

  if (!editorSel) throw new Error('EDITOR_NOT_FOUND: 답변창 셀렉터 미발견 — DOM 변경 가능성')

  // 사람처럼 타이핑
  await humanType(page, editorSel, answer)

  // 제출 버튼 찾기
  const submitSelectors = [
    'button.c-button--primary:has-text("답변 등록")',
    'button.c-button--primary:has-text("등록")',
    'button[type="submit"]:has-text("등록")',
    '.btn_register',
    '.c-button--answer-submit',
  ]

  let submitted = false
  for (const sel of submitSelectors) {
    const btn = page.locator(sel).first()
    if (await btn.count() > 0) {
      await btn.click()
      submitted = true
      break
    }
  }

  if (!submitted) throw new Error('SUBMIT_NOT_FOUND: 제출 버튼 미발견')

  // 제출 후 URL 추출
  await sleep(randomBetween(3000, 5000))
  await page.waitForNavigation({ waitUntil: 'networkidle', timeout: 15000 }).catch(() => {})

  return extractAnswerUrl(page, answer)
}

async function extractAnswerUrl(page: Page, answer: string): Promise<string> {
  const currentUrl = page.url()
  if (currentUrl.includes('kin.naver.com')) return currentUrl

  // 최근 내가 작성한 답변 링크 찾기
  try {
    const firstWords = answer.slice(0, 15).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const myAnswer = page.locator(`.answer_area:has-text("${firstWords}") a`).first()
    if (await myAnswer.count() > 0) {
      const href = await myAnswer.getAttribute('href')
      if (href) return href.startsWith('http') ? href : `https://kin.naver.com${href}`
    }
  } catch {
    // 폴백으로 현재 URL 반환
  }

  return currentUrl
}

// ─── 메인 실행 ────────────────────────────────────────────

async function main() {
  console.log('[JisikAnswerer] 지식인 자동 답변 시작')

  // Sheet에서 Ready 행 읽기
  const rows = await readReadyRows()
  if (rows.length === 0) {
    console.log('[JisikAnswerer] Ready 상태 질문 없음 — 종료')
    await disconnect()
    return
  }

  console.log(`[JisikAnswerer] Ready 행 ${rows.length}개 발견`)

  // Processing 표시 (중복 실행 방지)
  for (const row of rows) {
    await updateStatus(row.rowIndex, 'Processing')
  }

  // 브라우저 실행
  const { context } = await launchBrowser()
  const page = await context.newPage()

  // 세션 검증 + 워밍업
  const sessionStatus = await checkSession(page)
  if (sessionStatus === 'EXPIRED') {
    const msg = '세션 만료 — Chrome 닫고 npx tsx agents/cafe/export-cookies-jisik.ts 실행 필요'
    console.error(`[JisikAnswerer] ❌ ${msg}`)
    for (const row of rows) {
      await updateError(row.rowIndex, 'SESSION_EXPIRED')
    }
    await context.browser()?.close()
    await notifySlack({ level: 'important', agent: 'CMO', title: '지식인 세션 만료', body: msg })
    await disconnect()
    return
  }

  await warmupBrowsing(page)

  // 각 행 처리
  const results: { success: number; failed: number } = { success: 0, failed: 0 }

  for (const row of rows.slice(0, MAX_ANSWERS_PER_RUN)) {
    try {
      console.log(`[JisikAnswerer] 처리 중: ${row.url}`)

      // 1. 질문 크롤링
      const question = await scrapeQuestion(page, row.url)
      console.log(`[JisikAnswerer] 질문 요약: ${question.summary}`)

      // 2. 카테고리 감지 (시트에 없으면 자동 감지)
      const category = row.category || detectCategory(`${question.title} ${question.content}`)
      if (!row.category) {
        await updateCategory(row.rowIndex, category)
      }

      // 3. Claude 답변 생성
      const answer = await generateAnswer(question, category)
      console.log(`[JisikAnswerer] 답변 생성 완료 (${answer.length}자)`)

      // 4. 답변 게시
      const answerUrl = await postAnswer(page, answer)
      console.log(`[JisikAnswerer] ✅ 게시 완료: ${answerUrl}`)

      // 5. Sheet 업데이트
      await updateAnswered(row.rowIndex, question.summary, answer, answerUrl)
      results.success++

    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error(`[JisikAnswerer] ❌ 실패 (행 ${row.rowIndex}): ${msg}`)
      await updateError(row.rowIndex, msg)
      results.failed++
    }

    // 다음 행까지 8~15분 랜덤 대기 (마지막 행은 대기 없음)
    if (row !== rows[rows.length - 1]) {
      const waitMs = randomBetween(8 * 60000, 15 * 60000)
      console.log(`[JisikAnswerer] 다음 답변까지 ${Math.round(waitMs / 60000)}분 대기...`)
      await sleep(waitMs)
    }
  }

  await context.browser()?.close()

  // Slack 알림
  const summary = `지식인 답변 완료 — ✅ ${results.success}개 성공 / ❌ ${results.failed}개 실패`
  await notifySlack({
    level: results.failed > 0 ? 'important' : 'info',
    agent: 'CMO',
    title: '지식인 자동 답변',
    body: summary,
  })

  console.log(`[JisikAnswerer] ${summary}`)
  await disconnect()
  process.exit(results.failed > 0 ? 1 : 0)
}

main().catch(async (err) => {
  console.error('[JisikAnswerer] 치명적 오류:', err)
  await notifySlack({
    level: 'important',
    agent: 'CMO',
    title: '지식인 답변 오류',
    body: err instanceof Error ? err.message : String(err),
  })
  await disconnect()
  process.exit(1)
})
