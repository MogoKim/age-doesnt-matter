import { test, expect, type Page, type CDPSession } from '@playwright/test'

/**
 * 저사양 기준선 측정 하네스 (1회차 측정 인프라)
 *
 * 목적: PASS/FAIL 판정이 아니라 50·60대 저사양 Android/느린망 환경의 "기준선"을 수집.
 *  - CDP로 CPU 4x 쓰로틀 + slow-3G(다운 ~1.5Mbps, latency 150ms) 실제 적용
 *  - 수집: HTTP status, wall load, TTFB, DOMContentLoaded, load, JS heap, console/page 에러
 *  - 2·3회차 수정 전후 비교 기준선으로 사용 (콘솔에 JSON 한 줄씩 출력)
 *
 * 실행: E2E_BASE_URL=https://age-doesnt-matter.com npm run qa:lowend
 */

const CPU_THROTTLE_RATE = 4 // 4x slowdown (저사양 근사)
const NET = {
  offline: false,
  downloadThroughput: Math.round((1.5 * 1024 * 1024) / 8), // ~1.5 Mbps
  uploadThroughput: Math.round((0.75 * 1024 * 1024) / 8),
  latency: 150,
}

interface Baseline {
  page: string
  path: string
  status: number | null
  wallLoadMs: number
  ttfbMs: number | null
  domContentLoadedMs: number | null
  loadEventMs: number | null
  jsHeapUsedMB: number | null
  consoleErrors: number
  pageErrors: number
  errorSamples: string[]
}

async function applyLowEnd(page: Page): Promise<CDPSession> {
  const client = await page.context().newCDPSession(page)
  await client.send('Network.enable')
  await client.send('Network.emulateNetworkConditions', NET)
  await client.send('Performance.enable')
  await client.send('Emulation.setCPUThrottlingRate', { rate: CPU_THROTTLE_RATE })
  return client
}

async function measure(page: Page, client: CDPSession, label: string, path: string): Promise<Baseline> {
  const consoleErrors: string[] = []
  const pageErrors: string[] = []
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 200))
  })
  page.on('pageerror', (e) => pageErrors.push(String(e).slice(0, 200)))

  const start = Date.now()
  const resp = await page.goto(path, { waitUntil: 'load', timeout: 60_000 }).catch(() => null)
  const wallLoadMs = Date.now() - start

  const timing = await page
    .evaluate(() => {
      const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined
      const mem = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory
      return {
        ttfbMs: nav ? Math.round(nav.responseStart) : null,
        domContentLoadedMs: nav ? Math.round(nav.domContentLoadedEventEnd) : null,
        loadEventMs: nav ? Math.round(nav.loadEventEnd) : null,
        jsHeapUsedMB: mem ? Math.round(mem.usedJSHeapSize / 1048576) : null,
      }
    })
    .catch(() => ({ ttfbMs: null, domContentLoadedMs: null, loadEventMs: null, jsHeapUsedMB: null }))

  // CDP 메모리 보강 (performance.memory가 없을 때)
  let jsHeapUsedMB = timing.jsHeapUsedMB
  try {
    const { metrics } = await client.send('Performance.getMetrics')
    const heap = metrics.find((m) => m.name === 'JSHeapUsedSize')?.value
    if (jsHeapUsedMB == null && heap) jsHeapUsedMB = Math.round(heap / 1048576)
  } catch {
    /* 무시 */
  }

  return {
    page: label,
    path,
    status: resp?.status() ?? null,
    wallLoadMs,
    ttfbMs: timing.ttfbMs,
    domContentLoadedMs: timing.domContentLoadedMs,
    loadEventMs: timing.loadEventMs,
    jsHeapUsedMB,
    consoleErrors: consoleErrors.length,
    pageErrors: pageErrors.length,
    errorSamples: [...pageErrors.slice(0, 3), ...consoleErrors.slice(0, 3)],
  }
}

const PAGES: { name: string; path: string }[] = [
  { name: 'home', path: '/' },
  { name: 'list-stories', path: '/community/stories' },
  { name: 'magazine', path: '/magazine' },
  { name: 'jobs', path: '/jobs' },
  { name: 'login', path: '/login' },
]

test.describe('@lowend 저사양 기준선', () => {
  for (const p of PAGES) {
    test(`baseline: ${p.name} (${p.path})`, async ({ page }) => {
      const client = await applyLowEnd(page)
      const b = await measure(page, client, p.name, p.path)
      console.log('LOWEND_BASELINE ' + JSON.stringify(b))
      // 기준선 수집 목적 — 페이지 로드 성공만 soft 확인
      expect(b.status, `${p.path} HTTP status`).toBeLessThan(400)
    })
  }

  test('baseline: post-detail (목록에서 동적 발견)', async ({ page }) => {
    const client = await applyLowEnd(page)
    await page.goto('/community/stories', { waitUntil: 'domcontentloaded', timeout: 60_000 }).catch(() => null)
    const href = await page
      .locator('a[href^="/community/stories/"]')
      .first()
      .getAttribute('href')
      .catch(() => null)
    if (!href) {
      test.skip(true, '게시글 상세 링크를 찾지 못함')
      return
    }
    const b = await measure(page, client, 'post-detail', href)
    console.log('LOWEND_BASELINE ' + JSON.stringify(b))
    expect(b.status, `${href} HTTP status`).toBeLessThan(400)
  })
})
