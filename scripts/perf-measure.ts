import { config as loadEnv } from 'dotenv'

loadEnv({ path: '.env.local' })

const DEFAULT_BASE_URL = 'https://age-doesnt-matter.com'
const PATHS = ['/', '/community/stories', '/best', '/magazine', '/jobs', '/login'] as const

type AuditRef = {
  score?: number | null
  numericValue?: number
  displayValue?: string
  details?: unknown
}

type LighthouseResponse = {
  lighthouseResult?: {
    finalUrl?: string
    categories?: {
      performance?: { score?: number | null }
    }
    audits?: Record<string, AuditRef | undefined>
  }
}

type UnusedJsItem = {
  url: string
  wastedBytes: number
  wastedPercent?: number
}

type PageResult = {
  path: string
  url: string
  score: number | null
  fcpMs: number | null
  lcpMs: number | null
  tbtMs: number | null
  cls: number | null
  lcpElement: string
  unusedJs: UnusedJsItem[]
}

function argValue(name: string): string | undefined {
  const prefix = `${name}=`
  const match = process.argv.find((arg) => arg.startsWith(prefix))
  return match ? match.slice(prefix.length) : undefined
}

function numberOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function textOrFallback(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim().length > 0 ? value : fallback
}

function getDetailsItems(details: unknown): unknown[] {
  if (!details || typeof details !== 'object') return []
  const items = (details as { items?: unknown }).items
  return Array.isArray(items) ? items : []
}

function getLcpElement(audit: AuditRef | undefined): string {
  const item = getDetailsItems(audit?.details)[0]
  if (!item || typeof item !== 'object') return '-'
  const node = (item as { node?: unknown }).node
  if (!node || typeof node !== 'object') return '-'
  const selector = textOrFallback((node as { selector?: unknown }).selector, '')
  const snippet = textOrFallback((node as { snippet?: unknown }).snippet, '')
  return selector || snippet || '-'
}

function getUnusedJs(audit: AuditRef | undefined): UnusedJsItem[] {
  return getDetailsItems(audit?.details)
    .map((item) => {
      if (!item || typeof item !== 'object') return null
      const row = item as { url?: unknown; wastedBytes?: unknown; wastedPercent?: unknown }
      const url = textOrFallback(row.url, '')
      const wastedBytes = numberOrNull(row.wastedBytes)
      if (!url || wastedBytes == null) return null
      return {
        url,
        wastedBytes,
        wastedPercent: numberOrNull(row.wastedPercent) ?? undefined,
      }
    })
    .filter((item): item is UnusedJsItem => item !== null)
    .sort((a, b) => b.wastedBytes - a.wastedBytes)
    .slice(0, 5)
}

function buildUrl(baseUrl: string, path: string): string {
  return new URL(path, baseUrl).toString()
}

function formatMs(value: number | null): string {
  return value == null ? '-' : `${Math.round(value)}ms`
}

function formatScore(value: number | null): string {
  return value == null ? '-' : String(Math.round(value))
}

function formatCls(value: number | null): string {
  return value == null ? '-' : value.toFixed(3)
}

function formatBytes(value: number): string {
  if (value >= 1024 * 1024) return `${(value / 1024 / 1024).toFixed(1)}MB`
  return `${Math.round(value / 1024)}KB`
}

async function measurePage(path: string, baseUrl: string, apiKey: string): Promise<PageResult> {
  const targetUrl = buildUrl(baseUrl, path)
  const apiUrl = new URL('https://www.googleapis.com/pagespeedonline/v5/runPagespeed')
  apiUrl.searchParams.set('url', targetUrl)
  apiUrl.searchParams.set('strategy', 'mobile')
  apiUrl.searchParams.append('category', 'performance')
  apiUrl.searchParams.set('key', apiKey)

  const response = await fetch(apiUrl)
  if (!response.ok) {
    const body = await response.text().catch(() => '')
    throw new Error(`PSI failed for ${targetUrl}: ${response.status} ${body.slice(0, 300)}`)
  }

  const data = await response.json() as LighthouseResponse
  const audits = data.lighthouseResult?.audits ?? {}
  const scoreRaw = data.lighthouseResult?.categories?.performance?.score

  return {
    path,
    url: data.lighthouseResult?.finalUrl ?? targetUrl,
    score: typeof scoreRaw === 'number' ? scoreRaw * 100 : null,
    fcpMs: numberOrNull(audits['first-contentful-paint']?.numericValue),
    lcpMs: numberOrNull(audits['largest-contentful-paint']?.numericValue),
    tbtMs: numberOrNull(audits['total-blocking-time']?.numericValue),
    cls: numberOrNull(audits['cumulative-layout-shift']?.numericValue),
    lcpElement: getLcpElement(audits['largest-contentful-paint-element']),
    unusedJs: getUnusedJs(audits['unused-javascript']),
  }
}

async function main() {
  const apiKey = process.env.PSI_API_KEY
  if (!apiKey) {
    throw new Error('PSI_API_KEY is missing. Add it to .env.local before running scripts/perf-measure.ts.')
  }

  const baseUrl = argValue('--base-url') ?? process.env.NEXT_PUBLIC_APP_URL ?? DEFAULT_BASE_URL
  const results: PageResult[] = []

  for (const path of PATHS) {
    process.stderr.write(`[perf] measuring ${path}\n`)
    results.push(await measurePage(path, baseUrl, apiKey))
  }

  console.table(results.map((result) => ({
    path: result.path,
    score: formatScore(result.score),
    FCP: formatMs(result.fcpMs),
    LCP: formatMs(result.lcpMs),
    TBT: formatMs(result.tbtMs),
    CLS: formatCls(result.cls),
  })))

  for (const result of results) {
    console.log(`\n## ${result.path}`)
    console.log(`LCP element: ${result.lcpElement}`)
    if (result.unusedJs.length === 0) {
      console.log('Unused JS: -')
      continue
    }
    console.log('Unused JS:')
    for (const item of result.unusedJs) {
      const percent = item.wastedPercent == null ? '' : ` (${Math.round(item.wastedPercent)}%)`
      console.log(`- ${formatBytes(item.wastedBytes)}${percent} ${item.url}`)
    }
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
