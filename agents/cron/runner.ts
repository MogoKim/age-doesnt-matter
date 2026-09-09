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
 * automation_status 체크 (2026-09-09 기준 값은 PAUSED):
 * - ACTIVE:        모든 핸들러 실행
 * - PAUSED/LOCKED: 아래 ESSENTIAL_TASKS 만 실행
 *
 * ⚠️ 전역 ACTIVE 로 되돌리지 않는다. 계속 돌려야 하는 것은 개별로 이 목록에 올린다.
 */

/**
 * PAUSED/LOCKED 에서도 실행하는 **필수 태스크**.
 *
 * 판정 분류는 정본 하나(KEEP_SAFETY)로 통일한다 — 안전·개인정보·데이터 정합성은
 * 별도 등급이 아니라 "지키지 않으면 사용자나 데이터가 다치는 것" 하나의 이유다.
 */
const ESSENTIAL_TASKS = new Set([
  'coo:moderator',                  // 금지어 감지·자동 숨김 — 멈추면 사용자가 유해 콘텐츠를 본다
  'cto:security-audit',             // 로그인 실패·어드민 민감 액션 감사
  'cto:count-reconcile',            // 비정규화 카운트 정합성(멱등) — 멈추면 화면 숫자가 실제와 어긋난다
  'cto:anonymize-withdrawn-apply',  // 30일 경과 탈퇴자 PII 익명화 — 멈추면 개인정보가 남는다
  'cmo:seo-snapshot',               // GSC read-only 관측 — 네이버 색인 추이는 계속 본다
])

const HANDLERS: Record<string, () => Promise<void>> = {
  'cto:security-audit': () => import('../cto/security-audit.js').then((m) => m.main()),
  'cto:count-reconcile': () => import('../scripts/reconcile-counts.js').then((m) => m.reconcileCounts(false)), // 비정규화 카운트 정합성 재계산 (agents-daily 04:00 KST). 멱등 — 실제값으로 set, 좋아요는 측정만
  'cto:anonymize-withdrawn-apply': () => import('../scripts/anonymize-withdrawn-users.js').then((m) => m.anonymizeWithdrawn(false)), // F-12: 매주 월 10:00 KST 자동. 30일 경과 탈퇴자만, 멱등(이미 익명화된 건 제외)
  // main() 을 반환해야 runner 가 모더레이션 **완료까지** 기다린다.
  // `.then(() => {})` 이면 import 만 끝나고 곧바로 disconnect + exit 해서 판정이 잘린다.
  'coo:moderator': () => import('../coo/moderator.js').then((m) => m.main()),
  'coo:job-scraper': () => import('../coo/job-scraper.js').then(m => m.main()),
  // community:* · cafe_crawler:* · cafe:session-refresh · coo:content-scheduler ·
  // coo:trending-scorer — 삭제됨 2026-09-09 (점수 계산이 실시간 액션과 중복)
  // cto:crawler-health · cto:health-check · cto:error-monitor · cto:purge-old-logs ·
  // cto:anonymize-withdrawn(dry) · cdo:anomaly-detector · ceo:approval-reminder ·
  // qa:content-audit · qa:code-gate · cmo:upload-creatives · cmo:create-campaigns — 삭제됨 2026-09-09
  // (R4 B-3: 외부 카페·Google Sheet 공급망 REMOVE). 재등록 방지선은 agent-registry-handlers.test.ts
  // cmo:knowledge-responder — 삭제됨 2026-05-15 (지식인 운영 중단, 코드 삭제)
  // cmo:jisik-answerer — 삭제됨 2026-05-15 (지식인 운영 중단, 코드 삭제)
  // cmo:card-news-generator — 삭제됨 2026-05-15 (카드뉴스 중단, 코드 삭제)
  // seo-snapshot 은 모듈이 top-level `await main()` 이라 import() 가 완료까지 기다린다.
  // 이 파일에서 `.then(() => {})` 이 안전한 유일한 경우다 — 다른 핸들러는 반드시 Promise 를 반환하라.
  'cmo:seo-snapshot': () => import('../cmo/seo-snapshot.js').then(() => {}), // 주간 GSC 관측 (read-only)

  // Design 에이전트 (LOCAL ONLY — Gemini API + Playwright)
  // LOCAL ONLY — 이미지 생성 비용 발생, 인터랙티브 세션 전용
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
  if ((status !== 'ACTIVE' || dbStopped) && !ESSENTIAL_TASKS.has(key)) {
    const reason = dbStopped ? 'DB_EMERGENCY_STOP' : `automation_status=${status}`
    console.log(`[Runner] ${reason} — ${key} 실행 스킵 (필수 태스크만 허용)`)
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
