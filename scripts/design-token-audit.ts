#!/usr/bin/env node
/**
 * design-token-audit.ts — 디자인 토큰 계약 audit.
 *
 * ── 🔴 왜 고쳤나 (2026-09-15 진단) ──────────────────────────────
 *  이 도구는 **false-green** 이었다.
 *   · violation 이 있어도 항상 `exit 0` 이라 게이트가 될 수 없었다
 *   · CI·husky 어디에서도 호출되지 않아 **자동 실행이 0회**였다
 *   · `src/app`+`src/components` 375개 중 97개(25%)를 제외했고 — admin 89개가 통째로 빠졌다
 *   · `src/lib` 은 INCLUDE_DIRS 에 아예 없어 179파일이 미검사였다
 *  그래서 admin 터치규칙 5%·하드코딩 HEX 203회가 한 번도 잡히지 않았다.
 *
 * ── 게이트 방식 ─────────────────────────────────────────────────
 *  기존 부채를 한 번에 red 로 만들지 않는다. **baseline + changed-file strict** 다.
 *   · 기본 실행(`npm run design:audit`)은 report-only · exit 0 — 전체 현황 파악용
 *   · `--strict` 는 아래 둘 중 하나라도 있으면 **exit 1**
 *       ① 변경된 파일 안의 위반 (`--changed=a.tsx,b.tsx`)
 *       ② baseline 보다 늘어난 위반 (새 위반)
 *   · baseline 갱신은 `--update-baseline` — 부채를 갚으면 줄어든다(늘릴 때는 리뷰가 본다)
 *
 * 사용:
 *   npm run design:audit
 *   npx tsx scripts/design-token-audit.ts --output=json
 *   npx tsx scripts/design-token-audit.ts --strict --changed=src/a.tsx,src/b.tsx
 *   npx tsx scripts/design-token-audit.ts --update-baseline
 */
import { readFileSync, readdirSync, writeFileSync } from 'fs'
import { join, relative } from 'path'

const ROOT = process.cwd()
/** 🔴 `src/lib` 포함 — 여기 색·크기가 흩어져 있어도 화면에 그대로 나간다. */
const INCLUDE_DIRS = ['src/app', 'src/components', 'src/lib']

const BASELINE_PATH = 'scripts/design-audit-baseline.json'

/**
 * 제외는 **검사할 수 없는 것**만 남긴다. admin 은 이제 검사한다 —
 * 밀도가 다를 뿐 토큰 계약은 같고, 제외해 두면 5% 같은 수치가 영원히 안 보인다.
 */
const EXCLUDE_MATCHERS: Array<(rel: string) => boolean> = [
  (p) => p.startsWith('src/generated/'),      // Prisma 생성물 — 우리가 쓰지 않는다
  (p) => /\.spec\.(ts|tsx)$/.test(p),
  (p) => /\.test\.(ts|tsx)$/.test(p),
  (p) => p === 'src/lib/design-tokens.ts',    // 토큰 이름을 나열하는 계약 정본
  (p) => p === 'src/app/globals.css',         // 토큰 정의 자체
]

/**
 * CSS 변수를 **쓸 수 없는** 문맥. 토큰 우회가 아니라 기술적 제약이다.
 * 분류 근거는 `src/lib/design-tokens.ts` 의 `NO_CSS_VAR_CONTEXTS` 에 있다.
 */
const NO_CSS_VAR_FILES: Array<(rel: string) => boolean> = [
  (p) => p.includes('opengraph-image'),        // next/og·Satori 는 CSS 변수를 해석하지 않는다
  (p) => p.startsWith('src/components/icons/'), // SVG presentation attribute
]

type Severity = 'error' | 'warn'

interface RuleContext {
  /** repo 기준 상대 경로 */
  file: string
  /** CSS 변수를 못 쓰는 문맥인가 (OG·SVG) */
  noCssVar: boolean
}

interface Rule {
  id: string
  name: string
  severity: Severity
  check: (line: string, ctx: RuleContext) => boolean
}

/** 토큰으로 이미 존재하는 색 — 하드코딩하면 브랜드 변경 때 여기만 남는다. */
const TOKENIZED_HEX = new Set(
  ['#FF6F61', '#E85D50', '#B23B2E', '#FEE500', '#191919', '#F9F5F0', '#FFE9E5', '#FFF8F6', '#FFD4CC'],
)

/** 색이 **스타일로 쓰인** 줄인가 — Tailwind arbitrary, CSS 속성, style 객체. */
const STYLE_CONTEXT = /-\[#|(?:color|background|backgroundColor|fill|stroke|border|borderColor|boxShadow|gradient)\s*[:=]|style=/

/** 밀도 토큰이 있는데 px 를 직접 적은 경우 */
const HARDCODED_CONTROL_PX = /\b(?:min-h|h|min-w|w)-\[(?:36|44|48|52|56)px\]/

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
  {
    id: 'R08',
    name: 'hardcoded-tokenized-color',
    severity: 'error',
    // 토큰이 **이미 있는** 색을 HEX 로 적었다. OG·SVG 처럼 CSS 변수를 못 쓰는 곳은 제외한다.
    check: (l, ctx) => {
      if (ctx.noCssVar) return false
      // 🔴 **스타일 문맥에서만** 잡는다. 설명 문구에 색 코드를 적는 건 위반이 아니다
      //    (실제로 안내 카피 안의 `#FF6F61` 이 오탐으로 잡혔다).
      if (!STYLE_CONTEXT.test(l)) return false
      const m = l.match(/#[0-9a-fA-F]{6}\b/g)
      return m !== null && m.some((h) => TOKENIZED_HEX.has(h.toUpperCase()))
    },
  },
  {
    id: 'R09',
    name: 'hardcoded-control-size',
    severity: 'error',
    // 밀도 토큰(`min-h-control` 등)이 있는데 px 를 직접 적었다.
    // 이 수치가 흩어지면 터치 규칙이 어디서 깨졌는지 셀 수 없다.
    check: (l) => HARDCODED_CONTROL_PX.test(l),
  },
  {
    id: 'R10',
    name: 'hsl-token-misuse',
    severity: 'error',
    // HSL triplet 토큰을 `hsl()` 없이 쓰면 **색이 아예 안 나온다**.
    // 실제로 TipTapEditor 에서 이 형태로 색이 죽어 있었다(2026-09-15).
    check: (l) => /(?<!hsl\()var\(--(?:background|foreground|card|popover|primary|secondary|muted|accent|destructive|border|input|ring|success|warning|info)(?:-[a-z]+)?\)/.test(l),
  },
  {
    id: 'R11',
    name: 'raw-standard-control',
    severity: 'warn',
    // 공용 컴포넌트가 있는데 표준 컨트롤을 직접 만들었다.
    // 🔴 error 가 아니라 warn 이다 — 기존 화면은 컨트롤마다 스킨이 달라서
    //    한 번에 바꾸면 외형이 바뀐다. **새로 만드는 것**만 막는 게 목적이다.
    check: (l) => /<(?:button|input|select|textarea)\b[^>]*className=/.test(l),
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
  const ctx: RuleContext = { file: rel, noCssVar: NO_CSS_VAR_FILES.some((m) => m(rel)) }
  const lines = content.split('\n')

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (COMMENT_RE.test(line)) continue

    for (const rule of RULES) {
      if (!rule.check(line, ctx)) continue
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

/** 파일별 위반 수 — baseline 비교 단위. 줄 번호는 쉽게 흔들려서 쓰지 않는다. */
type Baseline = Record<string, number>

function toBaseline(violations: Violation[]): Baseline {
  const out: Baseline = {}
  for (const v of violations) out[`${v.file}::${v.ruleId}`] = (out[`${v.file}::${v.ruleId}`] ?? 0) + 1
  return Object.fromEntries(Object.entries(out).sort(([a], [b]) => a.localeCompare(b)))
}

function readBaseline(): Baseline {
  try {
    return JSON.parse(readFileSync(join(ROOT, BASELINE_PATH), 'utf8')) as Baseline
  } catch {
    return {}
  }
}

function main(): void {
  const outputJson = process.argv.includes('--output=json')
  const strict = process.argv.includes('--strict')
  const updateBaseline = process.argv.includes('--update-baseline')
  const changedArg = process.argv.find((a) => a.startsWith('--changed='))
  const changed = new Set(
    (changedArg?.slice('--changed='.length) ?? '')
      .split(',')
      .map((f) => f.trim().replace(/\\/g, '/'))
      .filter(Boolean),
  )

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

  const current = toBaseline(allViolations)

  if (updateBaseline) {
    writeFileSync(join(ROOT, BASELINE_PATH), JSON.stringify(current, null, 2) + '\n')
    console.log(`\nbaseline 갱신: ${BASELINE_PATH} (${Object.keys(current).length}항목)`)
    process.exit(0)
  }

  if (!strict) {
    // 기본 실행은 report-only 다 — 전체 부채를 보여주되 게이트하지 않는다.
    process.exit(0)
  }

  // ── strict: ① 변경 파일의 위반 ② baseline 초과 ────────────────────
  const inChanged = allViolations.filter((v) => changed.has(v.file))
  const base = readBaseline()
  const regressions = Object.entries(current).filter(([k, n]) => n > (base[k] ?? 0))

  if (inChanged.length > 0) {
    console.log(`\n🔴 변경한 파일에 위반 ${inChanged.length}건 — 고치고 다시 올려라.`)
    for (const v of inChanged) console.log(`   ${v.file}:${v.line} ${v.ruleId} ${v.ruleName}`)
  }
  if (regressions.length > 0) {
    console.log(`\n🔴 baseline 보다 늘어난 위반 ${regressions.length}건 — 새 부채다.`)
    for (const [k, n] of regressions) console.log(`   ${k}  ${base[k] ?? 0} → ${n}`)
  }

  if (inChanged.length === 0 && regressions.length === 0) {
    console.log('\n✅ strict PASS — 변경 파일 위반 0 · baseline 초과 0')
    process.exit(0)
  }
  process.exit(1)
}

main()
