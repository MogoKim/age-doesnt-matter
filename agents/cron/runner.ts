import { disconnect } from '../core/db.js'

/**
 * Cron Runner — GitHub Actions에서 호출
 * 사용법: tsx cron/runner.ts <agent> <task>
 * 예시: tsx cron/runner.ts CTO health-check
 */

const HANDLERS: Record<string, () => Promise<void>> = {
  'ceo:morning-cycle': () => import('../ceo/morning-cycle.js').then(() => {}),
  'cto:health-check': () => import('../cto/health-check.js').then(() => {}),
  'cto:error-monitor': () => import('../cto/error-monitor.js').then(() => {}),
  'cmo:trend-analyzer': () => import('../cmo/trend-analyzer.js').then(() => {}),
  'cpo:ux-analyzer': () => import('../cpo/ux-analyzer.js').then(() => {}),
  'cfo:cost-tracker': () => import('../cfo/cost-tracker.js').then(() => {}),
  'coo:moderator': () => import('../coo/moderator.js').then(() => {}),
  'coo:content-scheduler': () => import('../coo/content-scheduler.js').then(() => {}),
  'cdo:kpi-collector': () => import('../cdo/kpi-collector.js').then(() => {}),
  'cdo:anomaly-detector': () => import('../cdo/anomaly-detector.js').then(() => {}),
  'seed:scheduler': () => import('../seed/scheduler.js').then(() => {}),
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

  console.log(`[Runner] ${agent}:${task} 시작`)
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
