// DISPATCH ONLY — Gate 2는 post-deploy-qa.yml(deployment_status)에서 자동 실행. 크론 미연결 의도적.
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
import { resolve, dirname } from 'path'
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
  adminQueueId?: number
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

function parseSmokeResult(): CheckItem {
  const path = resolve(ROOT, 'smoke-result.json')
  if (!existsSync(path)) {
    const outcome = process.env.QA_SMOKE_RESULT
    return {
      name: '스모크 테스트',
      pass: outcome === 'success',
      detail: outcome === 'success' ? '8개 엔드포인트 정상' : `결과 파일 없음 (outcome: ${outcome ?? 'unknown'})`,
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

function parseCronResult(): CheckItem {
  const path = resolve(ROOT, 'cron-result.json')
  if (!existsSync(path)) {
    const outcome = process.env.QA_CRON_RESULT
    return {
      name: '크론 연결',
      pass: outcome === 'success',
      detail: outcome === 'success' ? '전체 연결됨' : `결과 파일 없음 (outcome: ${outcome ?? 'unknown'})`,
    }
  }
  try {
    const raw = readFileSync(path, 'utf-8')
    // check-cron-links.ts 출력에서 orphaned 감지
    const orphaned = (raw.match(/❌.*orphaned/gi) ?? []).length
    const handlersMatch = raw.match(/(\d+)개 핸들러/)
    const total = handlersMatch ? handlersMatch[1] : '?'
    return {
      name: '크론 연결',
      pass: orphaned === 0,
      detail: orphaned === 0 ? `${total}개 핸들러 전체 연결됨` : `orphaned ${orphaned}개 감지`,
    }
  } catch {
    return { name: '크론 연결', pass: process.env.QA_CRON_RESULT === 'success', detail: '결과 파일 파싱 실패' }
  }
}

// ---------------------------------------------------------------------------
// 3. 광고 렌더링 결과
// ---------------------------------------------------------------------------

function parseAdResult(): CheckItem {
  const outcome = process.env.QA_AD_VERIFY_RESULT
  const path = resolve(ROOT, 'ad-verify-result.json')
  if (!existsSync(path)) {
    return {
      name: '광고 렌더링',
      pass: outcome === 'success',
      detail: outcome === 'success' ? 'AdSense/쿠팡 정상' : `결과 파일 없음 (outcome: ${outcome ?? 'unknown'})`,
    }
  }
  try {
    const raw = readFileSync(path, 'utf-8')
    const report = JSON.parse(raw) as { stats?: { expected: number; failed: number } }
    const failed = report.stats?.failed ?? 0
    const expected = report.stats?.expected ?? 0
    return {
      name: '광고 렌더링',
      pass: failed === 0,
      detail: failed === 0 ? `광고 ${expected}개 정상` : `${failed}개 실패`,
    }
  } catch {
    return { name: '광고 렌더링', pass: outcome === 'success', detail: '결과 파일 파싱 실패' }
  }
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
    return { name: 'CPO UX 점수', pass: true, detail: 'DB 조회 실패 — 스킵' }
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

    const issues: string[] = []
    let autoFixed = 0

    for (const post of posts) {
      const hasJsonWrapped = post.content.includes('```json') || post.content.includes('```\n{')
      const hasPlaceholder = ['이미지를 넣어주세요', 'placeholder', 'TODO'].some(p => post.content.includes(p))

      if (hasJsonWrapped) {
        // JSON unwrap 시도
        try {
          const match = post.content.match(/```json\n?([\s\S]+?)\n?```/)
          if (match) {
            await prisma.post.update({
              where: { id: post.id },
              data: { content: match[1].trim() },
            })
            autoFixed++
          }
        } catch { /* 수정 실패 무시 */ }
      }

      if (hasPlaceholder) {
        issues.push(`"${post.title.slice(0, 20)}" — placeholder 텍스트`)
      }
    }

    if (issues.length === 0 && autoFixed === 0) {
      return { name: '콘텐츠 품질', pass: true, detail: `최근 ${posts.length}건 정상`, autoFixedCount: 0 }
    }

    return {
      name: '콘텐츠 품질',
      pass: issues.length === 0,
      warn: autoFixed > 0 && issues.length === 0,
      detail: [
        autoFixed > 0 ? `${autoFixed}건 자동 수정됨(JSON unwrap)` : '',
        issues.length > 0 ? `수동 확인 필요 ${issues.length}건` : '',
      ].filter(Boolean).join(', '),
      autoFixedCount: autoFixed,
    }
  } catch {
    return { name: '콘텐츠 품질', pass: true, detail: 'DB 조회 실패 — 스킵', autoFixedCount: 0 }
  }
}

// ---------------------------------------------------------------------------
// 6. AI 종합 판단
// ---------------------------------------------------------------------------

async function synthesize(checks: CheckItem[]): Promise<'PASS' | 'WARN' | 'FAIL'> {
  const failedCount = checks.filter(c => !c.pass).length
  const warnCount = checks.filter(c => c.warn).length

  if (failedCount === 0 && warnCount === 0) return 'PASS'
  if (failedCount === 0 && warnCount > 0) return 'WARN'

  // 스모크 실패 또는 2개 이상 실패 → 즉시 FAIL
  const smokeCheck = checks.find(c => c.name === '스모크 테스트')
  if (!smokeCheck?.pass || failedCount >= 2) return 'FAIL'

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

async function sendReport(report: AuditReport, env: ReturnType<typeof getEnv>): Promise<void> {
  const { verdict, checks, autoFixedCount } = report
  const verdictIcon = verdict === 'PASS' ? '✅' : verdict === 'WARN' ? '⚠️' : '❌'

  if (verdict === 'PASS') {
    // 1줄 성공 메시지
    const line = [
      `*[Gate 2] ✅ 프로덕션 정상 — ${PROJECT_LABEL}*`,
      `커밋: \`${env.commitSha}\` | ${checks.map(c => `${c.name.split(' ')[0]} ${c.pass ? '✅' : '⚠️'}`).join(' | ')}`,
    ].join('\n')
    await sendSlackMessage('QA', line)
    return
  }

  // WARN/FAIL: 상세 메시지
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

  lines.push(DIVIDER)

  if (verdict === 'FAIL') {
    lines.push(`→ AdminQueue 등록됨. 즉시 확인이 필요합니다.`)
  } else {
    lines.push(`→ 경고 있음. 다음 배포 전 확인하세요.`)
  }

  await sendSlackMessage('QA', lines.join('\n'))
}

// ---------------------------------------------------------------------------
// AdminQueue 에스컬레이션 (FAIL 시)
// ---------------------------------------------------------------------------

async function escalateToAdmin(checks: CheckItem[], env: ReturnType<typeof getEnv>): Promise<number | undefined> {
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
  } catch {
    return undefined
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

async function main() {
  const start = Date.now()
  const env = getEnv()

  console.log(`[Gate 2] 프로덕션 배포 감사 시작 — 커밋: ${env.commitSha}`)

  const checks: CheckItem[] = []
  let totalAutoFixed = 0

  // 1. 스모크 테스트
  const smoke = parseSmokeResult()
  checks.push(smoke)
  console.log(`[Gate 2] 스모크: ${smoke.pass ? '✅' : '❌'} ${smoke.detail}`)

  // 2. 크론 연결
  const cron = parseCronResult()
  checks.push(cron)
  console.log(`[Gate 2] 크론 연결: ${cron.pass ? '✅' : '❌'} ${cron.detail}`)

  // 3. 광고
  const ad = parseAdResult()
  checks.push(ad)
  console.log(`[Gate 2] 광고: ${ad.pass ? '✅' : '❌'} ${ad.detail}`)

  // 4. CPO UX 점수
  const cpoUx = await checkCpoUx()
  checks.push(cpoUx)
  console.log(`[Gate 2] CPO UX: ${cpoUx.pass ? '✅' : '❌'}${cpoUx.warn ? '⚠️' : ''} ${cpoUx.detail}`)

  // 5. 콘텐츠 품질
  const content = await checkRecentContent()
  totalAutoFixed += content.autoFixedCount
  checks.push(content)
  console.log(`[Gate 2] 콘텐츠: ${content.pass ? '✅' : '❌'}${content.warn ? '⚠️' : ''} ${content.detail}`)

  // 6. AI 종합 판단
  const verdict = await synthesize(checks)
  console.log(`[Gate 2] 판정: ${verdict}`)

  const report: AuditReport = { verdict, checks, autoFixedCount: totalAutoFixed }

  // AdminQueue 에스컬레이션 (FAIL 시)
  if (verdict === 'FAIL') {
    report.adminQueueId = await escalateToAdmin(checks, env)
    if (report.adminQueueId) {
      console.log(`[Gate 2] AdminQueue #${report.adminQueueId} 등록됨`)
    }
  }

  const durationMs = Date.now() - start

  try {
    await sendReport(report, env)
    await logResult(report, durationMs, env)
  } catch (err) {
    console.error('[Gate 2] DB/Slack 기록 실패:', err)
  } finally {
    await disconnect()
  }

  console.log(`[Gate 2] 완료 — ${verdict} (${durationMs}ms)`)
  process.exit(verdict === 'FAIL' ? 1 : 0)
}

main()
