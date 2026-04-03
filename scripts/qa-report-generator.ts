/**
 * Playwright JSON 결과 → 우선순위별 버그 리포트 생성
 *
 * 사용법:
 *   npx tsx scripts/qa-report-generator.ts
 *
 * 전제조건: Playwright 실행 후 playwright-report/results.json 존재
 *   E2E_BASE_URL=https://www.age-doesnt-matter.com \
 *   E2E_ADMIN_EMAIL=xxx E2E_ADMIN_PASSWORD=xxx \
 *   npx playwright test e2e/qa/ --reporter=json
 *
 * 출력: docs/qa/bug-report.md
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')
const RESULTS_PATH = resolve(ROOT, 'playwright-report/results.json')
const OUTPUT_DIR = resolve(ROOT, 'docs/qa')
const OUTPUT_PATH = resolve(OUTPUT_DIR, 'bug-report.md')

interface TestResult {
  title: string
  fullTitle?: string
  // Playwright v1.40+ JSON 형식: 'expected' | 'unexpected' | 'skipped' | 'flaky'
  status: 'expected' | 'unexpected' | 'skipped' | 'flaky' | 'passed' | 'failed' | 'timedOut'
  duration?: number
  results?: Array<{
    status: 'passed' | 'failed' | 'timedOut' | 'skipped'
    duration: number
    error?: { message?: string; stack?: string }
  }>
  error?: { message?: string; stack?: string }
  retry?: number
}

interface TestSuite {
  title: string
  file: string
  specs: {
    title: string
    tests: TestResult[]
  }[]
  suites?: TestSuite[]
}

interface PlaywrightReport {
  suites: TestSuite[]
  stats: {
    expected: number
    unexpected: number
    skipped: number
    flaky: number
    duration: number
  }
}

function collectFailures(suite: TestSuite, results: Array<{ file: string; title: string; error: string; duration: number }>) {
  for (const spec of suite.specs ?? []) {
    for (const test of spec.tests ?? []) {
      // Playwright v1.40+: status='unexpected', 이전 버전: status='failed'|'timedOut'
      const isFailed = test.status === 'unexpected' || test.status === 'failed' || test.status === 'timedOut'
      if (isFailed) {
        const firstResult = test.results?.[0]
        const errorMsg =
          firstResult?.error?.message ??
          firstResult?.error?.stack ??
          test.error?.message ??
          test.error?.stack ??
          '알 수 없는 오류'
        const duration = firstResult?.duration ?? test.duration ?? 0
        results.push({
          file: suite.file ?? '',
          title: `${suite.title} > ${spec.title}`,
          error: errorMsg.slice(0, 500),
          duration,
        })
      }
    }
  }
  for (const sub of suite.suites ?? []) {
    collectFailures(sub, results)
  }
}

function classifyPriority(failure: { file: string; title: string; error: string }) {
  const t = failure.title.toLowerCase()
  const e = failure.error.toLowerCase()

  // P0: 완전 불동작 (인증, 핵심 페이지 접근 불가, 500 오류)
  if (
    e.includes('500') ||
    e.includes('login') ||
    t.includes('접근') && e.includes('로그인') ||
    t.includes('대시보드') ||
    t.includes('홈 페이지 렌더링') ||
    e.includes('typeerror') && t.includes('렌더링')
  ) {
    return 'P0'
  }

  // P1: 주요 기능 오류 (404 미처리, 인증 우회, API 500)
  if (
    t.includes('404') ||
    t.includes('리다이렉트') ||
    e.includes('401') && t.includes('공감') ||
    t.includes('api') && e.includes('500') ||
    t.includes('커뮤니티 홈') ||
    t.includes('일자리 목록') ||
    t.includes('매거진 목록')
  ) {
    return 'P1'
  }

  // P2: 부분 기능 오류 (UI 미발견, 비어있는 상태)
  if (
    t.includes('필터') ||
    t.includes('탭') ||
    t.includes('버튼') ||
    t.includes('테이블') ||
    e.includes('count').valueOf()
  ) {
    return 'P2'
  }

  // P3: 나머지 (성능, UX 개선)
  return 'P3'
}

function generateReport(report: PlaywrightReport): string {
  const date = new Date().toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul' })
  const { stats } = report

  const failures: Array<{ file: string; title: string; error: string; duration: number }> = []
  for (const suite of report.suites) {
    collectFailures(suite, failures)
  }

  const total = stats.expected + stats.unexpected + stats.skipped + stats.flaky
  const passed = stats.expected
  const failed = stats.unexpected
  const skipped = stats.skipped

  // 우선순위 분류
  const byPriority: Record<string, typeof failures> = { P0: [], P1: [], P2: [], P3: [] }
  for (const f of failures) {
    const p = classifyPriority(f)
    byPriority[p].push(f)
  }

  const lines: string[] = []
  lines.push(`# QA 버그 리포트 — ${date}`)
  lines.push('')
  lines.push('## 요약')
  lines.push(`| 항목 | 수치 |`)
  lines.push(`|------|------|`)
  lines.push(`| 전체 테스트 | ${total}개 |`)
  lines.push(`| 통과 | ✅ ${passed}개 |`)
  lines.push(`| 실패 | ❌ ${failed}개 |`)
  lines.push(`| Skip | ⏭️ ${skipped}개 |`)
  lines.push(`| 실행 시간 | ${Math.round(stats.duration / 1000)}초 |`)
  lines.push('')

  const priorityLabels: Record<string, string> = {
    P0: 'P0 — 즉시 수정 (기능 완전 불동작)',
    P1: 'P1 — 우선 수정 (주요 기능 오류)',
    P2: 'P2 — 일반 수정 (부분 기능 오류)',
    P3: 'P3 — 개선 (UX/성능)',
  }

  for (const [p, label] of Object.entries(priorityLabels)) {
    const items = byPriority[p]
    lines.push(`## ${label}`)
    lines.push('')
    if (items.length === 0) {
      lines.push('_해당 없음_')
    } else {
      for (const item of items) {
        lines.push(`### ${item.title}`)
        lines.push(`- **파일**: \`${item.file}\``)
        lines.push(`- **오류**: \`\`\``)
        lines.push(item.error)
        lines.push('```')
      }
    }
    lines.push('')
  }

  lines.push('---')
  lines.push('> 자동 생성: `npx tsx scripts/qa-report-generator.ts`')

  return lines.join('\n')
}

function main() {
  if (!existsSync(RESULTS_PATH)) {
    console.error(`[QA-Report] ❌ 결과 파일 없음: ${RESULTS_PATH}`)
    console.error('[QA-Report] 먼저 Playwright를 실행하세요:')
    console.error('  E2E_BASE_URL=https://www.age-doesnt-matter.com npx playwright test e2e/qa/ --reporter=json')
    process.exit(1)
  }

  const raw = readFileSync(RESULTS_PATH, 'utf-8')
  const report = JSON.parse(raw) as PlaywrightReport

  mkdirSync(OUTPUT_DIR, { recursive: true })
  const md = generateReport(report)
  writeFileSync(OUTPUT_PATH, md, 'utf-8')

  console.log(`[QA-Report] ✅ 버그 리포트 생성: ${OUTPUT_PATH}`)

  // 터미널 요약 출력
  const { stats } = report
  console.log(`[QA-Report] 통과: ${stats.expected} / 실패: ${stats.unexpected} / Skip: ${stats.skipped}`)
}

main()
