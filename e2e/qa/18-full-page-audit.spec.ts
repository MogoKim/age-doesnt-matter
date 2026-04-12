/**
 * QA 18 — 전체 페이지 렌더링 + 성능 감사
 *
 * 목적: 발견(Discovery) — 문제 수정 아님
 * 대상: 프로덕션 전체 공개 페이지 + 로그인 페이지
 * 실행: npm run qa:audit
 *
 * 수집 지표:
 *   - HTTP 상태, 콘솔 에러
 *   - FCP / LCP / CLS / TTFB / DOM 로드 시간
 *   - H1 태그, OG 메타태그, canonical URL
 *   - alt 없는 이미지 수
 *
 * 출력: assets/qa-report/18-page-audit-result.json
 */

import { test, expect, type Page } from '@playwright/test'
import * as fs from 'fs'
import * as path from 'path'

// ─── 감사 대상 페이지 ──────────────────────────────────────────────────────────

const PUBLIC_PAGES = [
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
  { url: '/community', label: '커뮤니티 메인' },
  { url: '/magazine', label: '매거진 목록' },
  { url: '/jobs', label: '일자리 목록' },
  { url: '/login', label: '로그인' },
]

// ─── 타입 ──────────────────────────────────────────────────────────────────────

interface PerformanceMetrics {
  fcp: number
  lcp: number
  cls: number
  ttfb: number
  domLoadTime: number
}

interface PageAuditResult {
  url: string
  label: string
  httpStatus: number
  consoleErrors: string[]
  performance: PerformanceMetrics
  hasH1: boolean
  h1Text: string
  ogTitle: string
  ogDescription: string
  ogImage: string
  canonicalUrl: string
  imagesMissingAlt: number
  issues: { level: 'FAIL' | 'WARN'; message: string }[]
}

// ─── 성능 지표 수집 ────────────────────────────────────────────────────────────

async function collectPerformanceMetrics(page: Page): Promise<PerformanceMetrics> {
  return page.evaluate(() => {
    return new Promise<PerformanceMetrics>((resolve) => {
      // LCP는 PerformanceObserver로 수집
      let lcpValue = 0
      let clsValue = 0

      const lcpObserver = new PerformanceObserver((list) => {
        const entries = list.getEntries()
        if (entries.length > 0) {
          lcpValue = entries[entries.length - 1].startTime
        }
      })

      const clsObserver = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          // LayoutShift 타입에는 hadRecentInput, value가 있음
          const ls = entry as PerformanceEntry & { hadRecentInput: boolean; value: number }
          if (!ls.hadRecentInput) {
            clsValue += ls.value
          }
        }
      })

      try {
        lcpObserver.observe({ type: 'largest-contentful-paint', buffered: true })
        clsObserver.observe({ type: 'layout-shift', buffered: true })
      } catch {
        // 브라우저 미지원 시 스킵
      }

      // 2초 후 수집 (충분한 관찰 시간)
      setTimeout(() => {
        lcpObserver.disconnect()
        clsObserver.disconnect()

        const navEntry = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined
        const paintEntries = performance.getEntriesByType('paint')
        const fcpEntry = paintEntries.find((e) => e.name === 'first-contentful-paint')

        resolve({
          fcp: Math.round(fcpEntry?.startTime ?? 0),
          lcp: Math.round(lcpValue),
          cls: Math.round(clsValue * 1000) / 1000,
          ttfb: Math.round(navEntry ? navEntry.responseStart - navEntry.requestStart : 0),
          domLoadTime: Math.round(navEntry ? navEntry.domContentLoadedEventEnd - navEntry.startTime : 0),
        })
      }, 2000)
    })
  })
}

// ─── 이슈 판정 ─────────────────────────────────────────────────────────────────

function evaluateIssues(
  result: Omit<PageAuditResult, 'issues'>
): { level: 'FAIL' | 'WARN'; message: string }[] {
  const issues: { level: 'FAIL' | 'WARN'; message: string }[] = []
  const { performance: perf } = result

  if (result.httpStatus !== 200) {
    issues.push({ level: 'FAIL', message: `HTTP ${result.httpStatus}` })
  }
  // 알려진 외부 스크립트 에러 필터 (Google AdSense/Funding Choices — 제어 불가)
  const filteredErrors = result.consoleErrors.filter(
    (e) => !e.includes('appendChild') && !e.includes('adsbygoogle')
  )
  if (filteredErrors.length > 0) {
    issues.push({ level: 'FAIL', message: `콘솔 에러 ${filteredErrors.length}건: ${filteredErrors.slice(0, 2).join(' | ')}` })
  }
  if (perf.lcp > 4000) {
    issues.push({ level: 'FAIL', message: `LCP ${(perf.lcp / 1000).toFixed(1)}s (임계값 4.0s 초과)` })
  } else if (perf.lcp > 2500 && perf.lcp > 0) {
    issues.push({ level: 'WARN', message: `LCP ${(perf.lcp / 1000).toFixed(1)}s (권장 2.5s 초과)` })
  }
  if (perf.cls > 0.25) {
    issues.push({ level: 'FAIL', message: `CLS ${perf.cls} (임계값 0.25 초과)` })
  } else if (perf.cls > 0.1) {
    issues.push({ level: 'WARN', message: `CLS ${perf.cls} (권장 0.1 초과)` })
  }
  if (perf.ttfb > 2000) {
    issues.push({ level: 'WARN', message: `TTFB ${(perf.ttfb / 1000).toFixed(1)}s (권장 2.0s 초과)` })
  }
  if (perf.fcp > 3000 && perf.fcp > 0) {
    issues.push({ level: 'WARN', message: `FCP ${(perf.fcp / 1000).toFixed(1)}s (권장 3.0s 초과)` })
  }
  if (!result.hasH1) {
    issues.push({ level: 'WARN', message: 'H1 태그 없음' })
  }
  if (!result.ogTitle) {
    issues.push({ level: 'WARN', message: 'og:title 없음' })
  }
  if (!result.ogDescription) {
    issues.push({ level: 'WARN', message: 'og:description 없음' })
  }
  if (!result.ogImage) {
    issues.push({ level: 'WARN', message: 'og:image 없음' })
  }
  if (!result.canonicalUrl) {
    issues.push({ level: 'WARN', message: 'canonical URL 없음' })
  }
  if (result.imagesMissingAlt > 0) {
    issues.push({ level: 'WARN', message: `alt 속성 없는 이미지 ${result.imagesMissingAlt}개` })
  }

  return issues
}

// ─── 결과 저장 (페이지별 개별 파일 — afterAll 없이 동작) ─────────────────────
// fullyParallel:true 환경에서 afterAll/beforeAll은 워커마다 실행되어 신뢰불가.
// 각 테스트가 자신의 결과를 개별 파일로 저장 → 뷰어가 직접 취합.

const PAGES_DIR = path.join(process.cwd(), 'assets/qa-report/pages-18')

function savePageResult(result: PageAuditResult) {
  fs.mkdirSync(PAGES_DIR, { recursive: true })
  const key = result.url.replace(/^\//, '').replace(/\//g, '-') || 'home'
  fs.writeFileSync(path.join(PAGES_DIR, `${key}.json`), JSON.stringify(result))
}

// ─── 테스트 ────────────────────────────────────────────────────────────────────

test.describe('전체 페이지 렌더링 + 성능 감사', () => {
  test.setTimeout(30_000)

  for (const { url, label } of PUBLIC_PAGES) {
    test(`[${label}] ${url}`, async ({ page }) => {
      const consoleErrors: string[] = []
      page.on('console', (msg) => {
        if (msg.type() === 'error') consoleErrors.push(msg.text().slice(0, 200))
      })
      page.on('pageerror', (err) => consoleErrors.push('[PageError] ' + err.message.slice(0, 200)))

      const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20_000 })
      const httpStatus = response?.status() ?? 0

      // 2초 대기 (LCP/CLS 관찰)
      await page.waitForTimeout(2000)

      const perfMetrics = await collectPerformanceMetrics(page)

      // 메타 정보 수집
      const [hasH1, h1Text, ogTitle, ogDescription, ogImage, canonicalUrl, imagesMissingAlt] =
        await page.evaluate(() => {
          const h1 = document.querySelector('h1')
          return [
            !!h1,
            h1?.textContent?.trim() ?? '',
            (document.querySelector('meta[property="og:title"]') as HTMLMetaElement)?.content ?? '',
            (document.querySelector('meta[property="og:description"]') as HTMLMetaElement)?.content ?? '',
            (document.querySelector('meta[property="og:image"]') as HTMLMetaElement)?.content ?? '',
            (document.querySelector('link[rel="canonical"]') as HTMLLinkElement)?.href ?? '',
            Array.from(document.querySelectorAll('img')).filter(
              (img) => !img.getAttribute('alt') && !img.getAttribute('aria-hidden')
            ).length,
          ]
        })

      const resultBase = {
        url,
        label,
        httpStatus,
        consoleErrors,
        performance: perfMetrics,
        hasH1: hasH1 as boolean,
        h1Text: h1Text as string,
        ogTitle: ogTitle as string,
        ogDescription: ogDescription as string,
        ogImage: ogImage as string,
        canonicalUrl: canonicalUrl as string,
        imagesMissingAlt: imagesMissingAlt as number,
      }

      const issues = evaluateIssues(resultBase)
      const fullResult: PageAuditResult = { ...resultBase, issues }

      // 즉시 파일에 저장 (워커 간 메모리 공유 불가 대응)
      savePageResult(fullResult)

      // 콘솔 출력
      const failCount = issues.filter((i) => i.level === 'FAIL').length
      const warnCount = issues.filter((i) => i.level === 'WARN').length
      const icon = failCount > 0 ? '❌' : warnCount > 0 ? '⚠️' : '✅'

      console.log(`\n[Page Audit] ${icon} ${label} (${url})`)
      console.log(
        `  성능: FCP=${(perfMetrics.fcp / 1000).toFixed(1)}s | LCP=${(perfMetrics.lcp / 1000).toFixed(1)}s | CLS=${perfMetrics.cls} | TTFB=${(perfMetrics.ttfb / 1000).toFixed(1)}s | DOM=${(perfMetrics.domLoadTime / 1000).toFixed(1)}s`
      )
      for (const issue of issues) {
        console.log(`  ${issue.level === 'FAIL' ? '❌' : '⚠️'} ${issue.message}`)
      }
      if (issues.length === 0) console.log('  이슈 없음')

      // FAIL 항목만 실제 테스트 실패로 처리
      const failIssues = issues.filter((i) => i.level === 'FAIL')
      if (failIssues.length > 0) {
        expect.soft(false, `[${label}] FAIL 이슈:\n${failIssues.map((i) => '  - ' + i.message).join('\n')}`).toBeTruthy()
      }
    })
  }

  // afterAll 제거 — 뷰어가 pages-18/ 폴더에서 직접 취합
  // (fullyParallel 환경에서 afterAll은 워커마다 따로 실행되어 신뢰불가)
})
