/**
 * CTO 에이전트 — 주간 아키텍처 리뷰 (arch-review)
 *
 * 매주 월요일 07:00 KST (일요일 22:00 UTC) 자동 실행
 * constitution.yaml의 기술 규칙이 실제 코드에 지켜지는지 감시하는 역할
 *
 * 검사 항목:
 * 1. Orphaned 핸들러: runner.ts에 있지만 워크플로우 미연결
 * 2. 기술 부채 지표: TODO/FIXME/HACK/any 카운트
 * 3. 에이전트 주간 실패율: BotLog 7일 집계
 * 4. 성능 추세: health-check 7일 latency 평균
 *
 * 결과는 Slack #알림-시스템 주간 기술 건강 리포트로 전송
 */

import { execSync } from 'child_process'
import { readFileSync, readdirSync } from 'fs'
import { join, resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { prisma, disconnect } from '../core/db.js'
import { notifySlack } from '../core/notifier.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const ROOT = resolve(__dirname, '../..')

// ---------------------------------------------------------------------------
// 1. Orphaned 핸들러 감지 (check-cron-links 로직 재사용)
// ---------------------------------------------------------------------------

interface HandlerInfo { key: string; importPath: string }

function extractHandlers(): HandlerInfo[] {
  const runnerPath = join(ROOT, 'agents/cron/runner.ts')
  const src = readFileSync(runnerPath, 'utf-8')
  const results: HandlerInfo[] = []
  const re = /^\s*'([^']+)':\s*\(\)\s*=>\s*import\(['"]([^'"]+)['"]\)/gm
  let m: RegExpExecArray | null
  while ((m = re.exec(src)) !== null) {
    results.push({ key: m[1], importPath: m[2] })
  }
  return results
}

function extractWorkflowKeys(): Set<string> {
  const keys = new Set<string>()
  const workflowsDir = join(ROOT, '.github/workflows')
  const files = readdirSync(workflowsDir).filter((f) => f.startsWith('agents-') && f.endsWith('.yml'))
  for (const file of files) {
    const content = readFileSync(join(workflowsDir, file), 'utf-8')
    const agentRe = /echo\s+["']agent=([^"'\s]+)["']/g
    const taskRe = /echo\s+["']task=([^"'\s]+)["']/g
    const agents: string[] = []
    const tasks: string[] = []
    let m: RegExpExecArray | null
    while ((m = agentRe.exec(content)) !== null) agents.push(m[1].toLowerCase())
    while ((m = taskRe.exec(content)) !== null) tasks.push(m[1])
    for (let i = 0; i < Math.min(agents.length, tasks.length); i++) {
      keys.add(`${agents[i]}:${tasks[i]}`)
    }
  }
  return keys
}

function checkOrphanedHandlers(): { orphaned: string[]; dispatchOnly: string[]; localOnly: string[] } {
  const handlers = extractHandlers()
  const workflowKeys = extractWorkflowKeys()

  const orphaned: string[] = []
  const dispatchOnly: string[] = []
  const localOnly: string[] = []

  for (const { key, importPath } of handlers) {
    if (workflowKeys.has(key)) continue
    orphaned.push(key)

    // 소스 파일에서 exempt 주석 확인
    const tsPath = importPath.replace(/\.js$/, '.ts')
    const srcPath = resolve(join(ROOT, 'agents/cron'), tsPath)
    try {
      const src = readFileSync(srcPath, 'utf-8')
      if (/\/\/\s*DISPATCH\s+ONLY/i.test(src)) dispatchOnly.push(key)
      else if (/\/\/\s*LOCAL\s+ONLY/i.test(src)) localOnly.push(key)
    } catch { /* 파일 없음 */ }
  }

  return {
    orphaned: orphaned.filter((k) => !dispatchOnly.includes(k) && !localOnly.includes(k)),
    dispatchOnly,
    localOnly,
  }
}

// ---------------------------------------------------------------------------
// 2. 기술 부채 지표
// ---------------------------------------------------------------------------

interface TechDebtMetrics {
  todoCount: number
  fixmeCount: number
  hackCount: number
  anyCount: number
}

function countTechDebt(): TechDebtMetrics {
  try {
    const grepTodo = execSync(
      `grep -r "TODO\\|FIXME\\|HACK" ${join(ROOT, 'agents')} ${join(ROOT, 'src')} --include="*.ts" -l 2>/dev/null | wc -l`,
      { encoding: 'utf-8' },
    ).trim()

    const grepAny = execSync(
      `grep -r ": any" ${join(ROOT, 'src')} --include="*.ts" 2>/dev/null | wc -l`,
      { encoding: 'utf-8' },
    ).trim()

    const todoLines = parseInt(
      execSync(
        `grep -rn "TODO" ${join(ROOT, 'agents')} ${join(ROOT, 'src')} --include="*.ts" 2>/dev/null | wc -l`,
        { encoding: 'utf-8' },
      ).trim(),
      10,
    )
    const fixmeLines = parseInt(
      execSync(
        `grep -rn "FIXME" ${join(ROOT, 'agents')} ${join(ROOT, 'src')} --include="*.ts" 2>/dev/null | wc -l`,
        { encoding: 'utf-8' },
      ).trim(),
      10,
    )
    const hackLines = parseInt(
      execSync(
        `grep -rn "HACK" ${join(ROOT, 'agents')} ${join(ROOT, 'src')} --include="*.ts" 2>/dev/null | wc -l`,
        { encoding: 'utf-8' },
      ).trim(),
      10,
    )
    const anyLines = parseInt(grepAny, 10)

    return {
      todoCount: todoLines,
      fixmeCount: fixmeLines,
      hackCount: hackLines,
      anyCount: anyLines,
    }
  } catch {
    return { todoCount: 0, fixmeCount: 0, hackCount: 0, anyCount: 0 }
  }
}

// ---------------------------------------------------------------------------
// 3. 에이전트 주간 실패율 (BotLog 7일)
// ---------------------------------------------------------------------------

interface AgentFailureRate {
  botType: string
  total: number
  failed: number
  failRate: number
}

async function getAgentFailureRates(): Promise<AgentFailureRate[]> {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)

  const logs = await prisma.botLog.findMany({
    where: { createdAt: { gte: sevenDaysAgo } },
    select: { botType: true, status: true },
  })

  const byType = new Map<string, { total: number; failed: number }>()
  for (const log of logs) {
    const stat = byType.get(log.botType) ?? { total: 0, failed: 0 }
    stat.total++
    if (log.status === 'FAILED') stat.failed++
    byType.set(log.botType, stat)
  }

  return Array.from(byType.entries())
    .map(([botType, stat]) => ({
      botType,
      total: stat.total,
      failed: stat.failed,
      failRate: stat.total > 0 ? (stat.failed / stat.total) * 100 : 0,
    }))
    .filter((r) => r.failRate > 10) // 10% 이상 실패율만 리포트
    .sort((a, b) => b.failRate - a.failRate)
}

// ---------------------------------------------------------------------------
// 4. 성능 추세 (health-check 7일 latency 평균)
// ---------------------------------------------------------------------------

interface PerformanceTrend {
  avgDb: number
  avgSite: number
  avgApi: number
  sampleCount: number
}

async function getPerformanceTrend(): Promise<PerformanceTrend | null> {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)

  const logs = await prisma.botLog.findMany({
    where: {
      botType: 'CTO',
      action: 'HEALTH_CHECK',
      status: 'SUCCESS',
      createdAt: { gte: sevenDaysAgo },
    },
    select: { details: true },
    orderBy: { createdAt: 'desc' },
    take: 50,
  })

  if (logs.length === 0) return null

  let dbTotal = 0, siteTotal = 0, apiTotal = 0, count = 0
  for (const log of logs) {
    try {
      const data = JSON.parse(log.details ?? '{}') as { latency?: { db?: number; site?: number; api?: number } }
      if (data.latency) {
        dbTotal += data.latency.db ?? 0
        siteTotal += data.latency.site ?? 0
        apiTotal += data.latency.api ?? 0
        count++
      }
    } catch { /* 파싱 실패 */ }
  }

  if (count === 0) return null

  return {
    avgDb: Math.round(dbTotal / count),
    avgSite: Math.round(siteTotal / count),
    avgApi: Math.round(apiTotal / count),
    sampleCount: count,
  }
}

// ---------------------------------------------------------------------------
// 메인
// ---------------------------------------------------------------------------

async function main() {
  console.log('[CTO] 주간 아키텍처 리뷰 시작')
  const start = Date.now()

  try {
    // 1. Orphaned 핸들러
    const orphanCheck = checkOrphanedHandlers()
    console.log(`[CTO] Orphaned: ${orphanCheck.orphaned.length}개, DISPATCH: ${orphanCheck.dispatchOnly.length}개, LOCAL: ${orphanCheck.localOnly.length}개`)

    // 2. 기술 부채
    const debt = countTechDebt()
    console.log(`[CTO] 기술 부채 — TODO: ${debt.todoCount}, FIXME: ${debt.fixmeCount}, HACK: ${debt.hackCount}, any: ${debt.anyCount}`)

    // 3. 에이전트 실패율
    const failureRates = await getAgentFailureRates()
    console.log(`[CTO] 실패율 10%+ 에이전트: ${failureRates.length}개`)

    // 4. 성능 추세
    const perf = await getPerformanceTrend()

    // 리포트 구성
    const issues: string[] = []

    // Orphaned 경고
    if (orphanCheck.orphaned.length > 0) {
      issues.push(`🔴 Orphaned 핸들러 ${orphanCheck.orphaned.length}개 (크론 미연결):\n${orphanCheck.orphaned.map((k) => `  • ${k}`).join('\n')}`)
    }

    // 에이전트 실패율 경고
    if (failureRates.length > 0) {
      const failList = failureRates
        .map((r) => `  • ${r.botType}: ${r.failRate.toFixed(1)}% (${r.failed}/${r.total})`)
        .join('\n')
      issues.push(`🟠 에이전트 실패율 경고:\n${failList}`)
    }

    const debtLine = `TODO: ${debt.todoCount} / FIXME: ${debt.fixmeCount} / HACK: ${debt.hackCount} / any: ${debt.anyCount}`
    const perfLine = perf
      ? `DB ${perf.avgDb}ms / Site ${perf.avgSite}ms / API ${perf.avgApi}ms (${perf.sampleCount}개 샘플 평균)`
      : '헬스체크 데이터 없음 (BotLog 없음)'

    const body = [
      `*기술 부채 지표:* ${debtLine}`,
      `*성능 추세 (7일):* ${perfLine}`,
      '',
      issues.length > 0 ? `*⚠️ 발견된 이슈:*\n${issues.join('\n\n')}` : '✅ 이슈 없음',
      '',
      `_DISPATCH ONLY: ${orphanCheck.dispatchOnly.length}개 / LOCAL ONLY: ${orphanCheck.localOnly.length}개 (정상)_`,
    ].join('\n')

    const level = issues.length > 0 ? 'important' : 'info'
    const title = issues.length > 0
      ? `CTO 주간 아키텍처 리뷰 ⚠️ ${issues.length}개 이슈`
      : 'CTO 주간 아키텍처 리뷰 ✅ 정상'

    await notifySlack({ level, agent: 'CTO', title, body })

    const summary = `아키텍처 리뷰 완료 — Orphaned ${orphanCheck.orphaned.length}개, 실패율 경고 ${failureRates.length}개, 부채: ${debtLine}`

    await prisma.botLog.create({
      data: {
        botType: 'CTO',
        action: 'ARCH_REVIEW',
        status: issues.length > 0 ? 'PARTIAL' : 'SUCCESS',
        details: summary,
        itemCount: issues.length,
        executionTimeMs: Date.now() - start,
      },
    })

    console.log(`[CTO] ${summary}`)
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err)
    console.error('[CTO] 아키텍처 리뷰 실패:', errorMsg)

    await notifySlack({
      level: 'important',
      agent: 'CTO',
      title: 'CTO 아키텍처 리뷰 실패',
      body: errorMsg,
    })

    await prisma.botLog.create({
      data: {
        botType: 'CTO',
        action: 'ARCH_REVIEW',
        status: 'FAILED',
        details: errorMsg,
        itemCount: 0,
        executionTimeMs: Date.now() - start,
      },
    })
  } finally {
    await disconnect()
  }
}

main()
