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
import { existsSync, readFileSync, writeFileSync, appendFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

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
    const victim = 'src/lib/board-registry.ts'
    const before = read(victim)
    try {
      appendFileSync(resolve(ROOT, victim), '\nexport const __AUDIT_PROBE = "bg-[#FF6F61] min-h-[52px]"\n')
      const r = runAudit(['--strict'])
      expect(r.code, 'strict 가 새 위반을 놓쳤다').toBe(1)
      expect(r.out).toContain('baseline 보다 늘어난 위반')
    } finally {
      writeFileSync(resolve(ROOT, victim), before)
    }
  })

  it('🔴 변경 파일에 위반이 있으면 baseline 안이라도 exit 1 이다', () => {
    // baseline 에 이미 있는 부채 파일을 "이번에 고친 파일" 로 넘기면 막아야 한다.
    const baseline = JSON.parse(read(BASELINE)) as Record<string, number>
    const debtFile = Object.keys(baseline)[0]?.split('::')[0]
    expect(debtFile, 'baseline 이 비어 있다').toBeTruthy()
    const r = runAudit(['--strict', `--changed=${debtFile}`])
    expect(r.code).toBe(1)
    expect(r.out).toContain('변경한 파일에 위반')
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
})

describe('규칙 — 계약이 실제로 검사된다', () => {
  const src = read(SCRIPT)
  it.each([
    ['R08', 'hardcoded-tokenized-color'],
    ['R09', 'hardcoded-control-size'],
    ['R10', 'hsl-token-misuse'],
    ['R11', 'raw-standard-control'],
  ])('%s %s 규칙이 있다', (id, name) => {
    expect(src).toContain(`id: '${id}'`)
    expect(src).toContain(name)
  })

  it('raw 표준 컨트롤은 warn 이다 — 기존 화면을 한 번에 red 로 만들지 않는다', () => {
    const r11 = src.slice(src.indexOf("id: 'R11'"), src.indexOf("id: 'R11'") + 400)
    expect(r11).toContain("severity: 'warn'")
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
