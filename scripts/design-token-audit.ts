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
import { join, relative, resolve } from 'path'
import ts from 'typescript'

/**
 * 검사 루트. 기본은 cwd 지만 `--root=` 로 바꿀 수 있다 —
 * 🔴 계약 테스트가 **실제 소스 파일을 수정하지 않고** fixture 로 양성 대조를 하기 위해서다.
 *    소스를 임시로 고치는 테스트는 vitest 병렬 실행에서 다른 파일의 테스트를 깨뜨린다.
 */
const rootArg = process.argv.find((a) => a.startsWith('--root='))
const ROOT = rootArg ? resolve(process.cwd(), rootArg.slice('--root='.length)) : process.cwd()
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
  (p) => p.includes('opengraph-image'), // next/og·Satori 는 CSS 변수를 해석하지 않는다
  // 🔴 `src/components/icons/` 전체 예외는 **근거가 없어 제거했다** — 하드코딩 색 0건이었다.
  //    근거 없는 예외는 나중에 진짜 위반을 숨긴다.
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
/** quoted string **별로** 나눈 class token 목록. 삼항의 분기를 섞지 않는다. */
function getClassTokenGroups(line: string): string[][] {
  const groups: string[][] = []
  const re = /["']([^"'\n]+)["']/g
  let m: RegExpExecArray | null
  while ((m = re.exec(line)) !== null) {
    groups.push(m[1].split(/\s+/).filter(Boolean))
  }
  return groups
}

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
      // 🔴 **quoted string 하나 단위로** 본다. 줄 전체로 보면 삼항의 서로 다른 분기가 합쳐져
      //    `active ? 'bg-primary/90 text-white' : 'bg-white text-foreground'` 가 위반으로 잡힌다
      //    (2026-09-15 실측 오탐). 한 요소에 실제로 같이 붙는 조합만 위반이다.
      for (const group of getClassTokenGroups(l)) {
        const hasStaticBgPrimary = group.some((t) => /^bg-primary\/\d/.test(t) && !t.includes(':'))
        const hasTextForeground = group.some((t) => t === 'text-foreground')
        if (!hasStaticBgPrimary || !hasTextForeground) continue
        if (!group.some((t) => t === 'text-primary-text')) return true
      }
      return false
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


// ──────────────────────────────────────────────────────────────
// R11 — raw standard control (JSX AST)
// ──────────────────────────────────────────────────────────────

/**
 * 공용 컴포넌트가 있는데 표준 컨트롤을 직접 만든 곳.
 *
 * 🔴 **줄 단위 정규식으로는 못 잡는다.** JSX 는 여러 줄에 걸쳐 쓰이고
 *    `<button\n  type="submit"\n  className=...>` 같은 형태가 흔하다.
 *    그래서 TypeScript 의 JSX 파서로 **엘리먼트 단위**로 센다.
 *
 * 게이트 방식: 기존 부채는 baseline 으로 허용하되 **개수가 늘면 exit 1** 이다.
 * 기존 화면은 컨트롤마다 스킨이 달라 한 번에 못 바꾼다 — 막아야 하는 건 **새 부채**다.
 */
const RAW_CONTROL_TAGS = new Set(['button', 'input', 'select', 'textarea'])

/**
 * 공용 컴포넌트 자신은 표준 컨트롤을 **만들어야** 한다 — 여기가 유일한 출처다.
 * `Button`·`Input` 뿐 아니라 `Chip`·`BottomSheet` 처럼 `src/components/ui/` 의
 * primitive 전부가 해당한다. 이들을 규칙으로 막으면 만들 방법이 없어진다.
 */
function isRawControlExempt(rel: string): boolean {
  return rel.startsWith('src/components/ui/')
}

function findRawControls(rel: string, content: string): Violation[] {
  if (isRawControlExempt(rel)) return []
  if (!/\.tsx$/.test(rel)) return []

  const sf = ts.createSourceFile(rel, content, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const out: Violation[] = []

  const visit = (node: ts.Node): void => {
    const tagNode =
      ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node) ? node : undefined
    if (tagNode) {
      const tag = tagNode.tagName.getText(sf)
      if (RAW_CONTROL_TAGS.has(tag)) {
        const { line } = sf.getLineAndCharacterOfPosition(tagNode.getStart(sf))
        out.push({
          ruleId: 'R11',
          ruleName: 'raw-standard-control',
          severity: 'warn',
          file: rel,
          line: line + 1,
          code: `<${tag} …> — 공용 ${tag === 'button' ? 'Button' : 'Input/Textarea/Select'} 대신 직접 구현`,
        })
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(sf)
  return out
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

  violations.push(...findRawControls(rel, content))

  return violations
}

/** 🔴 baseline·게이트 대상 — `error` 전부 + **R11**(raw 표준 컨트롤). */
function isGating(v: Violation): boolean {
  return v.severity === 'error' || v.ruleId === 'R11'
}

/**
 * 파일별 위반 수 — baseline 비교 단위. 줄 번호는 쉽게 흔들려서 쓰지 않는다.
 *
 * 🔴 담는 것: `error` 전부 + **R11**.
 *    R11 은 severity 가 warn 이지만 **개수 증가는 막는다** — 기존 부채는 baseline 으로
 *    허용하되 새 raw 컨트롤은 통과시키지 않는다. 나머지 warn(R04~R07)은 리포트 전용이다.
 */
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

/**
 * 🔴 **`process.exit()` 를 쓰지 않는다.**
 *  stdout 이 파이프일 때 `console.log` 는 **비동기**로 쓰인다.
 *  `process.exit()` 는 아직 못 쓴 버퍼를 버리고 즉시 끝내서 **출력이 잘린다** —
 *  CI 에서 리포트 뒷부분(`strict PASS` 요약)이 통째로 사라져 테스트가 깨졌다(2026-09-15 실측).
 *  그래서 main 은 **exit code 를 반환만** 하고, 최상단이 `process.exitCode` 에 담는다.
 *  Node 는 stdout 을 다 비운 뒤 그 코드로 종료한다.
 */
function main(): number {
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
    return 0
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

  const currentErrors = toBaseline(allViolations.filter(isGating))

  if (updateBaseline) {
    writeFileSync(join(ROOT, BASELINE_PATH), JSON.stringify(currentErrors, null, 2) + '\n')
    console.log(`\nbaseline 갱신: ${BASELINE_PATH} (${Object.keys(currentErrors).length}항목 — error + R11)`)
    return 0
  }

  if (!strict) {
    // 기본 실행은 report-only 다 — 전체 부채를 보여주되 게이트하지 않는다.
    return 0
  }

  // ── strict: ① 변경 파일의 위반 ② baseline 초과 ────────────────────
  // 🔴 게이트는 **error 만**이다. `warn`(R11 raw 컨트롤)은 기존 화면이 컨트롤마다 스킨이 달라
  //    한 번에 못 바꾸는 부채라, 게이트로 삼으면 파일을 한 줄만 고쳐도 CI 가 막힌다.
  //    warn 은 리포트에 남아 리뷰가 본다.
  const gating = allViolations.filter(isGating)
  // 🔴 **R11 은 "변경 파일에 있으면 실패" 대상이 아니다.**
  //    R11 의 계약은 **개수 증가 금지**다(baseline 비교). 존재만으로 막으면,
  //    raw 컨트롤이 있는 화면 파일을 토큰 치환 같은 무관한 이유로 한 줄만 고쳐도 CI 가 멈춘다.
  //    그건 "기존 부채를 한 번에 red 로 만들지 않는다" 는 전제와 정면으로 어긋난다.
  //    error(R08·R09·R10 등)는 고치기 싸고 국소적이라 존재만으로 막는다.
  const inChanged = gating.filter((v) => v.ruleId !== 'R11' && changed.has(v.file))
  const base = readBaseline()
  const regressions = Object.entries(currentErrors).filter(([k, n]) => n > (base[k] ?? 0))

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
    return 0
  }
  return 1
}

// exit code 만 담는다 — 출력이 다 나간 뒤 Node 가 이 코드로 끝낸다.
process.exitCode = main()
