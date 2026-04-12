import type { Metadata } from 'next'
import * as fs from 'fs'
import * as path from 'path'

export const metadata: Metadata = {
  title: '우나어 — QA 감사 리포트',
  robots: 'noindex, nofollow',
}

// ─── 타입 ──────────────────────────────────────────────────────────────────────

interface PageAuditResult {
  url: string
  label: string
  httpStatus: number
  consoleErrors: string[]
  performance: { fcp: number; lcp: number; cls: number; ttfb: number; domLoadTime: number }
  hasH1: boolean
  h1Text: string
  ogTitle: string
  ogDescription: string
  ogImage: string
  canonicalUrl: string
  imagesMissingAlt: number
  issues: { level: 'FAIL' | 'WARN'; message: string }[]
}

interface JourneyResult {
  journey: string
  steps: { step: string; durationMs: number; status: 'OK' | 'WARN' | 'FAIL'; issue: string | null }[]
  totalDurationMs: number
  issueCount: number
}

interface UxWritingReport {
  generatedAt: string
  summary: {
    forbiddenWordFails: number
    ctaInconsistencies: string[]
    emptyStateMissing: string[]
    accessibilityWarnings: number
  }
  forbiddenWords: { page: string; label: string; word: string; context: string }[]
  ctaTexts: { page: string; label: string; type: string; text: string }[]
  accessibility: { page: string; label: string; smallTouchTargets: { selector: string; width: number; height: number }[]; smallFontElements: { selector: string; fontSize: number; text: string }[] }[]
}

// ─── 데이터 읽기 ───────────────────────────────────────────────────────────────

const PAGE_ORDER = ['/', '/about', '/grade', '/contact', '/terms', '/privacy', '/rules', '/faq', '/search', '/best', '/community', '/magazine', '/jobs', '/login']

function readPageResults(): PageAuditResult[] {
  const dir = path.join(process.cwd(), 'assets/qa-report/pages-18')
  try {
    const files = fs.readdirSync(dir).filter((f) => f.endsWith('.json'))
    const results = files.map((f) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf-8')) as PageAuditResult)
    results.sort((a, b) => PAGE_ORDER.indexOf(a.url) - PAGE_ORDER.indexOf(b.url))
    return results
  } catch { return [] }
}

function readJourneyResults(): JourneyResult[] {
  const dir = path.join(process.cwd(), 'assets/qa-report/journeys-19')
  try {
    const files = fs.readdirSync(dir).filter((f) => f.endsWith('.json'))
    return files.map((f) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf-8')) as JourneyResult)
  } catch { return [] }
}

function readUxReport(): UxWritingReport | null {
  try {
    return JSON.parse(fs.readFileSync(path.join(process.cwd(), 'assets/qa-report/20-ux-writing-result.json'), 'utf-8'))
  } catch { return null }
}

// ─── 헬퍼 컴포넌트 ─────────────────────────────────────────────────────────────

function LevelBadge({ level }: { level: 'FAIL' | 'WARN' | 'OK' | 'INFO' }) {
  const styles = {
    FAIL: 'bg-red-100 text-red-700 border border-red-200',
    WARN: 'bg-amber-100 text-amber-700 border border-amber-200',
    OK: 'bg-green-100 text-green-700 border border-green-200',
    INFO: 'bg-blue-100 text-blue-700 border border-blue-200',
  }
  const labels = { FAIL: '❌ FAIL', WARN: '⚠️ WARN', OK: '✅ OK', INFO: 'ℹ️ INFO' }
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold ${styles[level]}`}>
      {labels[level]}
    </span>
  )
}

function Metric({ label, value, warn, fail }: { label: string; value: number; warn?: number; fail?: number }) {
  const isMs = ['FCP', 'LCP', 'TTFB', 'DOM'].some((k) => label.includes(k))
  const display = isMs ? `${(value / 1000).toFixed(1)}s` : value.toFixed(label === 'CLS' ? 3 : 0)
  const color =
    fail !== undefined && value > fail ? 'text-red-600 font-bold' :
    warn !== undefined && value > warn ? 'text-amber-600 font-semibold' :
    'text-green-700'
  return (
    <div className="flex flex-col items-center">
      <span className={`text-sm font-mono ${color}`}>{display}</span>
      <span className="text-xs text-gray-400">{label}</span>
    </div>
  )
}

function SectionHeader({ title, count, failCount, warnCount }: { title: string; count: number; failCount: number; warnCount: number }) {
  return (
    <div className="flex items-center gap-3 mb-4">
      <h2 className="text-xl font-bold text-gray-800">{title}</h2>
      <span className="text-sm text-gray-500">{count}개</span>
      {failCount > 0 && <span className="text-sm font-semibold text-red-600">❌ {failCount} FAIL</span>}
      {warnCount > 0 && <span className="text-sm font-semibold text-amber-600">⚠️ {warnCount} WARN</span>}
      {failCount === 0 && warnCount === 0 && count > 0 && <span className="text-sm text-green-600">✅ 이슈 없음</span>}
    </div>
  )
}

function NoData({ cmd }: { cmd: string }) {
  return (
    <div className="bg-gray-50 border border-dashed border-gray-300 rounded-xl p-8 text-center text-gray-400">
      <p className="text-sm mt-2">QA 감사를 먼저 실행하세요: <code className="bg-gray-100 px-1 rounded">{cmd}</code></p>
    </div>
  )
}

// ─── 섹션 1: 페이지 감사 ───────────────────────────────────────────────────────

function PageAuditSection({ data }: { data: PageAuditResult[] }) {
  if (data.length === 0) return <NoData cmd="npx playwright test --project=qa-audit e2e/qa/18-full-page-audit.spec.ts --workers=1" />

  const totalFail = data.flatMap((r) => r.issues).filter((i) => i.level === 'FAIL').length
  const totalWarn = data.flatMap((r) => r.issues).filter((i) => i.level === 'WARN').length

  return (
    <section className="mb-12">
      <SectionHeader title="페이지 렌더링 + 성능 감사" count={data.length} failCount={totalFail} warnCount={totalWarn} />
      <div className="space-y-3">
        {data.map((page) => {
          const failIssues = page.issues.filter((i) => i.level === 'FAIL')
          const warnIssues = page.issues.filter((i) => i.level === 'WARN')
          const rowBg = failIssues.length > 0 ? 'border-red-200 bg-red-50' : warnIssues.length > 0 ? 'border-amber-200 bg-amber-50' : 'border-gray-200 bg-white'

          return (
            <div key={page.url} className={`border rounded-xl p-4 ${rowBg}`}>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-gray-800">{page.label}</span>
                  <code className="text-xs text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">{page.url}</code>
                  <span className={`text-xs px-1.5 py-0.5 rounded font-mono ${page.httpStatus === 200 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                    HTTP {page.httpStatus}
                  </span>
                </div>
                <div className="flex gap-2 shrink-0">
                  {failIssues.length > 0 && <LevelBadge level="FAIL" />}
                  {failIssues.length === 0 && warnIssues.length > 0 && <LevelBadge level="WARN" />}
                  {failIssues.length === 0 && warnIssues.length === 0 && <LevelBadge level="OK" />}
                </div>
              </div>

              <div className="flex gap-5 mb-3 py-2 px-3 bg-white/70 rounded-lg border border-gray-100 flex-wrap">
                <Metric label="FCP" value={page.performance.fcp} warn={3000} />
                <Metric label="LCP" value={page.performance.lcp} warn={2500} fail={4000} />
                <Metric label="CLS" value={page.performance.cls} warn={0.1} fail={0.25} />
                <Metric label="TTFB" value={page.performance.ttfb} warn={2000} />
                <Metric label="DOM" value={page.performance.domLoadTime} />
                <div className="flex flex-col items-center">
                  <span className={`text-sm font-mono ${page.hasH1 ? 'text-green-700' : 'text-amber-600 font-bold'}`}>{page.hasH1 ? '✓' : '✗'}</span>
                  <span className="text-xs text-gray-400">H1</span>
                </div>
                <div className="flex flex-col items-center">
                  <span className={`text-sm font-mono ${page.ogTitle ? 'text-green-700' : 'text-amber-600'}`}>{page.ogTitle ? '✓' : '✗'}</span>
                  <span className="text-xs text-gray-400">OG</span>
                </div>
                <div className="flex flex-col items-center">
                  <span className={`text-sm font-mono ${page.imagesMissingAlt === 0 ? 'text-green-700' : 'text-amber-600 font-bold'}`}>{page.imagesMissingAlt}</span>
                  <span className="text-xs text-gray-400">alt 누락</span>
                </div>
              </div>

              {page.issues.length > 0 && (
                <div className="space-y-1">
                  {page.issues.map((issue, i) => (
                    <div key={i} className={`text-sm px-2 py-1 rounded ${issue.level === 'FAIL' ? 'text-red-700 bg-red-100' : 'text-amber-700 bg-amber-100'}`}>
                      {issue.level === 'FAIL' ? '❌' : '⚠️'} {issue.message}
                    </div>
                  ))}
                </div>
              )}

              {page.consoleErrors.length > 0 && (
                <div className="mt-2 space-y-1">
                  {page.consoleErrors.slice(0, 2).map((err, i) => (
                    <div key={i} className="text-xs text-red-600 bg-red-50 px-2 py-1 rounded font-mono truncate">{err}</div>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </section>
  )
}

// ─── 섹션 2: 고객 여정 ─────────────────────────────────────────────────────────

function JourneySection({ data }: { data: JourneyResult[] }) {
  if (data.length === 0) return <NoData cmd="npx playwright test --project=qa-audit e2e/qa/19-user-journey-audit.spec.ts --workers=1" />

  const totalFail = data.flatMap((r) => r.steps).filter((s) => s.status === 'FAIL').length
  const totalWarn = data.flatMap((r) => r.steps).filter((s) => s.status === 'WARN').length

  return (
    <section className="mb-12">
      <SectionHeader title="고객 여정 병목 감사" count={data.length} failCount={totalFail} warnCount={totalWarn} />
      <div className="space-y-4">
        {data.map((journey) => {
          const failSteps = journey.steps.filter((s) => s.status === 'FAIL')
          const warnSteps = journey.steps.filter((s) => s.status === 'WARN')
          const rowBg = failSteps.length > 0 ? 'border-red-200 bg-red-50' : warnSteps.length > 0 ? 'border-amber-200 bg-amber-50' : 'border-gray-200 bg-white'

          return (
            <div key={journey.journey} className={`border rounded-xl p-4 ${rowBg}`}>
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h3 className="font-semibold text-gray-800">{journey.journey}</h3>
                  <span className="text-xs text-gray-400">총 {(journey.totalDurationMs / 1000).toFixed(1)}s · {journey.steps.length}단계</span>
                </div>
                <div className="flex gap-2">
                  {failSteps.length > 0 && <LevelBadge level="FAIL" />}
                  {failSteps.length === 0 && warnSteps.length > 0 && <LevelBadge level="WARN" />}
                  {failSteps.length === 0 && warnSteps.length === 0 && <LevelBadge level="OK" />}
                </div>
              </div>

              <div className="space-y-1">
                {journey.steps.map((step, i) => (
                  <div key={i} className="flex items-start gap-3 text-sm">
                    <div className={`w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 ${step.status === 'FAIL' ? 'bg-red-500' : step.status === 'WARN' ? 'bg-amber-500' : 'bg-green-500'}`} />
                    <span className="text-gray-700 flex-1">{step.step}</span>
                    <span className="font-mono text-xs text-gray-400 shrink-0">{step.durationMs}ms</span>
                    {step.issue && (
                      <span className={`text-xs px-1.5 py-0.5 rounded shrink-0 max-w-xs truncate ${step.status === 'FAIL' ? 'text-red-700 bg-red-100' : 'text-amber-700 bg-amber-100'}`}>
                        {step.issue}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}

// ─── 섹션 3: UX 라이팅 ─────────────────────────────────────────────────────────

function UxWritingSection({ data }: { data: UxWritingReport | null }) {
  if (!data) return <NoData cmd="npx playwright test --project=qa-audit e2e/qa/20-ux-writing-audit.spec.ts --workers=1" />

  const { summary, forbiddenWords, ctaTexts, accessibility } = data

  const ctaByType: Record<string, Set<string>> = {}
  for (const cta of ctaTexts) {
    if (!ctaByType[cta.type]) ctaByType[cta.type] = new Set()
    ctaByType[cta.type].add(cta.text)
  }

  const totalA11yWarns = accessibility.reduce((sum, a) => sum + a.smallTouchTargets.length + a.smallFontElements.length, 0)

  return (
    <section className="mb-12">
      <SectionHeader title="UX 라이팅 + 접근성 감사" count={accessibility.length} failCount={summary.forbiddenWordFails} warnCount={summary.ctaInconsistencies.length + totalA11yWarns} />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        <div className="border rounded-xl p-4 bg-white">
          <h3 className="font-semibold text-gray-700 mb-3 flex items-center gap-2">
            <span>금지어 스캔</span>
            {summary.forbiddenWordFails > 0 ? <span className="text-red-600 text-sm">❌ {summary.forbiddenWordFails}건</span> : <span className="text-green-600 text-sm">✅ 없음</span>}
          </h3>
          {forbiddenWords.length > 0 ? (
            <div className="space-y-2">
              {forbiddenWords.map((hit, i) => (
                <div key={i} className="text-sm p-2 bg-red-50 rounded border border-red-100">
                  <div className="font-semibold text-red-700">"{hit.word}"</div>
                  <div className="text-gray-500 text-xs mt-0.5">{hit.label} ({hit.page})</div>
                  <div className="text-gray-400 text-xs italic">{hit.context}</div>
                </div>
              ))}
            </div>
          ) : <p className="text-sm text-gray-400">발견된 금지어 없음</p>}
        </div>

        <div className="border rounded-xl p-4 bg-white">
          <h3 className="font-semibold text-gray-700 mb-3 flex items-center gap-2">
            <span>CTA 문구 현황</span>
            {summary.ctaInconsistencies.length > 0 ? <span className="text-amber-600 text-sm">⚠️ {summary.ctaInconsistencies.length}건</span> : <span className="text-green-600 text-sm">✅ 일관</span>}
          </h3>
          <div className="space-y-2">
            {Object.entries(ctaByType).map(([type, texts]) => (
              <div key={type} className="text-sm">
                <span className="text-gray-400 text-xs uppercase tracking-wide">{type}</span>
                <div className="flex flex-wrap gap-1 mt-1">
                  {[...texts].map((t, i) => <span key={i} className="bg-gray-100 text-gray-700 px-2 py-0.5 rounded text-xs">{t}</span>)}
                </div>
              </div>
            ))}
          </div>
          {summary.ctaInconsistencies.map((inc, i) => (
            <div key={i} className="text-xs text-amber-700 bg-amber-50 p-2 rounded mt-2">{inc}</div>
          ))}
        </div>
      </div>

      <div className="border rounded-xl p-4 bg-white">
        <h3 className="font-semibold text-gray-700 mb-3 flex items-center gap-2">
          <span>접근성 샘플링 (터치타겟 52px / 폰트 15px)</span>
          {totalA11yWarns > 0 ? <span className="text-amber-600 text-sm">⚠️ {totalA11yWarns}건</span> : <span className="text-green-600 text-sm">✅ 이상 없음</span>}
        </h3>
        <div className="space-y-3">
          {accessibility.filter((a) => a.smallTouchTargets.length > 0 || a.smallFontElements.length > 0).map((a, i) => (
            <div key={i} className="border-l-2 border-amber-300 pl-3">
              <div className="font-medium text-sm text-gray-700 mb-1">{a.label} <span className="text-gray-400 font-normal">({a.page})</span></div>
              {a.smallTouchTargets.length > 0 && (
                <div className="text-xs text-amber-700 mb-1">
                  터치타겟 52px 미만 {a.smallTouchTargets.length}개:
                  {a.smallTouchTargets.slice(0, 3).map((t, j) => (
                    <span key={j} className="ml-1 bg-amber-50 px-1 rounded">{t.selector} ({t.width}×{t.height}px)</span>
                  ))}
                </div>
              )}
              {a.smallFontElements.length > 0 && (
                <div className="text-xs text-amber-700">
                  폰트 15px 미만 {a.smallFontElements.length}개:
                  {a.smallFontElements.slice(0, 3).map((f, j) => (
                    <span key={j} className="ml-1 bg-amber-50 px-1 rounded">{f.fontSize}px "{f.text}"</span>
                  ))}
                </div>
              )}
            </div>
          ))}
          {accessibility.filter((a) => a.smallTouchTargets.length > 0 || a.smallFontElements.length > 0).length === 0 && (
            <p className="text-sm text-gray-400">접근성 경고 없음</p>
          )}
        </div>
      </div>
    </section>
  )
}

// ─── 페이지 ────────────────────────────────────────────────────────────────────

export default function QaReportPage() {
  const pageData = readPageResults()
  const journeyData = readJourneyResults()
  const uxData = readUxReport()

  const hasAnyData = pageData.length > 0 || journeyData.length > 0 || uxData !== null

  const totalFail =
    pageData.flatMap((r) => r.issues).filter((i) => i.level === 'FAIL').length +
    journeyData.flatMap((r) => r.steps).filter((s) => s.status === 'FAIL').length +
    (uxData?.summary.forbiddenWordFails ?? 0)

  const totalWarn =
    pageData.flatMap((r) => r.issues).filter((i) => i.level === 'WARN').length +
    journeyData.flatMap((r) => r.steps).filter((s) => s.status === 'WARN').length +
    (uxData?.summary.accessibilityWarnings ?? 0)

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold text-gray-900">우나어 QA 감사 리포트</h1>
            <p className="text-xs text-gray-400">age-doesnt-matter.com — 발견(Discovery) 전용</p>
          </div>
          {hasAnyData && (
            <div className="flex items-center gap-4 text-sm">
              <span className="text-red-600 font-semibold">❌ FAIL {totalFail}</span>
              <span className="text-amber-600 font-semibold">⚠️ WARN {totalWarn}</span>
            </div>
          )}
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 py-8">
        {!hasAnyData && (
          <div className="bg-white border border-dashed border-gray-300 rounded-2xl p-12 text-center">
            <p className="text-lg font-semibold text-gray-700 mb-2">QA 감사 결과 없음</p>
            <p className="text-sm text-gray-500 mb-4">아직 감사를 실행하지 않았습니다.</p>
            <code className="text-sm bg-gray-100 text-gray-700 px-3 py-2 rounded block max-w-sm mx-auto">npm run qa:audit</code>
          </div>
        )}

        {hasAnyData && (
          <div className="flex gap-3 mb-8 flex-wrap">
            {pageData.length > 0 && <a href="#page-audit" className="px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm font-medium hover:bg-gray-50">📊 페이지 감사 ({pageData.length})</a>}
            {journeyData.length > 0 && <a href="#journey-audit" className="px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm font-medium hover:bg-gray-50">🛤️ 여정 감사 ({journeyData.length})</a>}
            {uxData && <a href="#ux-audit" className="px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm font-medium hover:bg-gray-50">✍️ UX 라이팅</a>}
          </div>
        )}

        <div id="page-audit"><PageAuditSection data={pageData} /></div>
        <div id="journey-audit"><JourneySection data={journeyData} /></div>
        <div id="ux-audit"><UxWritingSection data={uxData} /></div>
      </div>
    </div>
  )
}
