/**
 * CTO 에이전트 — 코드 품질 가비지 컬렉션 (garbage-collect)
 *
 * 매주 월요일 09:30 KST (00:30 UTC) 자동 실행 — arch-review 직후
 *
 * 하네스 원칙: "성공은 조용히, 실패만 시끄럽게"
 * - 문제 없으면: BotLog만 기록, Slack 알림 없음
 * - 문제 있으면: Slack #qa 알림 + 구체적 수정 목록 제공
 *
 * 검사 항목:
 * 1. TypeScript 에러 수 (tsc --noEmit)
 * 2. ESLint 위반 파일 목록
 * 3. CLAUDE.md 금지 패턴 (any 타입, Raw SQL) 샘플 체크
 */

import { execSync } from 'child_process'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { prisma, disconnect } from '../core/db.js'
import { notifySlack } from '../core/notifier.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const ROOT = resolve(__dirname, '../..')

// ---------------------------------------------------------------------------
// 1. TypeScript 에러 체크
// ---------------------------------------------------------------------------

function checkTypeScript(): { errorCount: number; errors: string[] } {
  try {
    execSync('npx tsc --noEmit --skipLibCheck 2>&1', { cwd: ROOT, encoding: 'utf-8' })
    return { errorCount: 0, errors: [] }
  } catch (err) {
    const output = (err as { stdout?: string; stderr?: string }).stdout ?? String(err)
    const lines = output.split('\n').filter(l => l.includes('error TS'))
    // 에러 목록 — 최대 10개만
    const errors = lines.slice(0, 10).map(l => l.replace(ROOT + '/', '').trim())
    return { errorCount: lines.length, errors }
  }
}

// ---------------------------------------------------------------------------
// 2. ESLint 위반 체크
// ---------------------------------------------------------------------------

interface EslintResult {
  violationFileCount: number
  violationCount: number
  topFiles: string[]
}

function checkEslint(): EslintResult {
  try {
    execSync(`npx eslint src --ext .ts,.tsx --max-warnings 0 --format compact 2>&1`, {
      cwd: ROOT,
      encoding: 'utf-8',
    })
    return { violationFileCount: 0, violationCount: 0, topFiles: [] }
  } catch (err) {
    const output = (err as { stdout?: string }).stdout ?? String(err)
    const lines = output.split('\n').filter(l => l.trim() && !l.startsWith('npm'))
    // compact 형식: "파일경로: line col, severity - message  rule"
    const fileSet = new Set<string>()
    for (const line of lines) {
      const match = line.match(/^([^:]+\.tsx?):\s*\d+/)
      if (match) fileSet.add(match[1].replace(ROOT + '/', ''))
    }
    const topFiles = Array.from(fileSet).slice(0, 5)
    return {
      violationFileCount: fileSet.size,
      violationCount: lines.length,
      topFiles,
    }
  }
}

// ---------------------------------------------------------------------------
// 3. CLAUDE.md 금지 패턴 체크
// ---------------------------------------------------------------------------

interface ProhibitedPatterns {
  anyTypeCount: number
  rawSqlCount: number
}

function checkProhibitedPatterns(): ProhibitedPatterns {
  let anyTypeCount = 0
  let rawSqlCount = 0

  try {
    const anyResult = execSync(
      `grep -rn ": any" ${ROOT}/src --include="*.ts" --include="*.tsx" 2>/dev/null | grep -v "// eslint-disable" | grep -v ".d.ts" | wc -l`,
      { encoding: 'utf-8' },
    ).trim()
    anyTypeCount = parseInt(anyResult, 10) || 0
  } catch { /* 패턴 없음 */ }

  try {
    const sqlResult = execSync(
      `grep -rn "\\$queryRaw\\|\\$executeRaw" ${ROOT}/src --include="*.ts" --include="*.tsx" 2>/dev/null | wc -l`,
      { encoding: 'utf-8' },
    ).trim()
    rawSqlCount = parseInt(sqlResult, 10) || 0
  } catch { /* 패턴 없음 */ }

  return { anyTypeCount, rawSqlCount }
}

// ---------------------------------------------------------------------------
// 메인
// ---------------------------------------------------------------------------

export async function run() {
  console.log('[CTO] 코드 품질 가비지 컬렉션 시작')
  const start = Date.now()

  try {
    const [tsResult, eslintResult, prohibited] = await Promise.all([
      Promise.resolve(checkTypeScript()),
      Promise.resolve(checkEslint()),
      Promise.resolve(checkProhibitedPatterns()),
    ])

    console.log(`[CTO] tsc 에러: ${tsResult.errorCount}개`)
    console.log(`[CTO] ESLint 위반: ${eslintResult.violationCount}개 (${eslintResult.violationFileCount}파일)`)
    console.log(`[CTO] any타입: ${prohibited.anyTypeCount}줄, Raw SQL: ${prohibited.rawSqlCount}줄`)

    // 문제 목록 수집
    const issues: string[] = []

    if (tsResult.errorCount > 0) {
      issues.push(`TypeScript 에러 ${tsResult.errorCount}개\n  → ${tsResult.errors.join('\n  → ')}`)
    }

    if (eslintResult.violationCount > 0) {
      issues.push(
        `ESLint 위반 ${eslintResult.violationCount}건 (${eslintResult.violationFileCount}개 파일)\n  → ${eslintResult.topFiles.join(', ')}`,
      )
    }

    // any타입은 임계값 이상일 때만 경고 (10줄 초과)
    if (prohibited.anyTypeCount > 10) {
      issues.push(`any 타입 과다 사용: ${prohibited.anyTypeCount}줄 — CLAUDE.md "TypeScript any 사용 금지" 규칙 위반`)
    }

    if (prohibited.rawSqlCount > 0) {
      issues.push(`Raw SQL 발견: ${prohibited.rawSqlCount}줄 (\$queryRaw/\$executeRaw) — Prisma ORM만 사용해야 함`)
    }

    const hasIssues = issues.length > 0
    const summary = hasIssues
      ? `코드 품질 이슈 ${issues.length}건 발견`
      : `코드 품질 정상 (tsc 0, ESLint 0, any ${prohibited.anyTypeCount}줄)`

    // 문제 있을 때만 Slack 알림 (성공은 조용히)
    if (hasIssues) {
      await notifySlack({
        level: 'important',
        agent: 'CTO',
        title: `[주간 가비지 컬렉션] 코드 품질 이슈 ${issues.length}건`,
        body: [
          ...issues,
          '',
          '→ 수정 방법: 해당 파일에서 오류 수정 후 /done으로 커밋 (pre-commit이 자동 차단)',
        ].join('\n'),
      })
    }

    await prisma.botLog.create({
      data: {
        botType: 'CTO',
        action: 'GARBAGE_COLLECT',
        status: hasIssues ? 'PARTIAL' : 'SUCCESS',
        details: summary,
        itemCount: issues.length,
        executionTimeMs: Date.now() - start,
      },
    })

    console.log(`[CTO] ${summary}`)
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err)
    console.error('[CTO] 가비지 컬렉션 실패:', errorMsg)

    await prisma.botLog.create({
      data: {
        botType: 'CTO',
        action: 'GARBAGE_COLLECT',
        status: 'FAILED',
        details: errorMsg,
        itemCount: 0,
        executionTimeMs: Date.now() - start,
      },
    })
  } finally {
    await disconnect()
    process.exit(0)
  }
}

run()
