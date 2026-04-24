// DISPATCH ONLY — Gate 1은 /done 스킬에서 자동 실행. 크론 미연결 의도적.
/**
 * QA 에이전트 — 코드 게이트 (pre-deploy-gate)
 *
 * Gate 1: 배포 전 코드 품질 자동 검증
 * - /done 스킬에서 자동 호출 (Slack 알림은 FAIL 시에만)
 * - 독립 실행: npx tsx cron/runner.ts qa code-gate
 *
 * 검증 항목:
 * 1. TypeScript 타입 체크 (tsc --noEmit)
 * 2. 크론 연결 무결성 (check-cron-links.ts)
 * 3. 빌드 성공 여부 (에이전트/워크플로우 변경 감지 시)
 * 4. AI 아키텍처 검토 (git diff → constitution.yaml 규칙 대조)
 *
 * PASS → 정상 종료 (exit 0)
 * FAIL → Slack #qa 상세 알림 + exit 1
 */

import { execSync } from 'child_process'
import { readFileSync, existsSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
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

interface GateResult {
  step: string
  pass: boolean
  detail: string
  errors?: string[]
}

// ---------------------------------------------------------------------------
// Step 1: TypeScript 타입 체크
// ---------------------------------------------------------------------------

function checkTypeScript(): GateResult {
  const start = Date.now()
  try {
    execSync('npx tsc --noEmit', { cwd: ROOT, encoding: 'utf-8', stdio: 'pipe' })
    return {
      step: 'TypeScript',
      pass: true,
      detail: `오류 없음 (${Date.now() - start}ms)`,
    }
  } catch (err) {
    const output = (err as { stdout?: string; stderr?: string }).stdout ?? ''
    const lines = output.split('\n').filter(Boolean)
    // "error TS..." 라인만 추출 (최대 5개)
    const errorLines = lines
      .filter(l => l.includes(' error TS') || l.includes(': error TS'))
      .slice(0, 5)
      .map(l => l.replace(ROOT + '/', '').trim())

    return {
      step: 'TypeScript',
      pass: false,
      detail: `오류 ${lines.filter(l => l.includes('error TS')).length}개`,
      errors: errorLines.length > 0 ? errorLines : lines.slice(0, 3).map(l => l.trim()),
    }
  }
}

// ---------------------------------------------------------------------------
// Step 2: 크론 연결 무결성
// ---------------------------------------------------------------------------

function checkCronLinks(): GateResult {
  try {
    const result = execSync('npx tsx scripts/check-cron-links.ts', {
      cwd: ROOT,
      encoding: 'utf-8',
      stdio: 'pipe',
    })
    const orphaned = result.match(/❌.*orphaned/gi) ?? []
    if (orphaned.length > 0) {
      return {
        step: '크론 연결',
        pass: false,
        detail: `orphaned 핸들러 ${orphaned.length}개 감지`,
        errors: orphaned.map(l => l.trim()).slice(0, 5),
      }
    }
    const match = result.match(/(\d+)개 핸들러/)
    return {
      step: '크론 연결',
      pass: true,
      detail: match ? `${match[1]}개 핸들러 전체 연결됨` : '정상',
    }
  } catch (err) {
    const output = (err as { stdout?: string; stderr?: string }).stdout ?? ''
    const orphanLines = output.split('\n').filter(l => l.includes('orphan') || l.includes('❌')).slice(0, 5)
    return {
      step: '크론 연결',
      pass: false,
      detail: 'check-cron-links 실패',
      errors: orphanLines.length > 0 ? orphanLines : ['연결 검증 스크립트 오류'],
    }
  }
}

// ---------------------------------------------------------------------------
// Step 3: 빌드 (에이전트/워크플로우 변경 시만)
// ---------------------------------------------------------------------------

function getChangedFiles(): string[] {
  try {
    const result = execSync('git diff origin/main~1...HEAD --name-only', {
      cwd: ROOT,
      encoding: 'utf-8',
      stdio: 'pipe',
    })
    return result.split('\n').filter(Boolean)
  } catch {
    try {
      const result = execSync('git diff HEAD~1...HEAD --name-only', {
        cwd: ROOT,
        encoding: 'utf-8',
        stdio: 'pipe',
      })
      return result.split('\n').filter(Boolean)
    } catch {
      return []
    }
  }
}

function needsBuildCheck(changedFiles: string[]): boolean {
  return changedFiles.some(f =>
    f.startsWith('agents/') ||
    f.startsWith('.github/workflows/') ||
    f === 'package.json' ||
    f === 'prisma/schema.prisma',
  )
}

function checkBuild(): GateResult {
  const start = Date.now()
  try {
    execSync('npm run build', { cwd: ROOT, encoding: 'utf-8', stdio: 'pipe' })
    return {
      step: '빌드',
      pass: true,
      detail: `성공 (${((Date.now() - start) / 1000).toFixed(1)}s)`,
    }
  } catch (err) {
    const output = (err as { stdout?: string; stderr?: string }).stderr ?? ''
    const errorLines = output.split('\n').filter(l => l.includes('Error') || l.includes('error')).slice(0, 3)
    return {
      step: '빌드',
      pass: false,
      detail: '빌드 실패',
      errors: errorLines.map(l => l.trim()).filter(Boolean),
    }
  }
}

// ---------------------------------------------------------------------------
// Step 4: AI 아키텍처 검토
// ---------------------------------------------------------------------------

async function checkArchitecture(changedFiles: string[]): Promise<GateResult> {
  if (changedFiles.length === 0) {
    return { step: 'AI 아키텍처', pass: true, detail: '변경 파일 없음 — 스킵' }
  }

  // 에이전트/src 변경이 없으면 스킵
  const hasAgentOrSrcChange = changedFiles.some(f => f.startsWith('agents/') || f.startsWith('src/'))
  if (!hasAgentOrSrcChange) {
    return { step: 'AI 아키텍처', pass: true, detail: '에이전트/src 변경 없음 — 스킵' }
  }

  // constitution.yaml의 핵심 규칙 읽기
  const constitutionPath = resolve(__dirname, '../core/constitution.yaml')
  let constitutionRules = ''
  if (existsSync(constitutionPath)) {
    const raw = readFileSync(constitutionPath, 'utf-8')
    // canWrite, guardrails 섹션만 추출 (비용 절약)
    const lines = raw.split('\n')
    const relevantLines = lines.filter(l =>
      l.includes('canWrite') ||
      l.includes('guardrails') ||
      l.includes('must_approve') ||
      l.includes('auto_allowed') ||
      l.includes('MONITORING_TASKS') ||
      l.includes('runner.ts'),
    ).slice(0, 30)
    constitutionRules = relevantLines.join('\n')
  }

  // runner.ts 핸들러 목록 (등록 여부 확인용)
  const runnerPath = resolve(ROOT, 'agents/cron/runner.ts')
  let runnerHandlers = ''
  if (existsSync(runnerPath)) {
    const raw = readFileSync(runnerPath, 'utf-8')
    const match = raw.match(/const HANDLERS[^{]*\{([^}]+)\}/s)
    if (match) runnerHandlers = match[1].substring(0, 800)
  }

  const prompt = `다음 변경된 파일 목록과 프로젝트 규칙을 바탕으로 아키텍처 규칙 위반 여부를 간결하게 검토해줘.

변경된 파일:
${changedFiles.slice(0, 20).join('\n')}

핵심 규칙:
${constitutionRules}

runner.ts 등록 핸들러 (일부):
${runnerHandlers}

검토 항목:
1. agents/ 폴더에 새 에이전트 파일이 추가됐으면 runner.ts 등록 여부
2. canWrite: false인 에이전트가 prisma.X.create/update/delete 호출하는지
3. any 타입 신규 사용 여부 (가능하면)
4. 레거시 영향: 변경한 파일을 다른 에이전트/페이지가 import하는지

응답은 JSON 형식으로: {"pass": true/false, "violations": ["위반 내용 1", "위반 내용 2"]}
위반 없으면 violations는 빈 배열. 텍스트 설명 없이 JSON만.`

  try {
    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) {
      return { step: 'AI 아키텍처', pass: true, detail: 'API 키 없음 — 스킵' }
    }

    const anthropic = new Anthropic({ apiKey })
    const message = await anthropic.messages.create({
      model: process.env.CLAUDE_MODEL_LIGHT ?? 'claude-haiku-4-5-20251001',
      max_tokens: 512,
      messages: [{ role: 'user', content: prompt }],
    })

    const text = message.content[0].type === 'text' ? message.content[0].text : '{}'
    // JSON 파싱 (```json 래퍼 제거)
    const clean = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
    const parsed = JSON.parse(clean) as { pass: boolean; violations: string[] }

    return {
      step: 'AI 아키텍처',
      pass: parsed.pass,
      detail: parsed.pass ? '규칙 준수 확인됨' : `위반 ${parsed.violations.length}건 감지`,
      errors: parsed.violations.slice(0, 5),
    }
  } catch {
    // AI 검토 실패 시 경고로만 처리 (배포 차단 안 함)
    return { step: 'AI 아키텍처', pass: true, detail: 'AI 검토 실패 — 경고로 처리' }
  }
}

// ---------------------------------------------------------------------------
// Slack 알림 (FAIL 시)
// ---------------------------------------------------------------------------

async function notifyFail(results: GateResult[], commitSha: string): Promise<void> {
  const failedSteps = results.filter(r => !r.pass)
  if (failedSteps.length === 0) return

  const lines = [
    `*[Gate 1] ❌ 코드 게이트 — ${PROJECT_LABEL}*`,
    DIVIDER,
  ]

  for (const r of results) {
    const icon = r.pass ? '✅' : '❌'
    lines.push(`${icon} *${r.step}*: ${r.detail}`)
    if (!r.pass && r.errors && r.errors.length > 0) {
      for (const e of r.errors.slice(0, 3)) {
        lines.push(`  • ${e}`)
      }
    }
  }

  lines.push(DIVIDER)
  lines.push(`→ 커밋 보류됨${commitSha ? ` (${commitSha})` : ''}. 위 문제 수정 후 /done 재실행하세요.`)

  await sendSlackMessage('QA', lines.join('\n'))
  console.log('[Gate 1] ❌ Slack #qa 알림 전송됨')
}

// ---------------------------------------------------------------------------
// BotLog 기록
// ---------------------------------------------------------------------------

async function logResult(results: GateResult[], pass: boolean, durationMs: number): Promise<void> {
  const summary = results.map(r => `${r.step}:${r.pass ? 'PASS' : 'FAIL'}`).join(', ')
  await prisma.botLog.create({
    data: {
      botType: 'QA',
      action: 'CODE_GATE',
      status: pass ? 'SUCCESS' : 'FAILED',
      details: JSON.stringify({ results, summary }),
      itemCount: results.filter(r => !r.pass).length,
      executionTimeMs: durationMs,
    },
  })
}

// ---------------------------------------------------------------------------
// 메인
// ---------------------------------------------------------------------------

async function main() {
  const start = Date.now()
  console.log('[Gate 1] 코드 게이트 시작')

  const results: GateResult[] = []

  // Step 1: TypeScript
  console.log('[Gate 1] TypeScript 검사 중...')
  const tsResult = checkTypeScript()
  results.push(tsResult)
  console.log(`[Gate 1] TypeScript: ${tsResult.pass ? '✅' : '❌'} ${tsResult.detail}`)
  if (!tsResult.pass && tsResult.errors) tsResult.errors.forEach(e => console.log(`  • ${e}`))

  // Step 2: 크론 연결
  console.log('[Gate 1] 크론 연결 검사 중...')
  const cronResult = checkCronLinks()
  results.push(cronResult)
  console.log(`[Gate 1] 크론 연결: ${cronResult.pass ? '✅' : '❌'} ${cronResult.detail}`)
  if (!cronResult.pass && cronResult.errors) cronResult.errors.forEach(e => console.log(`  • ${e}`))

  // Step 3: 빌드 (조건부)
  const changedFiles = getChangedFiles()
  console.log(`[Gate 1] 변경 파일 ${changedFiles.length}개 감지`)

  if (needsBuildCheck(changedFiles)) {
    console.log('[Gate 1] 빌드 검사 중... (에이전트/워크플로우 변경 감지)')
    const buildResult = checkBuild()
    results.push(buildResult)
    console.log(`[Gate 1] 빌드: ${buildResult.pass ? '✅' : '❌'} ${buildResult.detail}`)
    if (!buildResult.pass && buildResult.errors) buildResult.errors.forEach(e => console.log(`  • ${e}`))
  } else {
    results.push({ step: '빌드', pass: true, detail: '변경 없음 — 스킵' })
    console.log('[Gate 1] 빌드: ✅ 스킵 (에이전트/워크플로우 변경 없음)')
  }

  // Step 4: AI 아키텍처 검토
  console.log('[Gate 1] AI 아키텍처 검토 중...')
  const archResult = await checkArchitecture(changedFiles)
  results.push(archResult)
  console.log(`[Gate 1] AI 아키텍처: ${archResult.pass ? '✅' : '⚠️'} ${archResult.detail}`)
  if (!archResult.pass && archResult.errors) archResult.errors.forEach(e => console.log(`  • ${e}`))

  const allPass = results.every(r => r.pass)
  const durationMs = Date.now() - start

  // 결과 요약 출력
  console.log('\n' + DIVIDER)
  if (allPass) {
    console.log(`[Gate 1] ✅ 전체 통과 — 커밋+푸시 진행 (${durationMs}ms)`)
  } else {
    const failed = results.filter(r => !r.pass).map(r => r.step).join(', ')
    console.log(`[Gate 1] ❌ 실패: ${failed} — 커밋 보류`)
  }
  console.log(DIVIDER)

  // BotLog + Slack (FAIL 시)
  try {
    await logResult(results, allPass, durationMs)
    if (!allPass) {
      const sha = (() => {
        try { return execSync('git rev-parse --short HEAD', { cwd: ROOT, encoding: 'utf-8' }).trim() } catch { return '' }
      })()
      await notifyFail(results, sha)
    }
  } catch (err) {
    console.error('[Gate 1] DB/Slack 기록 실패:', err)
  } finally {
    await disconnect()
  }

  process.exit(allPass ? 0 : 1)
}

main()
