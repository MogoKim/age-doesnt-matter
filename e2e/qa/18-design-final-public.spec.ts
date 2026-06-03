/**
 * QA 18-design-final-public — 디자인 최종 QA (비로그인 공개 페이지)
 *
 * 목적: Claude Design 15세션 + 후속 작업 이후 공개 페이지 UI 검증
 * 실행: npx playwright test e2e/qa/18-design-final-public.spec.ts \
 *         --project=qa-audit --project=qa-audit-mobile --workers=1
 *
 * 출력:
 *   스크린샷: playwright-screenshots/design-final-public/
 *   리포트:   playwright-screenshots/design-final-public/report.json
 *
 * 프로젝트별 동작:
 *   qa-audit         → 데스크탑 1280×800, normal 글씨
 *   qa-audit-mobile  → 모바일 375×812, normal + xlarge 글씨
 */

import { test, type Page } from '@playwright/test'
import * as fs from 'fs'
import * as path from 'path'

// ── 상수 ─────────────────────────────────────────────────────────────────────

const SCREENSHOT_DIR = path.join(process.cwd(), 'playwright-screenshots/design-final-public')
const REPORT_PATH = path.join(SCREENSHOT_DIR, 'report.json')

const BASE_PAGES: { name: string; url: string }[] = [
  { name: 'home',      url: '/' },
  { name: 'jobs',      url: '/jobs' },
  { name: 'magazine',  url: '/magazine' },
  { name: 'best',      url: '/best' },
  { name: 'stories',   url: '/community/stories' },
  { name: 'life2',     url: '/community/life2' },
  { name: 'humor',     url: '/community/humor' },
  { name: 'search',    url: '/search' },
  { name: 'search-q',  url: '/search?q=여행' },
  { name: 'login',     url: '/login' },
  { name: 'about',     url: '/about' },
  { name: 'grade',     url: '/grade' },
  { name: 'contact',   url: '/contact' },
  { name: 'terms',     url: '/terms' },
  { name: 'privacy',   url: '/privacy' },
  { name: 'rules',     url: '/rules' },
]

type ViewportLabel = 'mobile' | 'desktop'
type FontSize = 'normal' | 'xlarge'

interface QAEntry {
  name: string
  url: string
  viewport: ViewportLabel
  fontSize: FontSize
  screenshot: string
  issues: string[]
  warnings: string[]
}

interface QAReport {
  checkedAt: string
  baseURL: string
  pages: QAEntry[]
  summary: {
    pagesChecked: number
    issueCount: number
    warningCount: number
  }
}

// ── Setup ────────────────────────────────────────────────────────────────────

test.beforeAll(() => {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true })
})

// ── Helpers ──────────────────────────────────────────────────────────────────

async function navigatePage(page: Page, url: string): Promise<number> {
  const res = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 })
  await page.waitForTimeout(600) // hydration + 콘텐츠 렌더 대기
  return res?.status() ?? 0
}

async function applyFontSize(page: Page, size: FontSize): Promise<void> {
  await page.evaluate((s: string) => {
    if (s === 'xlarge') {
      document.documentElement.setAttribute('data-font-size', 'XLARGE')
    } else {
      document.documentElement.removeAttribute('data-font-size')
    }
  }, size)
  await page.waitForTimeout(200)
}

async function checkHScroll(page: Page): Promise<string | null> {
  const has = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 2
  )
  return has ? '가로 스크롤 발생' : null
}

async function checkTouchTargets(
  page: Page
): Promise<{ issues: string[]; warnings: string[] }> {
  return page.evaluate(() => {
    const issues: string[] = []
    const warnings: string[] = []
    const els = Array.from(
      document.querySelectorAll('button, a[href], input, textarea, select')
    ) as HTMLElement[]
    els.forEach((el) => {
      const rect = el.getBoundingClientRect()
      if (!rect.height || !rect.width) return
      // 인라인 텍스트 링크 제외 (본문 내 링크)
      if (el.tagName === 'A' && el.closest('p, li, td, blockquote')) return
      const label = `${el.tagName}["${(el.textContent || '').trim().slice(0, 20)}"] h=${Math.round(rect.height)}`
      if (rect.height < 40) issues.push(`터치타겟 < 40px: ${label}`)
      else if (rect.height < 44) warnings.push(`터치타겟 < 44px: ${label}`)
    })
    return { issues: issues.slice(0, 8), warnings: warnings.slice(0, 8) }
  })
}

async function checkForbiddenClasses(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const found = new Map<string, string>()
    type CheckFn = (c: string) => boolean
    const checks: Array<[CheckFn, string]> = [
      // text-primary 단독 (text-primary-text / text-primary-foreground 는 OK)
      [(c) => /\btext-primary\b/.test(c) && !/\btext-primary-/.test(c), 'text-primary 단독 사용'],
      // hover:text-primary 단독
      [(c) => /\bhover:text-primary\b/.test(c) && !/hover:text-primary-/.test(c), 'hover:text-primary'],
      // 하드코딩 hover 색상
      [(c) => c.includes('hover:bg-[#E85D50]'), 'hover:bg-[#E85D50] 하드코딩'],
      // bg-primary/10 과 text-foreground 동시 사용
      [(c) => /\bbg-primary\/\d/.test(c) && /\btext-foreground\b/.test(c), 'bg-primary/N + text-foreground 조합'],
      // 구 muted 대체 전 zinc 클래스
      [(c) => /\bbg-zinc-100\b/.test(c), 'bg-zinc-100 (→ bg-muted)'],
      // grade 구 클래스 (이번 작업에서 변경했으므로 잔존이면 이슈)
      [(c) => /\btext-green-600\b/.test(c), 'text-green-600 (grade 구 클래스)'],
      [(c) => /\bbg-green-500\b/.test(c), 'bg-green-500'],
    ]
    document.querySelectorAll('[class]').forEach((el) => {
      const cls = typeof el.className === 'string' ? el.className : ''
      if (!cls) return
      checks.forEach(([fn, label]) => {
        if (fn(cls) && !found.has(label)) {
          const tag = `${el.tagName}${el.id ? '#' + el.id : ''}`
          found.set(label, `${label} (${tag})`)
        }
      })
    })
    return Array.from(found.values()).slice(0, 10)
  })
}

async function checkBrokenImages(page: Page): Promise<string[]> {
  // lazy 이미지 트리거를 위해 스크롤 후 복귀
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
  await page.waitForTimeout(400)
  await page.evaluate(() => window.scrollTo(0, 0))
  return page.evaluate(() => {
    const broken: string[] = []
    document.querySelectorAll('img').forEach((img) => {
      const rect = img.getBoundingClientRect()
      if (!rect.height) return // 숨김 이미지 스킵
      const el = img as HTMLImageElement
      if (el.complete && el.naturalWidth === 0 && img.src && !img.src.startsWith('data:')) {
        broken.push(`깨진 이미지: ...${img.src.slice(-55)}`)
      }
    })
    return broken.slice(0, 5)
  })
}

async function checkPagination(page: Page): Promise<string | null> {
  return page.evaluate(() => {
    const pagi = document.querySelector<HTMLElement>(
      '[class*="pagination"], nav[aria-label*="페이지"]'
    )
    if (!pagi) return null
    const h = pagi.getBoundingClientRect().height
    if (h > 70) return `페이지네이션 높이 ${Math.round(h)}px — 줄바꿈 의심`
    return null
  })
}

async function checkGradePage(
  page: Page
): Promise<{ issues: string[]; warnings: string[] }> {
  return page.evaluate(() => {
    const issues: string[] = []
    const style = getComputedStyle(document.documentElement)
    ;['--grade-sprout-bg', '--grade-regular-bg', '--grade-veteran-bg', '--grade-neighbor-bg'].forEach(
      (v) => {
        if (!style.getPropertyValue(v).trim()) issues.push(`CSS 변수 없음: ${v}`)
      }
    )
    const old = [
      'bg-green-50', 'bg-emerald-50', 'bg-blue-50', 'bg-amber-50',
      'text-green-600', 'text-emerald-600', 'text-blue-600', 'text-amber-600',
    ]
    const seen = new Set<string>()
    document.querySelectorAll('[class]').forEach((el) => {
      const cls = typeof el.className === 'string' ? el.className : ''
      old.forEach((c) => {
        if (cls.includes(c) && !seen.has(c)) {
          seen.add(c)
          issues.push(`구 grade 클래스 잔존: ${c}`)
        }
      })
    })
    return { issues, warnings: [] as string[] }
  })
}

async function checkSearchInput(page: Page): Promise<string | null> {
  return page.evaluate(() => {
    const input = document.querySelector<HTMLElement>(
      'input[type="search"], input[placeholder*="검색"]'
    )
    if (!input) return '검색 input 없음'
    const h = input.getBoundingClientRect().height
    return h < 52 ? `검색 input 높이 ${Math.round(h)}px (< 52px)` : null
  })
}

async function discoverDetailUrl(
  page: Page,
  listUrl: string,
  pattern: RegExp
): Promise<string | null> {
  try {
    await page.goto(listUrl, { waitUntil: 'domcontentloaded', timeout: 20_000 })
    await page.waitForTimeout(600)
    return await page.evaluate((pat: string) => {
      const re = new RegExp(pat)
      const links = Array.from(
        document.querySelectorAll<HTMLAnchorElement>('a[href]')
      )
      const found = links.find((a) => re.test(a.pathname ?? ''))
      return found?.pathname ?? null
    }, pattern.source)
  } catch {
    return null
  }
}

// ── 단일 페이지 QA ───────────────────────────────────────────────────────────

async function runPageQA(
  page: Page,
  config: { name: string; url: string; viewport: ViewportLabel; fontSize: FontSize }
): Promise<QAEntry> {
  const { name, url, viewport, fontSize } = config
  const shotFile = `${name}-${viewport}-${fontSize}.png`
  const entry: QAEntry = {
    name, url, viewport, fontSize,
    screenshot: `playwright-screenshots/design-final-public/${shotFile}`,
    issues: [],
    warnings: [],
  }

  try {
    const status = await navigatePage(page, url)
    if (status !== 0 && status !== 200 && status !== 304) {
      entry.issues.push(`HTTP ${status}`)
    }

    if (fontSize === 'xlarge') await applyFontSize(page, 'xlarge')

    // 1. 가로 스크롤
    const hScroll = await checkHScroll(page)
    if (hScroll) entry.issues.push(hScroll)

    // 2. 터치 타겟
    const { issues: ttI, warnings: ttW } = await checkTouchTargets(page)
    entry.issues.push(...ttI)
    entry.warnings.push(...ttW)

    // 3. 금지 클래스
    const forbidden = await checkForbiddenClasses(page)
    entry.issues.push(...forbidden)

    // 4. 페이지네이션
    const pagi = await checkPagination(page)
    if (pagi) entry.warnings.push(pagi)

    // 5. 이미지 (normal 에서만 — xlarge 는 CSS 레이아웃 확인이 목적)
    if (fontSize === 'normal') {
      const broken = await checkBrokenImages(page)
      entry.issues.push(...broken)
    }

    // 6. /grade 전용
    if (name === 'grade') {
      const { issues, warnings } = await checkGradePage(page)
      entry.issues.push(...issues)
      entry.warnings.push(...warnings)
    }

    // 7. /search 전용
    if ((name === 'search' || name === 'search-q') && fontSize === 'normal') {
      const si = await checkSearchInput(page)
      if (si) entry.issues.push(si)
    }

    // 스크린샷
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, shotFile), fullPage: true })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    entry.issues.push(`QA 오류: ${msg.slice(0, 100)}`)
  }

  return entry
}

// ── 메인 테스트 ───────────────────────────────────────────────────────────────

test('Design QA — 비로그인 공개 페이지', async ({ page }, testInfo) => {
  test.setTimeout(300_000) // 모바일 19×2 항목 × ~8s = ~300s
  const isMobile = testInfo.project.name === 'qa-audit-mobile'
  const viewport: ViewportLabel = isMobile ? 'mobile' : 'desktop'

  // 뷰포트 재설정 (프로젝트 기본값 오버라이드)
  await page.setViewportSize(
    isMobile ? { width: 375, height: 812 } : { width: 1280, height: 800 }
  )

  console.log(`\n${'='.repeat(60)}`)
  console.log(`[${viewport.toUpperCase()}] 디자인 QA 시작`)
  console.log(`${'='.repeat(60)}`)

  // 상세 URL 발견
  const pages = [...BASE_PAGES]

  const jobsDetailUrl = await discoverDetailUrl(page, '/jobs', /^\/jobs\/\d/)
  if (jobsDetailUrl) {
    pages.push({ name: 'jobs-detail', url: jobsDetailUrl })
    console.log(`  ✔ jobs detail 발견: ${jobsDetailUrl}`)
  } else {
    testInfo.annotations.push({ type: 'info', description: 'skip: jobs detail URL not found' })
    console.log('  ℹ jobs detail — 발견 실패, skip')
  }

  const magazineDetailUrl = await discoverDetailUrl(page, '/magazine', /^\/magazine\/[^?#]+$/)
  if (magazineDetailUrl) {
    pages.push({ name: 'magazine-detail', url: magazineDetailUrl })
    console.log(`  ✔ magazine detail 발견: ${magazineDetailUrl}`)
  } else {
    testInfo.annotations.push({ type: 'info', description: 'skip: magazine detail URL not found' })
    console.log('  ℹ magazine detail — 발견 실패, skip')
  }

  const postDetailUrl = await discoverDetailUrl(
    page, '/community/stories', /^\/community\/stories\/.+/
  )
  if (postDetailUrl) {
    pages.push({ name: 'post-detail', url: postDetailUrl })
    console.log(`  ✔ post detail 발견: ${postDetailUrl}`)
  } else {
    testInfo.annotations.push({ type: 'info', description: 'skip: post detail URL not found' })
    console.log('  ℹ post detail — 발견 실패, skip')
  }

  console.log(`\n총 ${pages.length}개 페이지 × ${isMobile ? '2' : '1'}개 글씨 크기 = ${pages.length * (isMobile ? 2 : 1)}개 항목\n`)

  // 페이지별 QA 실행
  const results: QAEntry[] = []

  for (const pageConfig of pages) {
    // normal
    process.stdout.write(`  ▶ [${viewport}/${pageConfig.name}] normal ... `)
    const normalEntry = await runPageQA(page, { ...pageConfig, viewport, fontSize: 'normal' })
    results.push(normalEntry)
    console.log(
      normalEntry.issues.length > 0
        ? `❌ ${normalEntry.issues.length}개 이슈`
        : `✅ OK (warn: ${normalEntry.warnings.length})`
    )

    // xlarge (mobile 만)
    if (isMobile) {
      process.stdout.write(`  ▶ [${viewport}/${pageConfig.name}] xlarge ... `)
      const xlargeEntry = await runPageQA(page, { ...pageConfig, viewport, fontSize: 'xlarge' })
      results.push(xlargeEntry)
      console.log(
        xlargeEntry.issues.length > 0
          ? `❌ ${xlargeEntry.issues.length}개 이슈`
          : `✅ OK (warn: ${xlargeEntry.warnings.length})`
      )
    }
  }

  // 리포트 병합 + 저장 (뷰포트별 덮어쓰기 — 다른 뷰포트 결과 보존)
  let existingPages: QAEntry[] = []
  if (fs.existsSync(REPORT_PATH)) {
    try {
      const existing = JSON.parse(fs.readFileSync(REPORT_PATH, 'utf-8')) as QAReport
      existingPages = existing.pages.filter((p) => p.viewport !== viewport)
    } catch { /* 파싱 실패 시 빈 상태로 시작 */ }
  }
  const allPages = [...existingPages, ...results]
  const report: QAReport = {
    checkedAt: new Date().toISOString(),
    baseURL: 'https://www.age-doesnt-matter.com',
    pages: allPages,
    summary: {
      pagesChecked: allPages.length,
      issueCount: allPages.reduce((s, p) => s + p.issues.length, 0),
      warningCount: allPages.reduce((s, p) => s + p.warnings.length, 0),
    },
  }
  fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2))

  // 콘솔 최종 요약
  const totalI = results.reduce((s, r) => s + r.issues.length, 0)
  const totalW = results.reduce((s, r) => s + r.warnings.length, 0)
  const failPages = results.filter((r) => r.issues.length > 0).map((r) => r.name)

  console.log(`\n${'─'.repeat(60)}`)
  console.log(`[${viewport.toUpperCase()}] 완료 — 항목 ${results.length}개`)
  console.log(`  ❌ issues:   ${totalI}`)
  console.log(`  ⚠️  warnings: ${totalW}`)
  if (failPages.length > 0) console.log(`  실패 페이지: ${failPages.join(', ')}`)
  console.log(`  📁 리포트: ${REPORT_PATH}`)
  console.log(`${'─'.repeat(60)}\n`)
})
