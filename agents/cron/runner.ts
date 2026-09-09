import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { parse as parseYaml } from 'yaml'
import { prisma, disconnect } from '../core/db.js'
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
  'cafe:session-refresh',  // LOCKED 상태에서도 세션 유지 필수 (크롤러 재가동 보장)
  'cmo:seo-snapshot',      // read-only 관측 — 자동화 중단 중에도 SEO 추이는 계속 봐야 한다
  'coo:moderator',         // 안전 기능(금지어 감지·숨김, 헌법 auto_allowed) — automation_status=PAUSED/LOCKED 에서도 유지 (Rescue R4, 2026-09-05)
])

const HANDLERS: Record<string, () => Promise<void>> = {
  'cto:health-check': () => import('../cto/health-check.js').then(() => {}),
  'cto:error-monitor': () => import('../cto/error-monitor.js').then(() => {}),
  'cto:security-audit': () => import('../cto/security-audit.js').then(() => {}),
  'cto:count-reconcile': () => import('../scripts/reconcile-counts.js').then((m) => m.reconcileCounts(false)), // 비정규화 카운트 정합성 재계산 (agents-daily 04:00 KST). 멱등 — 실제값으로 set, 좋아요는 측정만
  'cto:purge-old-logs': () => import('../scripts/purge-old-logs.js').then((m) => m.purgeOldLogs(true)), // DISPATCH ONLY — dry(미삭제)만. ⚠️ 불가역 삭제라 dispatch로는 삭제 안 됨. 실제 삭제는 --apply 수동만
  'cto:anonymize-withdrawn': () => import('../scripts/anonymize-withdrawn-users.js').then((m) => m.anonymizeWithdrawn(true)), // dry(미리보기) — 대상 수만 확인. 실제 익명화는 anonymize-withdrawn-apply
  'cto:anonymize-withdrawn-apply': () => import('../scripts/anonymize-withdrawn-users.js').then((m) => m.anonymizeWithdrawn(false)), // F-12: 매주 월 10:00 KST 자동. 30일 경과 탈퇴자만, 멱등(이미 익명화된 건 제외)
  // main() 을 반환해야 runner 가 모더레이션 **완료까지** 기다린다.
  // `.then(() => {})` 이면 import 만 끝나고 곧바로 disconnect + exit 해서 판정이 잘린다.
  'coo:moderator': () => import('../coo/moderator.js').then((m) => m.main()),
  'coo:content-scheduler': () => import('../coo/content-scheduler.js').then(m => m.main()),
  'coo:job-scraper': () => import('../coo/job-scraper.js').then(m => m.main()),
  'coo:trending-scorer': () => import('../coo/trending-scorer.js').then(m => m.main()),
  'cdo:anomaly-detector': () => import('../cdo/anomaly-detector.js').then(() => {}),
  // LOCAL ONLY — run-pipeline.ts는 네이버 크롤링 통합 파이프라인, launchd로 로컬 실행
  // GitHub Actions 실행 불가 (네이버 IP 차단 + headless 탐지). 수동 실행만.
  'cafe_crawler:cafe-pipeline': () => import('../cafe/run-pipeline.js').then(async m => { await m.main('all') }),
  'cafe_crawler:trend-analysis': () => import('../cafe/trend-analyzer.js').then(() => {}),
  // 매거진: 로컬 launchd(12:30/21:00 KST) + GitHub Actions(16:00 KST) 이중 발행
  'cafe_crawler:magazine-generate': () => import('../cafe/magazine-generator.js').then(async m => { await m.main() }),
  'cafe_crawler:content-curate': () => import('../cafe/content-curator.js').then(m => m.main()),
  'cafe_crawler:popular-curate': () => import('../cafe/popular-curator.js').then(m => m.main()),
  'cafe_crawler:popular-sync': () => import('../cafe/popular-sync.js').then(() => {}), // DISPATCH ONLY — Mac launchd 전용. GHA 실행 불가 (네이버 Playwright).
  'cafe_crawler:brief-monitor': () => import('../cafe/brief-monitor.js').then(() => {}),
  // GHA 안전망 — Mac launchd 미실행 시 fallback_yesterday 자동 생성 (09:03 KST, 3 0 * * * UTC)
  'cafe_crawler:daily-brief-fallback': () => import('../cafe/daily-brief.js').then(async m => { await m.runFallbackBrief() }),
  // 저녁 안전망 — 11:30 KST full 크롤 실패 시 최대 21시간 공백 방지 (18:00 KST, 0 9 * * * UTC)
  'cafe_crawler:evening-brief-safety': () => import('../cafe/daily-brief.js').then(async m => { await m.runFallbackBrief() }),
  'cafe_crawler:external-crawl': () => import('../cafe/external-crawler.js').then(() => {}), // DISPATCH ONLY — 82cook 외부 크롤, GHA 스케줄 제거됨 (2026-04-13)
  'cmo:upload-creatives': () => import('../marketing/google-ads/scripts/upload-creatives.js').then(() => {}), // DISPATCH ONLY — 최초 1회 수동 실행
  'cmo:create-campaigns': () => import('../marketing/google-ads/scripts/create-campaigns.js').then(() => {}), // DISPATCH ONLY — 최초 1회 수동 실행
  'ceo:approval-reminder': () => import('./approval-reminder.js').then(() => {}),
  'cto:crawler-health': () => import('../cto/crawler-health.js').then(() => {}),
  // CTO 주간 아키텍처 리뷰 (DISPATCH ONLY — 수동 트리거 전용)
  // QA 에이전트 — 콘텐츠 품질 감사 (매일 08:20 KST)
  'qa:content-audit': () => import('../qa/content-audit.js').then(() => {}),
  // community:sheet-scrape · dawn-sheet-scrape · dawn-sheet-cleanup · fmkorea-scrape · navercafe-scrape ·
  // cafe_crawler:image-route — 삭제됨 2026-09-09 (R4 B-3a: 외부 카페·Google Sheet 공급망 REMOVE)
  // cmo:knowledge-responder — 삭제됨 2026-05-15 (지식인 운영 중단, 코드 삭제)
  // cmo:jisik-answerer — 삭제됨 2026-05-15 (지식인 운영 중단, 코드 삭제)
  // cmo:card-news-generator — 삭제됨 2026-05-15 (카드뉴스 중단, 코드 삭제)
  'cmo:seo-snapshot': () => import('../cmo/seo-snapshot.js').then(() => {}), // 주간 GSC 관측 (read-only)

  // Design 에이전트 (LOCAL ONLY — Gemini API + Playwright)
  // LOCAL ONLY — 이미지 생성 비용 발생, 인터랙티브 세션 전용
  // QA 2-Gate 시스템
  // DISPATCH ONLY — Gate 1은 /done 스킬에서 자동 실행, 독립 실행 시에만 이 핸들러 사용
  'qa:code-gate': () => import('../qa/pre-deploy-gate.js').then(() => {}),
  // LOCAL ONLY — 매일 02:00 KST launchd, NID_SES 5일 이내 만료 시 자동 갱신
  // NID_AUT(~1년)로 headless Playwright naver.com 접속 → 새 NID_SES 획득
  // 실패 시: SESSION_HALTED 플래그 + #대시보드/#시스템/#qa 3채널 긴급 알림
  'cafe:session-refresh': () => import('../cafe/session-manager.js').then(async m => { await m.ensureSession() }),
  // naver-blog:post — ARCHIVED 2026-06-04 (Gemini 구독 종료로 폐기). 어드민/테이블/R2 이미지는 보존.
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

/** DB EMERGENCY_STOP 플래그 확인 — /una-stop Slack 커맨드가 기록한 경우 LOCKED 처리 */
async function isDbEmergencyStop(): Promise<boolean> {
  try {
    const lastStop = await prisma.botLog.findFirst({
      where: { botType: 'CTO', action: 'EMERGENCY_STOP' },
      orderBy: { createdAt: 'desc' },
    })
    if (!lastStop) return false

    const lastResume = await prisma.botLog.findFirst({
      where: { botType: 'CTO', action: 'EMERGENCY_RESUME' },
      orderBy: { createdAt: 'desc' },
    })
    // 마지막 RESUME가 STOP보다 이전이거나 없으면 중지 상태
    return !lastResume || lastStop.createdAt > lastResume.createdAt
  } catch {
    return false // DB 체크 실패 시 차단하지 않음
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

  // automation_status 체크 (constitution.yaml + DB EMERGENCY_STOP 병행)
  const status = getAutomationStatus()
  const dbStopped = await isDbEmergencyStop()
  if ((status !== 'ACTIVE' || dbStopped) && !MONITORING_TASKS.has(key)) {
    const reason = dbStopped ? 'DB_EMERGENCY_STOP' : `automation_status=${status}`
    console.log(`[Runner] ${reason} — ${key} 실행 스킵 (모니터링 태스크만 허용)`)
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

  // 10분 이내 중복 방지 (GHA 지연 대응): 이중발화 차단, GHA 30분 지연 후 다음 슬롯 정상 실행 허용
  if (key === 'cafe_crawler:content-curate') {
    const dedupCutoff = new Date(Date.now() - 10 * 60 * 1000)
    const recentLog = await prisma.botLog.findFirst({
      where: {
        botType: 'CAFE_CRAWLER',
        action: 'CONTENT_CURATE',
        createdAt: { gte: dedupCutoff },
      },
    })
    if (recentLog) {
      console.log(`[Runner] cafe_crawler:content-curate 스킵 — 10분 이내 이미 실행됨 (${recentLog.createdAt.toISOString()})`)
      await disconnect()
      process.exit(0)
    }
  }

  console.log(`[Runner] ${agent}:${task} 시작 (automation_status=${status})`)
  let exitCode = 0
  try {
    await handler()
  } catch (err) {
    console.error(`[Runner] ${agent}:${task} 실패:`, err)
    exitCode = 1
  } finally {
    await disconnect()
  }
  process.exit(exitCode)
}

main()
