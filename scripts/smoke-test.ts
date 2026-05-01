#!/usr/bin/env tsx
/**
 * Smoke Test — 프로덕션 URL 대상 fetch 기반 헬스 체크
 * 사용법: npx tsx scripts/smoke-test.ts --url https://age-doesnt-matter.com
 */

import { execSync } from 'child_process'

const DEFAULT_URL = 'https://age-doesnt-matter.com'

interface CheckResult {
  name: string
  pass: boolean
  detail: string
}

interface SmokeReport {
  version: string
  url: string
  timestamp: string
  passed: number
  failed: number
  checks: CheckResult[]
}

function parseArgs(): string {
  const idx = process.argv.indexOf('--url')
  return idx !== -1 && process.argv[idx + 1] ? process.argv[idx + 1] : DEFAULT_URL
}

function getVersion(): string {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '.')
  try {
    const sha = execSync('git rev-parse --short HEAD', { encoding: 'utf-8' }).trim()
    return `${date}-${sha}`
  } catch {
    return date
  }
}

async function timedFetch(url: string): Promise<{ res: Response; ms: number }> {
  const start = Date.now()
  const res = await fetch(url, { redirect: 'follow' })
  return { res, ms: Date.now() - start }
}

async function checkPage(url: string, path: string, name: string): Promise<{ check: CheckResult; body?: string }> {
  try {
    const { res, ms } = await timedFetch(`${url}${path}`)
    const pass = res.status === 200
    const body = pass ? await res.text() : undefined
    return {
      check: { name, pass, detail: pass ? `200 OK (${ms}ms)` : `HTTP ${res.status} (${ms}ms)` },
      body,
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return { check: { name, pass: false, detail: `요청 실패: ${msg}` } }
  }
}

async function checkHealthApi(url: string): Promise<CheckResult> {
  try {
    const { res, ms } = await timedFetch(`${url}/api/health`)
    if (res.status !== 200) return { name: 'Health API', pass: false, detail: `HTTP ${res.status} (${ms}ms)` }
    const json = (await res.json()) as Record<string, unknown>
    const pass = json.status === 'healthy' && typeof json.version === 'string'
    return { name: 'Health API', pass, detail: pass ? `healthy, v${json.version} (${ms}ms)` : `status=${String(json.status)}, version=${String(json.version ?? 'missing')}` }
  } catch (e) {
    return { name: 'Health API', pass: false, detail: `요청 실패: ${e instanceof Error ? e.message : String(e)}` }
  }
}

function checkHtml(html: string, pattern: string | RegExp, name: string, failMsg: string): CheckResult {
  const found = typeof pattern === 'string' ? html.includes(pattern) : pattern.test(html)
  return { name, pass: found, detail: found ? '발견됨' : failMsg }
}

async function checkEventsApi(url: string): Promise<CheckResult> {
  try {
    const start = Date.now()
    const res = await fetch(`${url}/api/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ eventName: 'smoke_test', path: '/smoke' }),
    })
    const ms = Date.now() - start
    const pass = res.status === 200
    return { name: '/api/events 이벤트 로깅', pass, detail: pass ? `200 OK (${ms}ms)` : `HTTP ${res.status} (${ms}ms)` }
  } catch (e) {
    return { name: '/api/events 이벤트 로깅', pass: false, detail: `요청 실패: ${e instanceof Error ? e.message : String(e)}` }
  }
}

async function main() {
  const url = parseArgs()
  const version = getVersion()
  const checks: CheckResult[] = []

  // 1-4: 페이지 응답 체크 (홈은 HTML 재사용)
  const pages: Array<[string, string]> = [
    ['/', '홈페이지 응답'],
    ['/best', '베스트 페이지'],
    ['/jobs', '일자리 페이지'],
    ['/magazine', '매거진 페이지'],
  ]

  const pageResults = await Promise.all(pages.map(([path, name]) => checkPage(url, path, name)))
  const homeHtml = pageResults[0].body ?? ''

  for (const { check } of pageResults) checks.push(check)

  // 5: Health API
  checks.push(await checkHealthApi(url))

  // 6-8: 홈 HTML 파싱
  checks.push(checkHtml(homeHtml, /<meta[^>]+name=["']google-adsense-account["'][^>]+content=["'][^"']+["']/i, 'AdSense 메타태그', 'google-adsense-account 메타태그 미발견'))
  checks.push(checkHtml(homeHtml, 'adsbygoogle', 'AdSense 광고 슬롯', 'adsbygoogle 클래스 미발견'))
  checks.push(checkHtml(homeHtml, 'link.coupang.com', '쿠팡 배너 이미지', 'coupang 배너 URL 미발견'))

  // 9: /api/events POST 동작 확인 (sessionId 처리 포함)
  checks.push(await checkEventsApi(url))

  const passed = checks.filter((c) => c.pass).length
  const failed = checks.length - passed

  const report: SmokeReport = {
    version,
    url,
    timestamp: new Date().toISOString(),
    passed,
    failed,
    checks,
  }

  console.log(JSON.stringify(report, null, 2))
  process.exit(failed > 0 ? 1 : 0)
}

main()
