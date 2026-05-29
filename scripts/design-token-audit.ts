#!/usr/bin/env node
/**
 * design-token-audit.ts — 디자인 토큰 재발 방지 audit (report-only)
 *
 * 사용:
 *   npm run design:audit
 *   npx tsx scripts/design-token-audit.ts --output=json
 *
 * violation이 있어도 exit code는 항상 0 (report-only).
 */
import { readFileSync, readdirSync } from 'fs'
import { join, relative } from 'path'

const ROOT = process.cwd()
const INCLUDE_DIRS = ['src/app', 'src/components']

// 제외 경로 (상대 경로 기준)
const EXCLUDE_MATCHERS: Array<(rel: string) => boolean> = [
  (p) => p.startsWith('src/app/admin/'),
  (p) => p.startsWith('src/components/admin/'),
  (p) => p.startsWith('src/app/dev/'),
  (p) => p.startsWith('src/app/landing/'),
  (p) => p.startsWith('src/components/features/landing/'),
  (p) => p.endsWith('LandingClient.tsx'),
  (p) => /\.spec\.(ts|tsx)$/.test(p),
  (p) => /\.test\.(ts|tsx)$/.test(p),
]

type Severity = 'error' | 'warn'

interface Rule {
  id: string
  name: string
  severity: Severity
  check: (line: string) => boolean
}

const RULES: Rule[] = [
  {
    id: 'R01',
    name: 'hover-text-primary',
    severity: 'error',
    // hover:text-primary 단독 — hover:text-primary-text / hover:text-primary-foreground는 정상
    check: (l) => /hover:text-primary(?![-/a-z])/.test(l),
  },
  {
    id: 'R02',
    name: 'bg-primary-transparent-foreground',
    severity: 'error',
    // bg-primary/숫자 + text-foreground 동일 줄 — text-primary-text 함께 있으면 정상
    check: (l) =>
      /bg-primary\/\d/.test(l) &&
      /\btext-foreground\b/.test(l) &&
      !/text-primary-text/.test(l),
  },
  {
    id: 'R03',
    name: 'hardcoded-hover-hex',
    severity: 'error',
    check: (l) => /hover:bg-\[#E85D50\]/i.test(l),
  },
  {
    id: 'R04',
    name: 'text-primary-standalone',
    severity: 'warn',
    // text-primary 단독 — text-primary-text / text-primary-foreground는 정상
    // border-primary / bg-primary는 text- 로 시작하지 않아 이 패턴에 매칭 안 됨
    check: (l) => /\btext-primary(?![-/a-z])/.test(l),
  },
  {
    id: 'R05',
    name: 'hardcoded-green',
    severity: 'warn',
    check: (l) => /(?:text|bg)-green-\d+/.test(l),
  },
  {
    id: 'R06',
    name: 'hardcoded-zinc',
    severity: 'warn',
    check: (l) => /bg-zinc-\d+/.test(l),
  },
  {
    id: 'R07',
    name: 'native-confirm',
    severity: 'warn',
    check: (l) => /\bconfirm\(/.test(l),
  },
]

// 주석 행 패턴
const COMMENT_RE = /^\s*(?:\/\/|\/\*|\*)/

interface Violation {
  ruleId: string
  ruleName: string
  severity: Severity
  file: string
  line: number
  code: string
}

function isExcluded(absPath: string): boolean {
  const rel = relative(ROOT, absPath).replace(/\\/g, '/')
  return EXCLUDE_MATCHERS.some((m) => m(rel))
}

function collectFiles(dir: string): string[] {
  const results: string[] = []

  function walk(current: string): void {
    try {
      const entries = readdirSync(current, { withFileTypes: true })
      for (const entry of entries) {
        const fullPath = join(current, entry.name)
        if (entry.isDirectory()) {
          walk(fullPath)
        } else if (
          entry.isFile() &&
          /\.(ts|tsx)$/.test(entry.name) &&
          !isExcluded(fullPath)
        ) {
          results.push(fullPath)
        }
      }
    } catch {
      // 접근 불가 디렉토리 무시
    }
  }

  walk(join(ROOT, dir))
  return results
}

function checkFile(absPath: string): Violation[] {
  const violations: Violation[] = []
  let content: string
  try {
    content = readFileSync(absPath, 'utf-8')
  } catch {
    return violations
  }

  const rel = relative(ROOT, absPath).replace(/\\/g, '/')
  const lines = content.split('\n')

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (COMMENT_RE.test(line)) continue

    for (const rule of RULES) {
      if (!rule.check(line)) continue
      violations.push({
        ruleId: rule.id,
        ruleName: rule.name,
        severity: rule.severity,
        file: rel,
        line: i + 1,
        code: line.trim().slice(0, 120),
      })
    }
  }

  return violations
}

function main(): void {
  const outputJson = process.argv.includes('--output=json')

  const files: string[] = []
  for (const dir of INCLUDE_DIRS) {
    files.push(...collectFiles(dir))
  }

  const allViolations: Violation[] = []
  for (const file of files) {
    allViolations.push(...checkFile(file))
  }

  const errorCount = allViolations.filter((v) => v.severity === 'error').length
  const warnCount = allViolations.filter((v) => v.severity === 'warn').length

  if (outputJson) {
    const report = {
      checkedAt: new Date().toISOString(),
      summary: { files: files.length, error: errorCount, warn: warnCount },
      violations: allViolations,
    }
    process.stdout.write(JSON.stringify(report, null, 2) + '\n')
    process.exit(0)
  }

  for (const v of allViolations) {
    const tag = v.severity === 'error' ? '[ERROR]' : '[WARN] '
    console.log(`${tag} ${v.ruleId} ${v.ruleName}`)
    console.log(`  ${v.file}`)
    console.log(`  line ${v.line}`)
    console.log(`  > ${v.code}`)
    console.log()
  }

  console.log('────────────────────────────────────────────────')
  console.log(`총 ${files.length}개 파일 검사`)
  console.log(`ERROR: ${errorCount}건`)
  console.log(`WARN:  ${warnCount}건`)

  process.exit(0)
}

main()
