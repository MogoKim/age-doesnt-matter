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

/**
 * 라인 안의 quoted string 내 class token 목록 반환.
 * "foo bar baz" 또는 'foo bar baz' → ['foo', 'bar', 'baz']
 * variant prefix(hover:, md: 등)도 토큰 그대로 포함.
 */
function getClassTokens(line: string): string[] {
  const tokens: string[] = []
  const re = /["']([^"'\n]+)["']/g
  let m: RegExpExecArray | null
  while ((m = re.exec(line)) !== null) {
    for (const t of m[1].split(/\s+/)) {
      if (t) tokens.push(t)
    }
  }
  return tokens
}

const RULES: Rule[] = [
  {
    id: 'R01',
    name: 'hover-text-primary',
    severity: 'error',
    // token === 'hover:text-primary' 정확 일치만
    // hover:text-primary-text / hover:text-primary-foreground 제외
    check: (l) => getClassTokens(l).some((t) => t === 'hover:text-primary'),
  },
  {
    id: 'R02',
    name: 'bg-primary-transparent-foreground',
    severity: 'error',
    // 조건 1: static bg-primary/N 토큰 (콜론 없음 — hover:/md: 등 variant 제외)
    // 조건 2: text-foreground 토큰 정확 일치 (text-muted-foreground 부분매칭 방지)
    // 예외: text-primary-text 토큰도 있으면 올바른 조합 → pass
    check: (l) => {
      const tokens = getClassTokens(l)
      const hasStaticBgPrimary = tokens.some(
        (t) => /^bg-primary\/\d/.test(t) && !t.includes(':')
      )
      const hasTextForeground = tokens.some((t) => t === 'text-foreground')
      if (!hasStaticBgPrimary || !hasTextForeground) return false
      return !tokens.some((t) => t === 'text-primary-text')
    },
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
    // token === 'text-primary' 정확 일치만
    // text-primary-text / text-primary-foreground 제외
    // hover:text-primary는 R01이 error로 담당 — R04에서 중복 방지
    check: (l) => getClassTokens(l).some((t) => t === 'text-primary'),
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
