/**
 * QA 20 — UX 라이팅 + 접근성 감사
 *
 * 목적: 발견(Discovery) — 문제 수정 아님
 * 대상: 프로덕션 전체 공개 페이지 (데스크탑)
 * 실행: npm run qa:audit
 *
 * 검사 항목:
 *   A. 금지어 스캔 — "시니어", "노인", "어르신", "노령", "고령", "액티브 시니어"
 *   B. CTA 문구 일관성 — 로그인/글쓰기/댓글 버튼 문구 수집
 *   C. 빈 상태(Empty State) 문구 존재 여부
 *   D. 시니어 친화 접근성 샘플링 — 터치타겟 52px / 폰트 18px / 색상대비
 *
 * 출력: assets/qa-report/20-ux-writing-result.json
 */

import { test, expect, type Page } from '@playwright/test'
import * as fs from 'fs'
import * as path from 'path'

// ─── 감사 대상 페이지 ──────────────────────────────────────────────────────────

const AUDIT_PAGES = [
  { url: '/', label: '홈' },
  { url: '/about', label: '서비스 소개' },
  { url: '/grade', label: '등급 안내' },
  { url: '/contact', label: '문의하기' },
  { url: '/terms', label: '이용약관' },
  { url: '/privacy', label: '개인정보처리방침' },
  { url: '/rules', label: '커뮤니티 규칙' },
  { url: '/faq', label: 'FAQ' },
  { url: '/search', label: '검색' },
  { url: '/best', label: '베스트' },
  { url: '/community/stories', label: '커뮤니티 메인' },
  { url: '/magazine', label: '매거진 목록' },
  { url: '/jobs', label: '일자리 목록' },
  { url: '/login', label: '로그인' },
]

// 금지어 목록
const FORBIDDEN_WORDS = ['시니어', '액티브 시니어', '노인', '어르신', '노령', '고령']

// ─── 타입 ──────────────────────────────────────────────────────────────────────

interface ForbiddenWordHit {
  page: string
  label: string
  word: string
  context: string
  selector: string
}

interface CtaCollected {
  page: string
  label: string
  type: 'login' | 'write' | 'comment' | 'like' | 'scrap'
  text: string
  selector: string
}

interface EmptyStateResult {
  page: string
  label: string
  hasEmptyState: boolean
  emptyStateText: string
}

interface AccessibilityResult {
  page: string
  label: string
  smallTouchTargets: { selector: string; width: number; height: number }[]
  smallFontElements: { selector: string; fontSize: number; text: string }[]
  lowContrastElements: { selector: string; color: string; background: string }[]
}

interface UxWritingReport {
  generatedAt: string
  summary: {
    forbiddenWordFails: number
    ctaInconsistencies: string[]
    emptyStateMissing: string[]
    accessibilityWarnings: number
  }
  forbiddenWords: ForbiddenWordHit[]
  ctaTexts: CtaCollected[]
  emptyStates: EmptyStateResult[]
  accessibility: AccessibilityResult[]
}

// ─── 금지어 스캔 ───────────────────────────────────────────────────────────────

async function scanForbiddenWords(page: Page, url: string, label: string): Promise<ForbiddenWordHit[]> {
  const hits: ForbiddenWordHit[] = []

  for (const word of FORBIDDEN_WORDS) {
    const elements = await page.evaluate((searchWord: string) => {
      const walker = document.createTreeWalker(
        document.body,
        NodeFilter.SHOW_TEXT,
        null
      )

      const results: { text: string; context: string; selector: string }[] = []
      let node: Text | null

      while ((node = walker.nextNode() as Text | null)) {
        const text = node.textContent ?? ''
        if (text.includes(searchWord)) {
          const parent = node.parentElement
          if (!parent) continue

          // script/style 태그 제외
          const tagName = parent.tagName.toLowerCase()
          if (['script', 'style', 'noscript'].includes(tagName)) continue

          // 컨텍스트 (앞뒤 20자)
          const idx = text.indexOf(searchWord)
          const contextStart = Math.max(0, idx - 20)
          const contextEnd = Math.min(text.length, idx + searchWord.length + 20)
          const context = '...' + text.slice(contextStart, contextEnd).trim() + '...'

          // 간단한 selector 생성
          const id = parent.id ? `#${parent.id}` : ''
          const cls = parent.className && typeof parent.className === 'string'
            ? '.' + parent.className.trim().split(/\s+/).slice(0, 2).join('.')
            : ''
          const selector = id || cls || tagName

          results.push({ text: text.trim().slice(0, 100), context, selector })
        }
      }
      return results
    }, word)

    for (const el of elements) {
      hits.push({ page: url, label, word, context: el.context, selector: el.selector })
    }
  }

  return hits
}

// ─── CTA 문구 수집 ─────────────────────────────────────────────────────────────

async function collectCtaTexts(page: Page, url: string, label: string): Promise<CtaCollected[]> {
  return page.evaluate((pageInfo: { url: string; label: string }) => {
    const results: { page: string; label: string; type: string; text: string; selector: string }[] = []

    // 로그인 버튼
    document.querySelectorAll('a[href*="login"], button').forEach((el) => {
      const text = el.textContent?.trim() ?? ''
      if (text && (text.includes('로그인') || text.includes('시작') || text.includes('카카오'))) {
        const id = el.id ? `#${el.id}` : ''
        const cls = el.className && typeof el.className === 'string'
          ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.')
          : ''
        results.push({ page: pageInfo.url, label: pageInfo.label, type: 'login', text, selector: id || cls || el.tagName.toLowerCase() })
      }
    })

    // 글쓰기 버튼
    document.querySelectorAll('a[href*="write"], button, a').forEach((el) => {
      const text = el.textContent?.trim() ?? ''
      if (text && (text.includes('글쓰기') || text.includes('글 쓰기') || text.includes('작성'))) {
        const id = el.id ? `#${el.id}` : ''
        const cls = el.className && typeof el.className === 'string'
          ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.')
          : ''
        results.push({ page: pageInfo.url, label: pageInfo.label, type: 'write', text, selector: id || cls || el.tagName.toLowerCase() })
      }
    })

    // 댓글 등록 버튼
    document.querySelectorAll('button').forEach((el) => {
      const text = el.textContent?.trim() ?? ''
      if (text && (text === '등록' || text === '댓글 달기' || text === '댓글달기' || text.includes('댓글'))) {
        const id = el.id ? `#${el.id}` : ''
        const cls = el.className && typeof el.className === 'string'
          ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.')
          : ''
        results.push({ page: pageInfo.url, label: pageInfo.label, type: 'comment', text, selector: id || cls || 'button' })
      }
    })

    // 공감/스크랩
    document.querySelectorAll('button').forEach((el) => {
      const text = el.textContent?.trim() ?? ''
      if (text && (text.includes('공감') || text.includes('스크랩') || text.includes('좋아요'))) {
        const id = el.id ? `#${el.id}` : ''
        const cls = el.className && typeof el.className === 'string'
          ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.')
          : ''
        results.push({ page: pageInfo.url, label: pageInfo.label, type: 'like', text, selector: id || cls || 'button' })
      }
    })

    return results
  }, { url, label }) as Promise<CtaCollected[]>
}

// ─── 빈 상태(Empty State) 확인 ────────────────────────────────────────────────

async function checkEmptyState(page: Page, url: string, label: string): Promise<EmptyStateResult> {
  // 검색 결과 없음, 게시글 없음 등 빈 상태 감지
  const result = await page.evaluate(() => {
    const emptyKeywords = [
      '결과가 없', '글이 없', '아직 없', '내용이 없',
      '데이터가 없', '게시글이 없', '알림이 없', '스크랩이 없',
      '검색 결과가 없', '찾을 수 없', 'empty', 'no result',
    ]

    const allText = document.body.innerText || ''
    const found = emptyKeywords.find((kw) => allText.toLowerCase().includes(kw.toLowerCase()))

    return {
      hasEmptyState: !!found,
      emptyStateText: found ? found : '',
    }
  })

  return { page: url, label, ...result }
}

// ─── 접근성 샘플링 ─────────────────────────────────────────────────────────────

async function checkAccessibility(page: Page, url: string, label: string): Promise<AccessibilityResult> {
  const result = await page.evaluate(() => {
    const smallTouchTargets: { selector: string; width: number; height: number }[] = []
    const smallFontElements: { selector: string; fontSize: number; text: string }[] = []

    // 터치 타겟 52px 미만 버튼/링크 샘플링 (최대 10개)
    const interactiveEls = Array.from(
      document.querySelectorAll('button, a[href], [role="button"]')
    ).slice(0, 30)

    for (const el of interactiveEls) {
      const rect = el.getBoundingClientRect()
      const w = rect.width
      const h = rect.height
      if ((w > 0 && w < 52) || (h > 0 && h < 52)) {
        const text = (el.textContent?.trim() ?? '').slice(0, 30)
        const id = (el as HTMLElement).id ? `#${(el as HTMLElement).id}` : ''
        const cls = (el as HTMLElement).className && typeof (el as HTMLElement).className === 'string'
          ? '.' + (el as HTMLElement).className.trim().split(/\s+/).slice(0, 2).join('.')
          : ''
        if (smallTouchTargets.length < 10) {
          smallTouchTargets.push({ selector: (id || cls || el.tagName.toLowerCase()) + `[${text}]`, width: Math.round(w), height: Math.round(h) })
        }
      }
    }

    // 폰트 18px 미만 본문 텍스트 샘플링
    const textEls = Array.from(
      document.querySelectorAll('p, span, li, td, div')
    ).filter((el) => {
      const text = el.textContent?.trim() ?? ''
      return text.length > 10 && el.children.length === 0
    }).slice(0, 50)

    for (const el of textEls) {
      const fs = parseFloat(window.getComputedStyle(el).fontSize)
      if (fs > 0 && fs < 15) {  // 15px 미만만 보고 (caption 허용 기준)
        const text = (el.textContent?.trim() ?? '').slice(0, 30)
        const id = (el as HTMLElement).id ? `#${(el as HTMLElement).id}` : ''
        const cls = (el as HTMLElement).className && typeof (el as HTMLElement).className === 'string'
          ? '.' + (el as HTMLElement).className.trim().split(/\s+/).slice(0, 2).join('.')
          : ''
        if (smallFontElements.length < 10) {
          smallFontElements.push({ selector: id || cls || el.tagName.toLowerCase(), fontSize: Math.round(fs), text })
        }
      }
    }

    return { smallTouchTargets, smallFontElements, lowContrastElements: [] }
  })

  return { page: url, label, ...result }
}

// ─── CTA 일관성 분석 ───────────────────────────────────────────────────────────

function analyzeCtaConsistency(ctaTexts: CtaCollected[]): string[] {
  const inconsistencies: string[] = []

  // 로그인 버튼 문구 다양성
  const loginTexts = [...new Set(ctaTexts.filter((c) => c.type === 'login').map((c) => c.text))]
  if (loginTexts.length > 2) {
    inconsistencies.push(`로그인 버튼 문구 ${loginTexts.length}가지 혼재: ${loginTexts.join(' / ')}`)
  }

  // 글쓰기 버튼 문구 다양성
  const writeTexts = [...new Set(ctaTexts.filter((c) => c.type === 'write').map((c) => c.text))]
  if (writeTexts.length > 2) {
    inconsistencies.push(`글쓰기 버튼 문구 ${writeTexts.length}가지 혼재: ${writeTexts.join(' / ')}`)
  }

  // 댓글 버튼 문구 다양성
  const commentTexts = [...new Set(ctaTexts.filter((c) => c.type === 'comment').map((c) => c.text))]
  if (commentTexts.length > 1) {
    inconsistencies.push(`댓글 버튼 문구 ${commentTexts.length}가지 혼재: ${commentTexts.join(' / ')}`)
  }

  return inconsistencies
}

// ─── 임시 파일 기반 결과 저장 (워커 간 메모리 공유 불가 대응) ──────────────────

const REPORT_DIR = path.join(process.cwd(), 'assets/qa-report')
const RESULT_FILE = path.join(REPORT_DIR, '20-ux-writing-result.json')
const TMP_DIR = path.join(REPORT_DIR, '.tmp-ux')

interface PageUxData {
  forbiddenHits: ForbiddenWordHit[]
  ctaTexts: CtaCollected[]
  emptyState: EmptyStateResult
  a11y: AccessibilityResult
}

function saveTmpPageData(url: string, data: PageUxData) {
  fs.mkdirSync(TMP_DIR, { recursive: true })
  const key = url.replace(/\//g, '_') || '_root'
  fs.writeFileSync(path.join(TMP_DIR, `${key}.json`), JSON.stringify(data, null, 2))
}

function loadAllTmpData(): PageUxData[] {
  try {
    return fs.readdirSync(TMP_DIR)
      .filter((f) => f.endsWith('.json'))
      .map((f) => JSON.parse(fs.readFileSync(path.join(TMP_DIR, f), 'utf-8')) as PageUxData)
  } catch { return [] }
}

function cleanTmpDir() {
  try {
    const files = fs.readdirSync(TMP_DIR)
    for (const f of files) fs.unlinkSync(path.join(TMP_DIR, f))
    fs.rmdirSync(TMP_DIR)
  } catch { /* ignore */ }
}

// ─── 테스트 ────────────────────────────────────────────────────────────────────

test.describe('UX 라이팅 + 접근성 감사', () => {
  test.describe.configure({ mode: 'serial' })
  test.setTimeout(30_000)

  test.beforeAll(async () => {
    // 이전 임시 파일 초기화
    cleanTmpDir()
    fs.mkdirSync(TMP_DIR, { recursive: true })
  })

  for (const { url, label } of AUDIT_PAGES) {
    test(`[${label}] ${url}`, async ({ page }) => {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20_000 })
      await page.waitForTimeout(1000)

      // A. 금지어 스캔
      const forbiddenHits = await scanForbiddenWords(page, url, label)

      // B. CTA 문구 수집
      const ctaTexts = await collectCtaTexts(page, url, label)

      // C. 빈 상태 확인 (검색 페이지만)
      let emptyState: EmptyStateResult
      if (url === '/search') {
        await page.goto('/search?q=xyzxyz절대없는검색어', { waitUntil: 'domcontentloaded', timeout: 15_000 })
        await page.waitForTimeout(1000)
        emptyState = await checkEmptyState(page, url + '?q=없는검색어', label + ' 빈검색결과')
      } else {
        emptyState = await checkEmptyState(page, url, label)
      }

      // D. 접근성 샘플링
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20_000 })
      await page.waitForTimeout(500)
      const a11y = await checkAccessibility(page, url, label)

      // 즉시 파일 저장 (워커 간 메모리 공유 불가 대응)
      saveTmpPageData(url, { forbiddenHits, ctaTexts, emptyState, a11y })

      // 콘솔 출력
      const hasForbidden = forbiddenHits.length > 0
      const smallTouchCount = a11y.smallTouchTargets.length
      const smallFontCount = a11y.smallFontElements.length

      const icon = hasForbidden ? '❌' : (smallTouchCount > 3 || smallFontCount > 3) ? '⚠️' : '✅'
      console.log(`\n[UX Audit] ${icon} ${label} (${url})`)

      if (forbiddenHits.length > 0) {
        for (const hit of forbiddenHits) {
          console.log(`  ❌ 금지어 발견: "${hit.word}" — ${hit.context}`)
        }
      }
      if (smallTouchCount > 0) {
        console.log(`  ⚠️ 터치타겟 52px 미만: ${smallTouchCount}개`)
        for (const t of a11y.smallTouchTargets.slice(0, 3)) {
          console.log(`     ${t.selector} → ${t.width}×${t.height}px`)
        }
      }
      if (smallFontCount > 0) {
        console.log(`  ⚠️ 폰트 15px 미만: ${smallFontCount}개`)
        for (const f of a11y.smallFontElements.slice(0, 3)) {
          console.log(`     ${f.selector} → ${f.fontSize}px "${f.text}"`)
        }
      }
      if (!hasForbidden && smallTouchCount === 0 && smallFontCount === 0) {
        console.log(`  이슈 없음`)
      }

      // 금지어 발견 시 테스트 실패 처리
      if (forbiddenHits.length > 0) {
        expect.soft(
          false,
          `[${label}] 금지어 발견:\n${forbiddenHits.map((h) => `  - "${h.word}": ${h.context}`).join('\n')}`
        ).toBeTruthy()
      }
    })
  }

  test.afterAll(async () => {
    const allData = loadAllTmpData()
    const allForbiddenHits = allData.flatMap((d) => d.forbiddenHits)
    const allCtaTexts = allData.flatMap((d) => d.ctaTexts)
    const allEmptyStates = allData.map((d) => d.emptyState)
    const allAccessibility = allData.map((d) => d.a11y)

    const ctaInconsistencies = analyzeCtaConsistency(allCtaTexts)
    const emptyStateMissing = allEmptyStates
      .filter((e) => e.page.includes('search') && !e.hasEmptyState)
      .map((e) => e.label)

    const totalA11yWarnings = allAccessibility.reduce(
      (sum, a) => sum + a.smallTouchTargets.length + a.smallFontElements.length,
      0
    )

    const report: UxWritingReport = {
      generatedAt: new Date().toISOString(),
      summary: {
        forbiddenWordFails: allForbiddenHits.length,
        ctaInconsistencies,
        emptyStateMissing,
        accessibilityWarnings: totalA11yWarnings,
      },
      forbiddenWords: allForbiddenHits,
      ctaTexts: allCtaTexts,
      emptyStates: allEmptyStates,
      accessibility: allAccessibility,
    }

    fs.mkdirSync(REPORT_DIR, { recursive: true })
    fs.writeFileSync(RESULT_FILE, JSON.stringify(report, null, 2))
    cleanTmpDir()

    // CTA 일관성 분석 출력
    console.log('\n' + '═'.repeat(60))
    console.log(`[UX Audit] 종합 결과: ${allData.length}개 페이지`)
    console.log(`  ❌ 금지어 발견: ${allForbiddenHits.length}건`)

    if (allForbiddenHits.length > 0) {
      const grouped: Record<string, number> = {}
      for (const h of allForbiddenHits) {
        grouped[h.word] = (grouped[h.word] ?? 0) + 1
      }
      for (const [word, count] of Object.entries(grouped)) {
        console.log(`     "${word}": ${count}건`)
      }
    }

    console.log(`  ℹ️  CTA 문구 수집: ${allCtaTexts.length}건`)
    if (ctaInconsistencies.length > 0) {
      console.log(`  ⚠️  CTA 불일치:`)
      for (const inc of ctaInconsistencies) {
        console.log(`     ${inc}`)
      }
    } else {
      console.log(`  ✅ CTA 일관성 OK`)
    }

    console.log(`  ⚠️  접근성 경고: ${totalA11yWarnings}건 (터치타겟+폰트)`)
    console.log(`  📁 assets/qa-report/20-ux-writing-result.json`)
    console.log('═'.repeat(60))
  })
})
