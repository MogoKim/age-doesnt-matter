// 크론 면제 대상이 아니다 — post-deploy-qa.yml 이 deployment_status 이벤트에서
// `runner.ts qa deploy-audit` 를 직접 호출하므로 check-cron-links 가 연결로 잡는다.
/**
 * QA 에이전트 — 프로덕션 배포 감사 (post-deploy)
 *
 * Gate 2: Vercel 프로덕션 배포 완료 후 자동 실행
 * 트리거: .github/workflows/post-deploy-qa.yml (deployment_status 이벤트)
 *
 * 검증 항목:
 * 1. 스모크 테스트 결과 (smoke-result.json)
 * 2. 크론 연결 결과 (cron-result.json)
 * 3. 광고 렌더링 결과 (ad-verify-result.json)
 * 4. CPO UX 점수 (BotLog에서 최신 ux-analyzer 읽기)
 * 5. 콘텐츠 품질 (최근 배포 이후 MAGAZINE 글 간단 체크)
 * 6. AI 종합 판단 (Claude Haiku)
 *
 * PASS → Slack #qa 1줄 성공 메시지
 * WARN → Slack #qa 경고 섹션 포함 메시지
 * FAIL → Slack #qa 상세 알림 + AdminQueue 에스컬레이션
 */

import { readFileSync, existsSync } from 'fs'
import { resolve, dirname, resolve as pathResolve } from 'path'
import { fileURLToPath } from 'url'
import { execSync } from 'child_process'
import Anthropic from '@anthropic-ai/sdk'
import { prisma, disconnect } from '../core/db.js'
import { sendSlackMessage } from '../core/notifier.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '../..')
const PROJECT_LABEL = '우나어(age-doesnt-matter)'
const DIVIDER = '─'.repeat(40)

// ---------------------------------------------------------------------------
// 타입
// ---------------------------------------------------------------------------

interface CheckItem {
  name: string
  pass: boolean
  warn?: boolean
  detail: string
}

interface AuditReport {
  verdict: 'PASS' | 'WARN' | 'FAIL'
  checks: CheckItem[]
  autoFixedCount: number
  /** AdminQueue.id 는 스키마상 String @default(cuid()) 다 */
  adminQueueId?: string
}

// ---------------------------------------------------------------------------
// 환경변수 읽기
// ---------------------------------------------------------------------------

function getEnv() {
  return {
    smokeOutcome: process.env.QA_SMOKE_RESULT ?? 'unknown',
    cronOutcome: process.env.QA_CRON_RESULT ?? 'unknown',
    adOutcome: process.env.QA_AD_VERIFY_RESULT ?? 'unknown',
    allPassed: process.env.QA_ALL_PASSED === 'true',
    commitSha: (process.env.QA_COMMIT_SHA ?? (() => {
      try { return execSync('git rev-parse --short HEAD', { encoding: 'utf-8' }).trim() } catch { return '' }
    })()).slice(0, 7),
    commitMsg: process.env.QA_COMMIT_MSG ?? '',
    deployTime: new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' }),
  }
}

// ---------------------------------------------------------------------------
// 1. 스모크 테스트 결과 파싱
// ---------------------------------------------------------------------------

function parseSmokeResult(resultsDir: string = ROOT): CheckItem {
  const path = resolve(resultsDir, 'smoke-result.json')
  // 결과 파일이 없으면 **검사를 못 한 것**이지 통과가 아니다.
  // 예전에는 워크플로우 outcome 으로 대체했는데, 그건 "스텝이 죽지 않았다"에 답할 뿐
  // "엔드포인트가 정상이다"에는 답하지 못한다.
  if (!existsSync(path)) {
    return {
      name: '스모크 테스트',
      pass: false,
      detail: `결과 파일 없음 (outcome: ${process.env.QA_SMOKE_RESULT ?? 'unknown'})`,
    }
  }
  try {
    const raw = readFileSync(path, 'utf-8')
    const report = JSON.parse(raw) as { passed: number; failed: number; checks: Array<{ name: string; pass: boolean; detail: string }> }
    const failedItems = report.checks.filter(c => !c.pass).map(c => `${c.name}: ${c.detail}`)
    return {
      name: '스모크 테스트',
      pass: report.failed === 0,
      detail: report.failed === 0
        ? `${report.passed}/${report.passed + report.failed}개 통과`
        : `${report.passed}/${report.passed + report.failed}개 통과, 실패: ${failedItems.slice(0, 2).join(' / ')}`,
    }
  } catch {
    return { name: '스모크 테스트', pass: false, detail: '결과 파일 파싱 실패' }
  }
}

// ---------------------------------------------------------------------------
// 2. 크론 연결 결과
// ---------------------------------------------------------------------------

/**
 * `cron-result.json` = `scripts/check-cron-links.ts` 의 JSON 리포트.
 *
 * 실패 기준은 **사유 없는 것 세 종류뿐**이다. `orphaned` 배열 자체는 실패가 아니다 —
 * `DISPATCH ONLY`·`LOCAL ONLY` 로 크론 미연결이 의도된 핸들러가 33개 들어 있고,
 * 그걸 실패로 세면 Gate 2 가 영원히 빨간불이다.
 * 예전에는 로그 텍스트를 정규식으로 긁어 `❌.*orphaned` 개수를 셌는데,
 * 출력 형식이 조금만 바뀌어도 조용히 0을 세고 통과했다.
 */
function parseCronResult(resultsDir: string = ROOT): CheckItem {
  const name = '크론 연결'
  const path = resolve(resultsDir, 'cron-result.json')
  // 파일이 없으면 검사를 못 한 것이다. 워크플로우 outcome 으로 대체하지 않는다.
  if (!existsSync(path)) {
    return { name, pass: false, detail: `결과 파일 없음 (outcome: ${process.env.QA_CRON_RESULT ?? 'unknown'})` }
  }
  let report: {
    total?: unknown
    unlinkedWithoutReason?: unknown
    workflowWithoutHandler?: unknown
    launchdOrphans?: unknown
  }
  try {
    report = JSON.parse(readFileSync(path, 'utf-8')) as typeof report
  } catch {
    return { name, pass: false, detail: '결과 파일 파싱 실패' }
  }

  const asArray = (v: unknown): unknown[] | null => (Array.isArray(v) ? v : null)
  const unlinked = asArray(report.unlinkedWithoutReason)
  const noHandler = asArray(report.workflowWithoutHandler)
  const launchd = asArray(report.launchdOrphans)

  // 필드가 없거나 배열이 아니면 판정 불가 — 통과시키지 않는다.
  if (unlinked === null || noHandler === null || launchd === null) {
    return { name, pass: false, detail: '결과 형식이 예상과 다름 — 판정 불가' }
  }

  const problems = [
    unlinked.length > 0 ? `사유 없는 orphan ${unlinked.length}개` : '',
    noHandler.length > 0 ? `핸들러 없는 workflow 키 ${noHandler.length}개` : '',
    launchd.length > 0 ? `launchd orphan ${launchd.length}개` : '',
  ].filter(Boolean)

  const total = typeof report.total === 'number' ? report.total : '?'
  return problems.length === 0
    ? { name, pass: true, detail: `${total}개 핸들러 — 사유 없는 미연결 없음` }
    : { name, pass: false, detail: problems.join(', ') }
}

/**
 * `ad-verify-result.json` = Playwright JSON reporter 출력.
 *
 * 판정은 `stats.unexpected` 로 한다 — Playwright 의 실패 카운터는 `failed` 가 아니다.
 * 없는 필드를 읽어 `?? 0` 으로 떨어뜨리면 **몇 개가 깨졌든 항상 0** 이 되어 통과한다.
 *
 * flaky(재시도 끝에 통과)는 **WARN** 으로 둔다 — 광고가 결국 떴으므로 배포를 막을 근거는
 * 아니지만, 조용히 PASS 로 묻으면 불안정이 쌓이는 걸 아무도 모른다.
 */
function parseAdResult(resultsDir: string = ROOT): CheckItem {
  const name = '광고 렌더링'
  const path = resolve(resultsDir, 'ad-verify-result.json')
  if (!existsSync(path)) {
    return { name, pass: false, detail: `결과 파일 없음 (outcome: ${process.env.QA_AD_VERIFY_RESULT ?? 'unknown'})` }
  }
  let report: { stats?: { expected?: unknown; unexpected?: unknown; flaky?: unknown } }
  try {
    report = JSON.parse(readFileSync(path, 'utf-8')) as typeof report
  } catch {
    return { name, pass: false, detail: '결과 파일 파싱 실패' }
  }

  const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)
  const expected = num(report.stats?.expected)
  const unexpected = num(report.stats?.unexpected)
  const flaky = num(report.stats?.flaky) ?? 0

  if (expected === null || unexpected === null) {
    return { name, pass: false, detail: 'stats.expected/unexpected 없음 — 판정 불가' }
  }
  if (unexpected > 0) {
    return { name, pass: false, detail: `${unexpected}개 실패` }
  }
  // 통과 0건은 "다 통과"가 아니라 "아무것도 안 돌았다" 이다.
  if (expected === 0) {
    return { name, pass: false, detail: '실행된 광고 검사가 0건 — 검사가 돌지 않았다' }
  }
  return flaky > 0
    ? { name, pass: true, warn: true, detail: `광고 ${expected}개 정상, flaky ${flaky}개(재시도 후 통과)` }
    : { name, pass: true, detail: `광고 ${expected}개 정상` }
}

// ---------------------------------------------------------------------------
// 4. CPO UX 점수 (BotLog 최신)
// ---------------------------------------------------------------------------

async function checkCpoUx(): Promise<CheckItem> {
  try {
    const log = await prisma.botLog.findFirst({
      where: { botType: 'CPO', action: 'UX_ANALYZER', status: 'SUCCESS' },
      orderBy: { createdAt: 'desc' },
      select: { details: true, createdAt: true },
    })
    if (!log) {
      return { name: 'CPO UX 점수', pass: true, warn: false, detail: '최근 데이터 없음 — 스킵' }
    }

    const data = JSON.parse(log.details ?? '{}') as Record<string, unknown>
    const score = typeof data.uxScore === 'number' ? data.uxScore : null
    const prevScore = typeof data.prevScore === 'number' ? data.prevScore : null

    if (score === null) {
      return { name: 'CPO UX 점수', pass: true, detail: '점수 데이터 없음 — 스킵' }
    }

    const ageHours = (Date.now() - log.createdAt.getTime()) / (1000 * 60 * 60)
    const drop = prevScore && prevScore > 0 ? ((score - prevScore) / prevScore) * 100 : 0

    if (drop < -20) {
      return { name: 'CPO UX 점수', pass: false, detail: `${score} (전날 ${prevScore}, -${Math.abs(drop).toFixed(0)}% 급락) ⚠️ 배포 영향 가능` }
    }
    if (drop < -10) {
      return { name: 'CPO UX 점수', pass: true, warn: true, detail: `${score} (전날 ${prevScore}, -${Math.abs(drop).toFixed(0)}%) 경고` }
    }

    const freshness = ageHours > 24 ? ` — ${Math.floor(ageHours)}시간 전 데이터` : ''
    return { name: 'CPO UX 점수', pass: true, detail: `${score}${prevScore ? ` (전날 ${prevScore}, ${drop >= 0 ? '+' : ''}${drop.toFixed(0)}%)` : ''}${freshness}` }
  } catch {
    // 보조 지표라 FAIL 로 올리지 않는다. 다만 조용히 통과시키지도 않는다.
    return { name: 'CPO UX 점수', pass: true, warn: true, detail: 'DB 조회 실패 — 확인 필요' }
  }
}

// ---------------------------------------------------------------------------
// 5. 콘텐츠 품질 (최근 1시간 MAGAZINE 글 간단 체크)
// ---------------------------------------------------------------------------

async function checkRecentContent(): Promise<CheckItem & { autoFixedCount: number }> {
  try {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000)
    const posts = await prisma.post.findMany({
      where: {
        boardType: 'MAGAZINE',
        status: 'PUBLISHED',
        createdAt: { gte: oneHourAgo },
      },
      select: { id: true, title: true, content: true, thumbnailUrl: true },
      take: 10,
    })

    if (posts.length === 0) {
      return { name: '콘텐츠 품질', pass: true, detail: '최근 1시간 내 새 글 없음', autoFixedCount: 0 }
    }

    // Gate 2 는 **검사·기록·알림 전용**이다. 사용자 콘텐츠는 건드리지 않는다.
    // 예전에는 여기서 JSON unwrap 을 prisma.post.update 로 바로 고쳤는데,
    // 배포 감사가 게시글을 말없이 바꾸면 무엇이 원본이었는지 아무도 모른다.
    // 발견한 문제는 check 결과와 AdminQueue 로만 올린다.
    const issues: string[] = []

    for (const post of posts) {
      const label = `"${post.title.slice(0, 20)}"`
      if (post.content.includes('```json') || post.content.includes('```\n{')) {
        issues.push(`${label} — JSON 래핑된 본문`)
      }
      if (['이미지를 넣어주세요', 'placeholder', 'TODO'].some(p => post.content.includes(p))) {
        issues.push(`${label} — placeholder 텍스트`)
      }
    }

    if (issues.length === 0) {
      return { name: '콘텐츠 품질', pass: true, detail: `최근 ${posts.length}건 정상`, autoFixedCount: 0 }
    }

    return {
      name: '콘텐츠 품질',
      pass: false,
      detail: `수동 확인 필요 ${issues.length}건: ${issues.slice(0, 2).join(' / ')}`,
      autoFixedCount: 0,
    }
  } catch {
    // 보조 검사라 WARN — 다만 '스킵'으로 조용히 통과시키지 않는다.
    return { name: '콘텐츠 품질', pass: true, warn: true, detail: 'DB 조회 실패 — 확인 필요', autoFixedCount: 0 }
  }
}

// ---------------------------------------------------------------------------
// 6. AI 종합 판단
// ---------------------------------------------------------------------------

/**
 * 배포 가부를 가르는 필수 검사. 하나라도 실패하면 그것으로 끝이다.
 * 판단을 AI 에 맡기지 않는다 — 모델이 필수 실패를 PASS/WARN 으로 뒤집으면
 * 깨진 배포가 초록불로 나간다. AI 는 보조 지표만 있는 경계 케이스에서만 쓴다.
 */
const REQUIRED_CHECKS = ['스모크 테스트', '크론 연결', '광고 렌더링'] as const

async function synthesize(checks: CheckItem[]): Promise<'PASS' | 'WARN' | 'FAIL'> {
  const failedCount = checks.filter(c => !c.pass).length
  const warnCount = checks.filter(c => c.warn).length

  // 필수 검사 실패는 AI 호출 **이전에** 결정적으로 FAIL 이다.
  const failedRequired = checks.filter(c => !c.pass && (REQUIRED_CHECKS as readonly string[]).includes(c.name))
  if (failedRequired.length > 0) return 'FAIL'

  if (failedCount === 0 && warnCount === 0) return 'PASS'
  if (failedCount === 0 && warnCount > 0) return 'WARN'

  // 여기부터는 보조 검사만 실패한 경계 케이스다.
  if (failedCount >= 2) return 'FAIL'

  // AI에게 판단 위임 (경계 케이스)
  try {
    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) return failedCount > 0 ? 'FAIL' : 'WARN'

    const anthropic = new Anthropic({ apiKey })
    const summary = checks.map(c => `${c.name}: ${c.pass ? 'PASS' : c.warn ? 'WARN' : 'FAIL'} — ${c.detail}`).join('\n')
    const message = await anthropic.messages.create({
      model: process.env.CLAUDE_MODEL_LIGHT ?? 'claude-haiku-4-5-20251001',
      max_tokens: 64,
      messages: [{
        role: 'user',
        content: `프로덕션 QA 결과:\n${summary}\n\n판정: PASS/WARN/FAIL 중 하나만 응답.`,
      }],
    })
    const text = message.content[0].type === 'text' ? message.content[0].text.trim().toUpperCase() : 'FAIL'
    if (text.includes('PASS')) return 'PASS'
    if (text.includes('WARN')) return 'WARN'
    return 'FAIL'
  } catch {
    return failedCount > 0 ? 'FAIL' : 'WARN'
  }
}

// ---------------------------------------------------------------------------
// Slack 알림 전송
// ---------------------------------------------------------------------------

/**
 * Slack 보고. `fatalNotes` 는 이 시점까지 쌓인 **치명 오류**다.
 *
 * BotLog 기록이 실패했으면 Slack 이 유일한 외부 알림이다. 그때 "프로덕션 정상"
 * 한 줄만 보내면 아무도 기록이 없다는 걸 모른다 — 치명 오류가 있으면 성공 축약을
 * 쓰지 않고 상세 메시지에 실패 사실을 함께 싣는다.
 */
async function sendReport(report: AuditReport, env: ReturnType<typeof getEnv>, fatalNotes: string[] = []): Promise<void> {
  const { verdict, checks, autoFixedCount } = report
  const verdictIcon = verdict === 'PASS' ? '✅' : verdict === 'WARN' ? '⚠️' : '❌'

  if (verdict === 'PASS' && fatalNotes.length === 0) {
    // 1줄 성공 메시지 — 기록이 정상일 때만 쓴다
    const line = [
      `*[Gate 2] ✅ 프로덕션 정상 — ${PROJECT_LABEL}*`,
      `커밋: \`${env.commitSha}\` | ${checks.map(c => `${c.name.split(' ')[0]} ${c.pass ? '✅' : '⚠️'}`).join(' | ')}`,
    ].join('\n')
    await sendSlackMessage('QA', line)
    return
  }

  // WARN/FAIL 이거나, 판정은 괜찮아도 기록이 실패한 경우
  const lines = [
    `*[Gate 2] ${verdictIcon} 프로덕션 감사 ${verdict} — ${PROJECT_LABEL}*`,
    `커밋: \`${env.commitSha}\`${env.commitMsg ? ` "${env.commitMsg.slice(0, 50)}"` : ''}`,
    `배포: ${env.deployTime}`,
    DIVIDER,
  ]

  for (const c of checks) {
    const icon = !c.pass ? '❌' : c.warn ? '⚠️' : '✅'
    lines.push(`${icon} *${c.name}*: ${c.detail}`)
  }

  if (autoFixedCount > 0) {
    lines.push(`\n✏️ ${autoFixedCount}건 자동 수정됨 (JSON unwrap)`)
  }

  if (fatalNotes.length > 0) {
    lines.push(DIVIDER)
    lines.push(`🚨 *기록 실패 ${fatalNotes.length}건 — 이 Slack 메시지가 유일한 외부 알림입니다*`)
    for (const n of fatalNotes) lines.push(`• ${n}`)
  }

  lines.push(DIVIDER)

  if (verdict === 'FAIL') {
    // 등록이 실패했는데 "등록됨"이라고 알리면, 아무도 안 보는 큐를 보러 간다.
    lines.push(
      report.adminQueueId !== undefined
        ? `→ AdminQueue ${report.adminQueueId} 등록됨. 즉시 확인이 필요합니다.`
        : `→ ⚠️ AdminQueue 등록 실패 — 이 메시지가 유일한 알림입니다. 즉시 확인이 필요합니다.`,
    )
  } else {
    lines.push(`→ 경고 있음. 다음 배포 전 확인하세요.`)
  }

  await sendSlackMessage('QA', lines.join('\n'))
}

// ---------------------------------------------------------------------------
// AdminQueue 에스컬레이션 (FAIL 시)
// ---------------------------------------------------------------------------

async function escalateToAdmin(checks: CheckItem[], env: ReturnType<typeof getEnv>): Promise<string> {
  const failedItems = checks.filter(c => !c.pass).map(c => `${c.name}: ${c.detail}`)
  try {
    const item = await prisma.adminQueue.create({
      data: {
        type: 'CONTENT_PUBLISH',
        status: 'PENDING',
        requestedBy: 'QA',
        title: `[Gate 2] 프로덕션 QA 실패 — ${env.commitSha}`,
        payload: JSON.stringify({ failedItems, deployTime: env.deployTime, commitSha: env.commitSha }),
      },
    })
    return item.id
  } catch (err) {
    // 조용히 undefined 를 돌려주면 FAIL 인데 아무도 모르는 상태가 된다.
    // 다만 여기서 바로 던지면 BotLog 기록까지 막히므로 호출부가 모아서 처리한다.
    throw new Error(`AdminQueue 등록 실패: ${err instanceof Error ? err.message : String(err)}`)
  }
}

// ---------------------------------------------------------------------------
// BotLog 기록
// ---------------------------------------------------------------------------

async function logResult(report: AuditReport, durationMs: number, env: ReturnType<typeof getEnv>): Promise<void> {
  const summary = `verdict:${report.verdict}, checks:${report.checks.map(c => `${c.name}=${c.pass ? 'PASS' : 'FAIL'}`).join(',')}`
  await prisma.botLog.create({
    data: {
      botType: 'QA',
      action: 'DEPLOY_AUDIT',
      status: report.verdict === 'PASS' ? 'SUCCESS' : report.verdict === 'WARN' ? 'PARTIAL' : 'FAILED',
      details: JSON.stringify({ ...report, commitSha: env.commitSha }),
      itemCount: report.checks.filter(c => !c.pass).length,
      executionTimeMs: durationMs,
    },
  })
  console.log(`[Gate 2] BotLog 기록: ${summary}`)
}

// ---------------------------------------------------------------------------
// 메인
// ---------------------------------------------------------------------------

/**
 * Gate 2 배포 감사 1회. **검사·기록·알림 전용** — 사용자 콘텐츠를 바꾸지 않는다.
 *
 * 이 함수는 `process.exit` 도 `disconnect` 도 하지 않는다. 둘 다 runner 담당이다.
 * 예전에는 모듈이 top-level 에서 스스로 실행하고 exit 까지 해서,
 * runner 의 exit code 계약을 우회하고 완료 대기도 불가능했다.
 *
 * 실패 정책:
 *   · verdict FAIL      → throw (runner exit 1)
 *   · AdminQueue 실패   → 치명. 단 BotLog 기록 시도를 막지 않는다
 *   · BotLog 실패       → 치명. 기록이 없으면 감사 자체가 없던 일이 된다
 *   · Slack 실패        → 비치명. BotLog 는 계속 시도한다
 *   · 보조 조회 실패    → WARN (checks 안에서 처리)
 * 치명 오류가 여러 개면 **가능한 기록을 모두 시도한 뒤** 모아서 던진다.
 */
export async function main(resultsDir: string = ROOT): Promise<void> {
  const start = Date.now()
  const env = getEnv()

  console.log(`[Gate 2] 프로덕션 배포 감사 시작 — 커밋: ${env.commitSha}`)

  const checks: CheckItem[] = []

  const smoke = parseSmokeResult(resultsDir)
  checks.push(smoke)
  console.log(`[Gate 2] 스모크: ${smoke.pass ? '✅' : '❌'} ${smoke.detail}`)

  const cron = parseCronResult(resultsDir)
  checks.push(cron)
  console.log(`[Gate 2] 크론 연결: ${cron.pass ? '✅' : '❌'} ${cron.detail}`)

  const ad = parseAdResult(resultsDir)
  checks.push(ad)
  console.log(`[Gate 2] 광고: ${ad.pass ? '✅' : '❌'} ${ad.detail}`)

  const cpoUx = await checkCpoUx()
  checks.push(cpoUx)
  console.log(`[Gate 2] CPO UX: ${cpoUx.pass ? '✅' : '❌'}${cpoUx.warn ? '⚠️' : ''} ${cpoUx.detail}`)

  const content = await checkRecentContent()
  checks.push(content)
  console.log(`[Gate 2] 콘텐츠: ${content.pass ? '✅' : '❌'}${content.warn ? '⚠️' : ''} ${content.detail}`)

  const verdict = await synthesize(checks)
  console.log(`[Gate 2] 판정: ${verdict}`)

  const report: AuditReport = { verdict, checks, autoFixedCount: 0 }
  const fatal: string[] = []

  // 순서가 중요하다: AdminQueue → BotLog → **그 결과를 아는 상태로** Slack.
  // Slack 을 먼저 보내면 기록이 실패했는지 모른 채 "프로덕션 정상"을 보낼 수 있다.
  // 세 시도는 서로 다른 try 에 둔다 — 하나가 죽어도 나머지는 계속 간다.

  // 1) AdminQueue — 치명이지만 아래 기록을 막지 않는다
  if (verdict === 'FAIL') {
    try {
      report.adminQueueId = await escalateToAdmin(checks, env)
      console.log(`[Gate 2] AdminQueue ${report.adminQueueId} 등록됨`)
    } catch (err) {
      fatal.push(err instanceof Error ? err.message : String(err))
    }
  }

  const durationMs = Date.now() - start

  // 2) BotLog — 치명. 이 기록이 없으면 감사를 돌린 흔적이 남지 않는다.
  try {
    await logResult(report, durationMs, env)
  } catch (err) {
    fatal.push(`BotLog 기록 실패: ${err instanceof Error ? err.message : String(err)}`)
  }

  // 3) Slack — 비치명이지만 **반드시 시도한다**. 기록이 다 실패했으면
  //    이게 유일한 외부 알림이므로, 앞선 실패를 메시지에 실어 보낸다.
  try {
    await sendReport(report, env, fatal)
  } catch (err) {
    console.error('[Gate 2] Slack 보고 실패(비치명):', err instanceof Error ? err.message : String(err))
  }

  console.log(`[Gate 2] 완료 — ${verdict} (${durationMs}ms)`)

  if (fatal.length > 0) {
    throw new Error(`[Gate 2] 치명 오류 ${fatal.length}건: ${fatal.join(' | ')}`)
  }
  if (verdict === 'FAIL') {
    const failed = checks.filter((c) => !c.pass).map((c) => c.name).join(', ')
    throw new Error(`[Gate 2] 배포 감사 FAIL — ${failed}`)
  }
}

// `tsx qa/post-deploy.ts` 로 직접 돌릴 때만 실행한다.
// 경로를 정확히 대조한다 — 부분일치로 판정하면 다른 진입점에서도 참이 되어 이중 실행이 된다.
const entry = process.argv[1]
const isDirect = entry !== undefined && pathResolve(entry) === fileURLToPath(import.meta.url)
if (isDirect) {
  main()
    .then(async () => { await disconnect(); process.exit(0) })
    .catch(async (err) => {
      console.error('[Gate 2]', err instanceof Error ? err.message : String(err))
      await disconnect().catch(() => {})
      process.exit(1)
    })
}
