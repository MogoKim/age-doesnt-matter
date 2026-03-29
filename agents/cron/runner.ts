import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { parse as parseYaml } from 'yaml'
import { disconnect } from '../core/db.js'
import { waitForDependencies } from './dependencies.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

/**
 * Cron Runner — GitHub Actions에서 호출
 * 사용법: tsx cron/runner.ts <agent> <task>
 * 예시: tsx cron/runner.ts CTO health-check
 *
 * automation_status 체크:
 * - ACTIVE: 모든 핸들러 실행
 * - LOCKED: CTO health-check/error-monitor, CDO anomaly-detector만 실행 (모니터링 유지)
 */

/** 모니터링 전용 태스크 — LOCKED 상태에서도 실행 */
const MONITORING_TASKS = new Set([
  'cto:health-check',
  'cto:error-monitor',
  'cto:security-audit',
  'cdo:anomaly-detector',
])

const HANDLERS: Record<string, () => Promise<void>> = {
  'ceo:morning-cycle': () => import('../ceo/morning-cycle.js').then(() => {}),
  'ceo:weekly-report': () => import('../ceo/weekly-report.js').then(() => {}),
  'cto:health-check': () => import('../cto/health-check.js').then(() => {}),
  'cto:error-monitor': () => import('../cto/error-monitor.js').then(() => {}),
  'cto:security-audit': () => import('../cto/security-audit.js').then(() => {}),
  'cmo:trend-analyzer': () => import('../cmo/trend-analyzer.js').then(() => {}),
  'cpo:ux-analyzer': () => import('../cpo/ux-analyzer.js').then(() => {}),
  'cpo:feature-tracker': () => import('../cpo/feature-tracker.js').then(() => {}),
  'cpo:journey-analyzer': () => import('../cpo/journey-analyzer.js').then(() => {}),
  'cfo:cost-tracker': () => import('../cfo/cost-tracker.js').then(() => {}),
  'cfo:revenue-tracker': () => import('../cfo/revenue-tracker.js').then(() => {}),
  'coo:moderator': () => import('../coo/moderator.js').then(() => {}),
  'coo:content-scheduler': () => import('../coo/content-scheduler.js').then(() => {}),
  'coo:job-scraper': () => import('../coo/job-scraper.js').then(() => {}),
  'coo:trending-scorer': () => import('../coo/trending-scorer.js').then(() => {}),
  'cdo:kpi-collector': () => import('../cdo/kpi-collector.js').then(() => {}),
  'cdo:anomaly-detector': () => import('../cdo/anomaly-detector.js').then(() => {}),
  'seed:scheduler': () => import('../seed/scheduler.js').then(() => {}),
  'cafe_crawler:cafe-pipeline': () => import('../cafe/run-pipeline.js').then(() => {}),
  'cafe_crawler:trend-analysis': () => import('../cafe/trend-analyzer.js').then(() => {}),
  'cafe_crawler:magazine-generate': () => import('../cafe/magazine-generator.js').then(() => {}),
  'cafe_crawler:content-curate': () => import('../cafe/content-curator.js').then(() => {}),
  'cmo:social-poster': () => import('../cmo/social-poster.js').then(() => {}),
  'cmo:social-metrics': () => import('../cmo/social-metrics.js').then(() => {}),
  'cmo:social-reviewer': () => import('../cmo/social-reviewer.js').then(() => {}),
  'cmo:social-strategy': () => import('../cmo/social-strategy.js').then(() => {}),
  'ceo:morning-sns-briefing': () => import('../ceo/morning-sns-briefing.js').then(() => {}),
  'ceo:approval-reminder': () => import('./approval-reminder.js').then(() => {}),
}

function getAutomationStatus(): string {
  try {
    const raw = readFileSync(resolve(__dirname, '../core/constitution.yaml'), 'utf-8')
    const doc = parseYaml(raw) as Record<string, unknown>
    return String(doc.automation_status ?? 'LOCKED')
  } catch {
    console.error('[Runner] constitution.yaml 읽기 실패 — 안전 모드(LOCKED) 적용')
    return 'LOCKED'
  }
}

async function main() {
  const [agent, task] = process.argv.slice(2)

  if (!agent || !task) {
    console.log('사용법: tsx cron/runner.ts <agent> <task>')
    console.log('가능한 핸들러:', Object.keys(HANDLERS).join(', '))
    process.exit(1)
  }

  const key = `${agent.toLowerCase()}:${task}`
  const handler = HANDLERS[key]

  if (!handler) {
    console.error(`알 수 없는 핸들러: ${key}`)
    console.log('가능한 핸들러:', Object.keys(HANDLERS).join(', '))
    process.exit(1)
  }

  // automation_status 체크
  const status = getAutomationStatus()
  if (status !== 'ACTIVE' && !MONITORING_TASKS.has(key)) {
    console.log(`[Runner] automation_status=${status} — ${key} 실행 스킵 (모니터링 태스크만 허용)`)
    await disconnect()
    process.exit(0)
  }

  // 의존성 체크
  const depsOk = await waitForDependencies(key)
  if (!depsOk) {
    console.log(`[Runner] ${key}: 선행 작업 미완료 — 스킵`)
    await disconnect()
    process.exit(0)
  }

  console.log(`[Runner] ${agent}:${task} 시작 (automation_status=${status})`)
  try {
    await handler()
  } catch (err) {
    console.error(`[Runner] ${agent}:${task} 실패:`, err)
    process.exit(1)
  } finally {
    await disconnect()
  }
}

main()
