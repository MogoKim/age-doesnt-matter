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

  it('CSS 변수를 못 쓰는 문맥만 색 규칙에서 빠진다', () => {
    expect(src).toContain('opengraph-image')
    expect(src).toContain('src/components/icons/')
  })
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

describe('🔴 R11 raw 표준 컨트롤 — 신규 부채 게이트', () => {
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

  it('🔴 공용 Button/Input 자신은 예외다 — 표준 컨트롤의 유일한 출처다', () => {
    const dir = makeFixture({
      'src/components/ui/Button.tsx': ONE_LINE,
      'src/components/ui/Input.tsx': MULTILINE,
    })
    const r = runAudit(['--strict', `--root=${dir}`])
    expect(r.code, '공용 컴포넌트가 자기 규칙에 걸렸다').toBe(0)
    expect(r.out).not.toContain('R11')
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
