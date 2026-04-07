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
  'cto:qa-verify',
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
  'seed:micro': () => import('../seed/micro-scheduler.js').then(() => {}),
  // LOCAL ONLY — run-pipeline.ts는 네이버 크롤링 통합 파이프라인, launchd로 로컬 실행
  // GitHub Actions 실행 불가 (네이버 IP 차단 + headless 탐지). 수동 실행만.
  'cafe_crawler:cafe-pipeline': () => import('../cafe/run-pipeline.js').then(() => {}),
  'cafe_crawler:trend-analysis': () => import('../cafe/trend-analyzer.js').then(() => {}),
  'cafe_crawler:magazine-generate': () => import('../cafe/magazine-generator.js').then(() => {}),
  'cafe_crawler:magazine-morning': () => import('../cafe/magazine-generator.js').then(() => {}),
  'cafe_crawler:magazine-evening': () => import('../cafe/magazine-generator.js').then(() => {}),
  'cafe_crawler:content-curate': () => import('../cafe/content-curator.js').then(() => {}),
  'cafe_crawler:external-crawl': () => import('../cafe/external-crawler.js').then(() => {}),
  'cmo:social-poster': () => import('../cmo/social-poster.js').then(() => {}),
  'cmo:social-metrics': () => import('../cmo/social-metrics.js').then(() => {}),
  'cmo:social-reviewer': () => import('../cmo/social-reviewer.js').then(() => {}),
  'cmo:social-strategy': () => import('../cmo/social-strategy.js').then(() => {}),
  'ceo:morning-sns-briefing': () => import('../ceo/morning-sns-briefing.js').then(() => {}),
  'ceo:approval-reminder': () => import('./approval-reminder.js').then(() => {}),
  'strategist:user-deep-analysis': () => import('../strategist/user-deep-analysis.js').then(() => {}),
  'cmo:caregiving-curator': () => import('../cmo/caregiving-curator.js').then(() => {}),
  'cmo:health-anxiety-responder': () => import('../cmo/health-anxiety-responder.js').then(() => {}),
  'cmo:humor-curator': () => import('../cmo/humor-curator.js').then(() => {}),
  'cmo:content-gap-finder': () => import('../cmo/content-gap-finder.js').then(() => {}),
  'cmo:band-manager': () => import('../cmo/band-manager.js').then(() => {}),
  'cmo:source-expander': () => import('../cmo/source-expander.js').then(() => {}),
  'coo:connection-facilitator': () => import('../coo/connection-facilitator.js').then(() => {}),
  'coo:job-matcher': () => import('../coo/job-matcher.js').then(() => {}),
  'coo:comment-activator': () => import('../coo/comment-activator.js').then(() => {}),
  'coo:reply-chain-driver': () => import('../coo/reply-chain-driver.js').then(() => {}),
  'cto:crawler-health': () => import('../cto/crawler-health.js').then(() => {}),
  'cpo:persona-diversity-checker': () => import('../cpo/persona-diversity-checker.js').then(() => {}),
  'cdo:engagement-optimizer': () => import('../cdo/engagement-optimizer.js').then(() => {}),
  'cto:qa-verify': () => import('../cto/qa-verifier.js').then(() => {}),
  // CTO 주간 아키텍처 리뷰 (월요일 07:00 KST)
  'cto:arch-review': () => import('../cto/arch-review.js').then(() => {}),
  // QA 에이전트 — 콘텐츠 품질 감사 (매일 08:20 KST)
  'qa:content-audit': () => import('../qa/content-audit.js').then(() => {}),
  'community:sheet-scrape': () => import('../community/sheet-scraper.js').then(() => {}),
  'cmo:channel-seeder': () => import('../cmo/channel-seeder.js').then(() => {}),
  'cmo:knowledge-responder': () => import('../cmo/knowledge-responder.js').then(() => {}),
  'cmo:seo-optimizer': () => import('../cmo/seo-optimizer.js').then(() => {}),
  'cmo:social-poster-visual': () => import('../cmo/social-poster-visual.js').then(() => {}),
  'cmo:threads-token-refresh': () => import('../cmo/platforms/threads-token-refresh.js').then(() => {}),
  'cmo:jisik-answerer': () => import('../cmo/jisik-answerer.js').then(() => {}),
  // DISPATCH ONLY — 로컬 전용 (네이버 IP 차단 + headless 탐지)
  // 실행: npx tsx agents/cmo/jisik-answerer.ts

  // Design 에이전트 (LOCAL ONLY — Gemini API + Playwright)
  // LOCAL ONLY — 이미지 생성 비용 발생, 인터랙티브 세션 전용
  'design:ads-loop': () => import('../marketing-loop/creative-optimizer.js').then(() => {}),
  // QA 2-Gate 시스템
  // DISPATCH ONLY — Gate 1은 /done 스킬에서 자동 실행, 독립 실행 시에만 이 핸들러 사용
  'qa:code-gate': () => import('../qa/pre-deploy-gate.js').then(() => {}),
  // Gate 2: post-deploy-qa.yml에서 자동 실행 (Vercel 배포 완료 후)
  'qa:deploy-audit': () => import('../qa/post-deploy.js').then(() => {}),
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
