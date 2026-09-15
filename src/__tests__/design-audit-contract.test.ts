/**
 * `design:audit` **자체** 계약 테스트.
 *
 * ── 🔴 왜 필요한가 ──────────────────────────────────────────────
 *  2026-09-15 진단: 이 도구는 false-green 이었다.
 *   · violation 이 있어도 항상 `exit 0` → 게이트가 될 수 없었다
 *   · CI·husky 어디에서도 호출되지 않아 **자동 실행 0회**
 *   · `src/app`+`src/components` 375개 중 97개(25%) 제외 — admin 89개가 통째로 빠졌다
 *   · `src/lib` 은 범위 밖 → 179파일 미검사
 *  검사 도구가 조용히 아무것도 안 하는 사고는 검사 대상보다 위험하다. 여기서 고정한다.
 */
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'

const ROOT = process.cwd()
const SCRIPT = 'scripts/design-token-audit.ts'
const BASELINE = 'scripts/design-audit-baseline.json'
const read = (f: string) => readFileSync(resolve(ROOT, f), 'utf8')

/** audit 실행 — exit code 와 stdout 을 함께 돌려준다. */
function runAudit(args: string[] = []): { code: number; out: string } {
  try {
    const out = execFileSync('npx', ['tsx', SCRIPT, ...args], { cwd: ROOT, encoding: 'utf8' })
    return { code: 0, out }
  } catch (e) {
    const err = e as { status?: number; stdout?: string }
    return { code: err.status ?? -1, out: err.stdout ?? '' }
  }
}

/**
 * 🔴 **실제 소스를 건드리지 않는다.** 예전 판은 `board-registry.ts` 에 위반을 덧붙였다가
 *    되돌렸는데, vitest 는 테스트 **파일**을 병렬로 돌려서 그 사이 다른 테스트가
 *    오염된 파일을 읽을 수 있었다(CI 에서 실제로 깨졌다).
 *    지금은 임시 디렉터리에 최소 fixture 를 만들고 `--root=` 로 검사시킨다.
 */
const FIXTURES: string[] = []
function makeFixture(files: Record<string, string>, baseline: Record<string, number> = {}): string {
  const dir = mkdtempSync(join(tmpdir(), 'audit-fixture-'))
  FIXTURES.push(dir)
  for (const [rel, body] of Object.entries(files)) {
    const abs = join(dir, rel)
    mkdirSync(resolve(abs, '..'), { recursive: true })
    writeFileSync(abs, body)
  }
  mkdirSync(join(dir, 'scripts'), { recursive: true })
  writeFileSync(join(dir, BASELINE), JSON.stringify(baseline, null, 2))
  return dir
}
afterAll(() => {
  for (const d of FIXTURES) rmSync(d, { recursive: true, force: true })
})

describe('검사 범위 — 빠뜨린 곳이 없다', () => {
  const src = read(SCRIPT)

  it('🔴 `src/lib` 을 검사한다 — 179파일이 통째로 빠져 있었다', () => {
    expect(src).toMatch(/INCLUDE_DIRS = \[[^\]]*'src\/lib'/)
  })

  it('🔴 admin 을 더는 제외하지 않는다 — 89파일이 미검사였다', () => {
    const excludeBlock = src.slice(src.indexOf('EXCLUDE_MATCHERS'), src.indexOf('NO_CSS_VAR_FILES'))
    expect(excludeBlock).not.toContain("src/app/admin/")
    expect(excludeBlock).not.toContain("src/components/admin/")
  })

  // CSS 변수 예외의 검증은 **행동 테스트**가 정본이다
  //   → `describe('🔴 CSS 변수 예외는 **행동**으로 검증한다')`
  // 소스에 특정 문자열이 있는지 보는 검사는 false-green 이다:
  // 예외가 다른 이름·다른 경로로 살아 있어도 통과하고, 지금처럼 예외를 **제거**했을 때는
  // 오히려 "문자열이 있어야 한다" 고 주장하게 된다(정책과 정반대).
})

describe('게이트 — false-green 이 아니다', () => {
  it('기본 실행은 report-only 로 exit 0 이다', () => {
    expect(runAudit().code).toBe(0)
  })

  it('현재 baseline 에서 `--strict` 는 통과한다', () => {
    const r = runAudit(['--strict'])
    expect(r.out).toContain('strict PASS')
    expect(r.code).toBe(0)
  })

  it('🔴 양성 대조 — 새 위반이 생기면 `--strict` 가 exit 1 이다', () => {
    const dir = makeFixture({
      'src/lib/probe.ts': 'export const BAD = "bg-[#FF6F61] min-h-[52px]"\n',
    })
    const r = runAudit(['--strict', `--root=${dir}`])
    expect(r.code, 'strict 가 새 위반을 놓쳤다').toBe(1)
    expect(r.out).toContain('baseline 보다 늘어난 위반')
  })

  it('🔴 변경 파일에 위반이 있으면 baseline 안이라도 exit 1 이다', () => {
    // baseline 에 이미 있는 부채라도 "이번에 고친 파일" 이면 막는다.
    const dir = makeFixture(
      { 'src/lib/debt.ts': 'export const OLD = "bg-[#FF6F61]"\n' },
      { 'src/lib/debt.ts::R08': 1 },
    )
    expect(runAudit(['--strict', `--root=${dir}`]).code, 'baseline 안이면 통과해야 한다').toBe(0)
    const r = runAudit(['--strict', `--root=${dir}`, '--changed=src/lib/debt.ts'])
    expect(r.code).toBe(1)
    expect(r.out).toContain('변경한 파일에 위반')
  })

  it('🔴 리포트 전용 warn(R04~R07)은 게이트가 아니다', () => {
    // R11 은 개수 증가를 막지만, 나머지 warn 은 리포트로만 남는다.
    // 이것까지 게이트로 삼으면 기존 화면 파일을 한 줄만 고쳐도 CI 가 막힌다.
    const dir = makeFixture({
      'src/components/Warnish.tsx': 'export const X = () => { confirm("go") }\n', // R07
    })
    const r = runAudit(['--strict', `--root=${dir}`, '--changed=src/components/Warnish.tsx'])
    expect(r.code, 'report-only warn 이 게이트가 됐다').toBe(0)
  })
})

describe('🔴 stdout 파이프에서 출력이 잘리지 않는다', () => {
  // ── CI 실패 재현 고정 (2026-09-15) ────────────────────────────
  //  `process.exit()` 는 파이프로 나가는 stdout 의 **미완료 버퍼를 버린다**.
  //  그래서 CI 에서 리포트 뒷부분(`strict PASS` 요약)이 통째로 사라졌고
  //  `toContain('strict PASS')` 가 깨졌다. "재실행하니 됐다" 로 끝내면 다시 난다.
  //  main 이 exit code 를 **반환만** 하고 최상단이 `process.exitCode` 를 쓰게 고쳤다.

  it('스크립트에 즉시 종료(`process.exit`) 호출이 없다', () => {
    const code = read(SCRIPT)
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '')
    expect(code, 'process.exit() 가 남아 있으면 파이프 출력이 잘린다').not.toContain('process.exit(')
    expect(code).toContain('process.exitCode = main()')
  })

  it('report-only 실행의 **마지막 줄**까지 파이프로 나온다', () => {
    const r = runAudit()
    expect(r.out).toContain('총')
    expect(r.out.trimEnd().endsWith('건') || r.out.includes('WARN:')).toBe(true)
  })

  it('strict 실행의 요약 줄이 파이프로 나온다', () => {
    expect(runAudit(['--strict']).out).toContain('strict PASS')
  })

  it('🔴 `--output=json` 이 파이프에서 **끝까지 유효한 JSON** 이다', () => {
    // 잘리면 여기서 JSON.parse 가 던진다.
    const r = runAudit(['--output=json'])
    expect(r.code).toBe(0)
    const parsed = JSON.parse(r.out) as {
      summary: { files: number; error: number; warn: number }
      violations: unknown[]
    }
    expect(parsed.summary.files).toBeGreaterThan(400)
    expect(parsed.violations.length).toBe(parsed.summary.error + parsed.summary.warn)
  })
})

describe('🔴 CI 조합 재현 — `--changed` 가 걸린 상태의 판정', () => {
  // ── 왜 이 조합이 필요한가 ────────────────────────────────────
  //  `--changed` 없이만 검증하면 CI 가 실제로 도는 형태를 못 본다.
  //  실제로 이 PR 이 CI 에서 막혔던 원인이 **`--changed` 가 걸렸을 때의 R11 판정**이었다.
  //  CI 는 항상 `--strict --changed=<변경파일>` 로 돈다 — 그 조합을 그대로 고정한다.

  const FILE = 'src/components/M.tsx'
  const TWO = ONE_LINE + MULTILINE // raw 컨트롤 2개

  it('R11 baseline 1 · 현재 1 · --changed 포함 → exit 0', () => {
    const dir = makeFixture({ [FILE]: ONE_LINE }, { [`${FILE}::R11`]: 1 })
    const r = runAudit(['--strict', `--root=${dir}`, `--changed=${FILE}`])
    expect(r.code, 'R11 이 변경 파일 존재만으로 막았다').toBe(0)
    expect(r.out).toContain('strict PASS')
  })

  it('🔴 R11 baseline 1 · 현재 2 · --changed 포함 → exit 1', () => {
    const dir = makeFixture({ [FILE]: TWO }, { [`${FILE}::R11`]: 1 })
    const r = runAudit(['--strict', `--root=${dir}`, `--changed=${FILE}`])
    expect(r.code, '새 raw 컨트롤을 놓쳤다').toBe(1)
    expect(r.out).toContain('1 → 2')
  })

  it('R11 baseline 1 · 현재 0 · --changed 포함 → exit 0 (부채 갚기)', () => {
    const dir = makeFixture({ [FILE]: 'export const A = () => <div/>\n' }, { [`${FILE}::R11`]: 1 })
    const r = runAudit(['--strict', `--root=${dir}`, `--changed=${FILE}`])
    expect(r.code, '부채를 갚는 방향을 막았다').toBe(0)
  })

  it('🔴 ERROR baseline 1 · --changed 포함 → exit 1 (R11 과 다르다)', () => {
    const f = 'src/lib/debt.ts'
    const dir = makeFixture({ [f]: 'export const OLD = "bg-[#FF6F61]"\n' }, { [`${f}::R08`]: 1 })
    const r = runAudit(['--strict', `--root=${dir}`, `--changed=${f}`])
    expect(r.code, 'error 가 변경 파일에서 통과했다').toBe(1)
    expect(r.out).toContain('변경한 파일에 위반')
  })

  it('ERROR baseline 1 · --changed **미포함** → exit 0', () => {
    // 손대지 않은 파일의 기존 error 는 baseline 이 흡수한다.
    const f = 'src/lib/debt.ts'
    const dir = makeFixture({ [f]: 'export const OLD = "bg-[#FF6F61]"\n' }, { [`${f}::R08`]: 1 })
    expect(runAudit(['--strict', `--root=${dir}`]).code).toBe(0)
  })
})

describe('🔴 CSS 변수 예외는 **행동**으로 검증한다', () => {
  // ── 왜 행동 테스트인가 ────────────────────────────────────────
  //  "소스에 `icons/` 문자열이 없다" 는 검사는 false-green 이다 —
  //  예외가 다른 이름·다른 경로로 살아 있어도 통과한다.
  //  fixture 에 실제 위반을 넣고 **잡히는가/통과하는가**로 본다.

  const TOKENIZED = 'export const Icon = () => <svg fill="#FF6F61" stroke="#FEE500" />\n'

  it('🔴 `src/components/icons/` 는 예외가 아니다 — 토큰화 대상 HEX 가 R08 로 잡힌다', () => {
    const dir = makeFixture({ 'src/components/icons/Heart.tsx': TOKENIZED })
    const r = runAudit(['--output=json', `--root=${dir}`])
    const j = JSON.parse(r.out) as { violations: Array<{ ruleId: string; file: string }> }
    const r08 = j.violations.filter((v) => v.ruleId === 'R08')
    expect(r08.length, 'icons/ 가 여전히 예외로 빠져 있다').toBeGreaterThan(0)
    expect(r08[0].file).toBe('src/components/icons/Heart.tsx')
  })

  it('icons/ 위반이 strict 게이트에도 실제로 걸린다', () => {
    const dir = makeFixture({ 'src/components/icons/Heart.tsx': TOKENIZED })
    expect(runAudit(['--strict', `--root=${dir}`]).code).toBe(1)
  })

  it('🔴 `opengraph-image` 는 예외가 **실제로 통과**한다 — Satori 는 CSS 변수를 못 읽는다', () => {
    const dir = makeFixture({
      'src/app/(main)/jobs/[id]/opengraph-image.tsx': TOKENIZED,
    })
    const r = runAudit(['--output=json', `--root=${dir}`])
    const j = JSON.parse(r.out) as { violations: Array<{ ruleId: string }> }
    expect(j.violations.filter((v) => v.ruleId === 'R08'), 'OG 예외가 동작하지 않는다').toEqual([])
    expect(runAudit(['--strict', `--root=${dir}`]).code).toBe(0)
  })

  it('같은 HEX 라도 OG 밖이면 잡힌다 — 예외가 경로 한정인지 확인', () => {
    const dir = makeFixture({
      'src/app/(main)/jobs/[id]/opengraph-image.tsx': TOKENIZED,
      'src/components/Other.tsx': TOKENIZED,
    })
    const r = runAudit(['--output=json', `--root=${dir}`])
    const j = JSON.parse(r.out) as { violations: Array<{ ruleId: string; file: string }> }
    const files = new Set(j.violations.filter((v) => v.ruleId === 'R08').map((v) => v.file))
    expect(files.has('src/components/Other.tsx')).toBe(true)
    expect([...files].some((f) => f.includes('opengraph-image'))).toBe(false)
  })
})

describe('🔴 baseline 자체의 증가를 막는다', () => {
  // ── 왜 필요한가 ──────────────────────────────────────────────
  //  strict 게이트는 "현재 위반 vs 커밋된 baseline" 을 본다. 그런데 새 위반을 만들고
  //  **baseline 도 같이 올려서** 커밋하면 그 게이트는 통과한다 — 부채가 조용히 는다.
  //  수동 리뷰만으로는 못 막는다(100줄 넘는 JSON 의 숫자 하나가 늘어난 걸 사람이 놓친다).
  //  그래서 기준 브랜치 baseline 과 **직접 비교**한다.

  const KEY = 'src/components/M.tsx::R11'
  /** 기준 브랜치 baseline 을 임시 파일로 만든다. */
  function baseFile(obj: Record<string, number>): string {
    const dir = mkdtempSync(join(tmpdir(), 'audit-base-'))
    FIXTURES.push(dir)
    const f = join(dir, 'base.json')
    writeFileSync(f, JSON.stringify(obj, null, 2))
    return f
  }

  it('🔴 기존 키의 값이 늘면 FAIL', () => {
    const dir = makeFixture({ 'src/components/M.tsx': ONE_LINE }, { [KEY]: 2 })
    const r = runAudit([`--root=${dir}`, `--compare-baseline=${baseFile({ [KEY]: 1 })}`])
    expect(r.code).toBe(1)
    expect(r.out).toContain('1 → 2')
    expect(r.out).toContain('baseline 이 늘었다')
  })

  it('🔴 신규 키가 추가되면 FAIL', () => {
    const dir = makeFixture({ 'src/components/M.tsx': ONE_LINE }, { [KEY]: 1 })
    const r = runAudit([`--root=${dir}`, `--compare-baseline=${baseFile({})}`])
    expect(r.code).toBe(1)
    expect(r.out).toContain('신규')
  })

  it('값이 줄면 PASS — 부채를 갚는 방향', () => {
    const dir = makeFixture({ 'src/components/M.tsx': ONE_LINE }, { [KEY]: 1 })
    const r = runAudit([`--root=${dir}`, `--compare-baseline=${baseFile({ [KEY]: 5 })}`])
    expect(r.code).toBe(0)
    expect(r.out).toContain('감소')
  })

  it('키가 사라지면 PASS', () => {
    const dir = makeFixture({ 'src/components/M.tsx': ONE_LINE }, {})
    const r = runAudit([`--root=${dir}`, `--compare-baseline=${baseFile({ [KEY]: 1 })}`])
    expect(r.code).toBe(0)
    expect(r.out).toContain('제거')
  })

  // ── 🔴 기준 파일 처리는 **fail-closed** 다 ─────────────────────
  //  "못 읽었으니 그냥 넘어가자" 로 두면 CI 에서 ref 추출이 조용히 실패했을 때
  //  baseline 증가 차단이 통째로 무력화된다 — 막으려던 상황에서 정확히 실패한다.
  //  "최초 도입" 판정은 **CI 가** 한다(ref 는 정상인데 그 안에 baseline 파일이 없을 때).
  //  스크립트에 없는 경로가 넘어왔다는 건 추출이 실패했다는 뜻이므로 통과시키지 않는다.

  it('🔴 없는 파일을 넘기면 exit 1 — fail-closed', () => {
    const dir = makeFixture({ 'src/components/M.tsx': ONE_LINE }, { [KEY]: 1 })
    const r = runAudit([`--root=${dir}`, '--compare-baseline=/tmp/__no_such_baseline__.json'])
    expect(r.code, '못 읽은 기준을 통과시켰다').toBe(1)
    expect(r.out).toContain('찾을 수 없다')
  })

  it('🔴 malformed JSON 을 넘기면 exit 1', () => {
    const dir = makeFixture({ 'src/components/M.tsx': ONE_LINE }, { [KEY]: 1 })
    const bad = join(mkdtempSync(join(tmpdir(), 'audit-bad-')), 'bad.json')
    writeFileSync(bad, '{"broken": ')
    const r = runAudit([`--root=${dir}`, `--compare-baseline=${bad}`])
    expect(r.code, '깨진 기준을 통과시켰다').toBe(1)
    expect(r.out).toContain('파싱 실패')
  })

  it('🔴 최상위가 객체가 아니면 exit 1 — 배열·숫자도 막는다', () => {
    const dir = makeFixture({ 'src/components/M.tsx': ONE_LINE }, { [KEY]: 1 })
    const tmp = mkdtempSync(join(tmpdir(), 'audit-shape-'))
    for (const [name, body] of [['arr.json', '[]'], ['num.json', '3'], ['null.json', 'null']]) {
      const f = join(tmp, name)
      writeFileSync(f, body)
      const r = runAudit([`--root=${dir}`, `--compare-baseline=${f}`])
      expect(r.code, `${name} 을 통과시켰다`).toBe(1)
    }
  })

  it('🔴 **새 R11 + 갱신된 baseline 을 같은 PR 에 넣어도 실패한다**', () => {
    // 이게 이 게이트의 존재 이유다. strict 만 있으면 아래가 통과해 버린다.
    const TWO = ONE_LINE + MULTILINE // raw 컨트롤 2개
    const dir = makeFixture({ 'src/components/M.tsx': TWO }, { [KEY]: 2 }) // baseline 도 2로 올림

    // ① strict 는 통과한다 — 현재 위반이 baseline 과 같으니까
    expect(runAudit(['--strict', `--root=${dir}`]).code, 'strict 는 통과하는 게 맞다').toBe(0)

    // ② 그래서 baseline 비교가 막아야 한다
    const r = runAudit([`--root=${dir}`, `--compare-baseline=${baseFile({ [KEY]: 1 })}`])
    expect(r.code, 'baseline 을 같이 올려 부채가 통과했다').toBe(1)
    expect(r.out).toContain('1 → 2')
  })
})

describe('CI 가 baseline 증가를 차단한다', () => {
  const ci = read('.github/workflows/ci.yml')

  it('CI 가 기준 브랜치 baseline 과 비교한다', () => {
    expect(ci).toContain('--compare-baseline=')
    expect(ci).toContain('scripts/design-audit-baseline.json')
  })

  it('🔴 CI 가 4경우를 구분한다 — ref 실패 / baseline 없음 / 추출 실패 / 정상', () => {
    const step = ci.slice(ci.indexOf('baseline 증가 차단'), ci.indexOf('design audit (strict)'))
    // ① 기준 ref 자체 검증 — 없으면 FAIL
    expect(step, 'ref 존재 확인이 없다').toContain('git rev-parse --verify')
    // ② ref 안에 baseline 이 있는지 — 없을 때만 최초 도입 통과
    expect(step, 'baseline 존재 확인이 없다').toContain('git cat-file -e')
    expect(step).toContain('최초 도입')
    // ③ 있으면 추출 성공이 필수
    expect(step).toContain('git show')
    expect(step).toContain('추출에 실패')
    // ④ 실패 경로가 실제로 exit 1 이어야 한다
    expect((step.match(/exit 1/g) ?? []).length, 'FAIL 경로가 부족하다').toBeGreaterThanOrEqual(2)
    // 조용한 무시(`2>/dev/null` 로 삼키고 통과)가 없어야 한다
    expect(step).toContain('set -euo pipefail')
  })
})

describe('baseline', () => {
  it('baseline 파일이 커밋돼 있다', () => {
    expect(existsSync(resolve(ROOT, BASELINE))).toBe(true)
  })

  it('baseline 은 파일::규칙 단위다 — 줄 번호에 흔들리지 않는다', () => {
    const b = JSON.parse(read(BASELINE)) as Record<string, number>
    const keys = Object.keys(b)
    expect(keys.length).toBeGreaterThan(0)
    for (const k of keys.slice(0, 10)) expect(k).toMatch(/^src\/.+::R\d+$/)
  })

  it('🔴 baseline 에는 error 와 R11 만 담긴다', () => {
    // R11 은 severity 가 warn 이지만 **개수 증가를 막는** 게이트라 baseline 에 들어간다.
    // 리포트 전용 warn(R04~R07)은 들어가면 안 된다 — 게이트가 아닌데 baseline 을 흔든다.
    const b = JSON.parse(read(BASELINE)) as Record<string, number>
    const reportOnly = ['R04', 'R05', 'R06', 'R07']
    const bad = Object.keys(b).filter((k) => reportOnly.includes(k.split('::')[1]))
    expect(bad, `리포트 전용 warn 이 baseline 에 있다: ${bad.join(', ')}`).toEqual([])
    expect(Object.keys(b).some((k) => k.endsWith('::R11')), 'R11 이 baseline 에 없다').toBe(true)
  })
})

describe('규칙 — 계약이 실제로 검사된다', () => {
  const src = read(SCRIPT)
  it.each([
    ['R08', 'hardcoded-tokenized-color'],
    ['R09', 'hardcoded-control-size'],
    ['R10', 'hsl-token-misuse'],
  ])('%s %s 규칙이 있다', (id, name) => {
    expect(src).toContain(`id: '${id}'`)
    expect(src).toContain(name)
  })

  it('R11 은 라인 규칙이 아니라 AST 검사다', () => {
    expect(src).toContain('raw-standard-control')
    expect(src).not.toContain("id: 'R11'") // RULES 배열이 아니라 findRawControls 가 담당
  })

  it('R11 은 JSX AST 로 센다 — 줄 단위 정규식은 multiline JSX 를 놓친다', () => {
    expect(src).toContain("import ts from 'typescript'")
    expect(src).toContain('ts.ScriptKind.TSX')
    expect(src).toContain('findRawControls')
  })
})

/** 한 줄짜리 raw 컨트롤 */
const ONE_LINE = 'export const A = () => <button className="px-2">go</button>\n'
/** 🔴 여러 줄에 걸친 JSX — 줄 단위 정규식이 놓치던 형태 */
const MULTILINE = [
  'export const B = () => (',
  '  <input',
  '    type="text"',
  '    className="px-2"',
  '  />',
  ')',
  '',
].join('\n')

describe('🔴 R11 raw 표준 컨트롤 — 신규 부채 게이트', () => {

  it('multiline JSX 도 잡는다', () => {
    const dir = makeFixture({ 'src/components/M.tsx': MULTILINE })
    const r = runAudit(['--strict', `--root=${dir}`])
    expect(r.code, 'multiline input 을 놓쳤다').toBe(1)
    expect(r.out).toContain('R11')
  })

  it('기존 baseline 개수는 그대로 통과한다', () => {
    const dir = makeFixture(
      { 'src/components/M.tsx': ONE_LINE },
      { 'src/components/M.tsx::R11': 1 },
    )
    expect(runAudit(['--strict', `--root=${dir}`]).code).toBe(0)
  })

  it('🔴 1건 늘면 exit 1 이다', () => {
    const dir = makeFixture(
      { 'src/components/M.tsx': ONE_LINE + MULTILINE },
      { 'src/components/M.tsx::R11': 1 },
    )
    const r = runAudit(['--strict', `--root=${dir}`])
    expect(r.code).toBe(1)
    expect(r.out).toContain('1 → 2')
  })

  it('1건 줄면 통과한다 — 부채를 갚는 방향은 막지 않는다', () => {
    const dir = makeFixture(
      { 'src/components/M.tsx': ONE_LINE },
      { 'src/components/M.tsx::R11': 2 },
    )
    expect(runAudit(['--strict', `--root=${dir}`]).code).toBe(0)
  })

  it('허용된 primitive × 허용된 태그는 통과한다', () => {
    const dir = makeFixture({
      'src/components/ui/Input.tsx': MULTILINE, // input — 허용
      'src/components/ui/Chip.tsx': ONE_LINE,   // button — 허용
    })
    const r = runAudit(['--strict', `--root=${dir}`])
    expect(r.code, '허용된 primitive 가 자기 규칙에 걸렸다').toBe(0)
  })

  it('🔴 `ui/` 아래 **새 파일**의 raw button 은 검출된다 — 디렉터리 통째 면제 금지', () => {
    // 디렉터리 prefix 로 면제하면 여기 생기는 아무 파일이나 raw 컨트롤을 자유롭게 만든다.
    const dir = makeFixture({ 'src/components/ui/AccidentalFeature.tsx': ONE_LINE })
    const r = runAudit(['--output=json', `--root=${dir}`])
    const j = JSON.parse(r.out) as { violations: Array<{ ruleId: string; file: string }> }
    const hit = j.violations.filter((v) => v.ruleId === 'R11')
    expect(hit.length, 'ui/ 새 파일이 통째로 면제됐다').toBe(1)
    expect(hit[0].file).toBe('src/components/ui/AccidentalFeature.tsx')
    expect(runAudit(['--strict', `--root=${dir}`]).code).toBe(1)
  })

  it('🔴 허용 파일이라도 **허용하지 않은 태그**는 검출된다', () => {
    // `Chip.tsx` 는 button 만 허용된다 — input 을 만들면 잡혀야 한다.
    const dir = makeFixture({
      'src/components/ui/Chip.tsx': ONE_LINE + MULTILINE, // button(허용) + input(불허)
    })
    const r = runAudit(['--output=json', `--root=${dir}`])
    const j = JSON.parse(r.out) as { violations: Array<{ ruleId: string; code: string }> }
    const hit = j.violations.filter((v) => v.ruleId === 'R11')
    expect(hit.length, 'Chip.tsx 의 input 이 면제됐다').toBe(1)
    expect(hit[0].code).toContain('<input')
  })

  it('🔴 `Button.tsx` 는 allowlist 에 없다 — button 은 Chip 만 직접 만든다', () => {
    // Button 컴포넌트는 `Slot`/`Comp` 로 렌더하므로 raw `<button>` 리터럴이 없다.
    // allowlist 에 넣어두면 나중에 raw 를 넣어도 안 잡힌다.
    const dir = makeFixture({ 'src/components/ui/Button.tsx': ONE_LINE })
    expect(runAudit(['--strict', `--root=${dir}`]).code, 'Button.tsx 가 면제됐다').toBe(1)
  })

  it('button·input·select·textarea 를 모두 센다', () => {
    const dir = makeFixture({
      'src/components/All.tsx':
        'export const C = () => (<div>' +
        '<button/><input/><select/><textarea/>' +
        '</div>)\n',
    })
    const r = runAudit(['--output=json', `--root=${dir}`])
    const j = JSON.parse(r.out) as { violations: Array<{ ruleId: string }> }
    expect(j.violations.filter((v) => v.ruleId === 'R11').length).toBe(4)
  })
})

describe('CI 연결 — 자동 실행 0회를 끝낸다', () => {
  const ci = read('.github/workflows/ci.yml')

  it('🔴 CI 가 design audit 을 strict 로 부른다', () => {
    expect(ci).toContain('design-token-audit.ts')
    expect(ci).toContain('--strict')
  })

  it('변경 파일을 넘긴다 — 이번 PR 이 건드린 곳은 예외 없이 막는다', () => {
    expect(ci).toContain('--changed=')
  })
})
