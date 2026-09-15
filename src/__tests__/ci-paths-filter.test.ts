/**
 * CI `detect-changes` paths-filter 계약.
 *
 * ── 왜 필요한가 ──────────────────────────────────────────────
 *  `frontend` 필터에 `e2e/**` 가 빠져 있었다. 그래서 **E2E spec 만 고친 PR 은
 *  E2E 가 `skipping`** 돼서, 그 수정이 맞는지 확인할 길이 없었다.
 *  2026-09-14 PR #476 에서 실제로 그랬다 — 매거진 댓글 셀렉터를 고쳤는데
 *  E2E 가 안 돌아, production 을 직접 겨냥해 spec 을 돌려서야 확인할 수 있었다.
 *
 *  이 테스트는 그 구멍이 다시 생기는 것을 막는다.
 *
 * ── 무엇을 검사하나 ──────────────────────────────────────────
 *  `ci.yml` 을 **실제로 파싱해서** 필터 목록과 job 조건을 읽는다.
 *  주석이 아니라 workflow 가 실제로 쓰는 값을 본다.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parse } from 'yaml'

const ROOT = resolve(process.cwd())
const CI_PATH = resolve(ROOT, '.github/workflows/ci.yml')

interface Step { id?: string; with?: { filters?: string } }
interface Job { if?: string; steps?: Step[]; needs?: unknown }
interface Workflow { jobs: Record<string, Job> }

const workflow = parse(readFileSync(CI_PATH, 'utf8')) as Workflow

function filters(): Record<string, string[]> {
  const step = workflow.jobs['detect-changes'].steps?.find((s) => s.id === 'filter')
  expect(step?.with?.filters, 'detect-changes 에 filter 스텝이 있어야 한다').toBeTruthy()
  return parse(step!.with!.filters!) as Record<string, string[]>
}

/**
 * `dorny/paths-filter` 의 glob 판정을 필요한 만큼만 흉내 낸다.
 * 여기서 쓰는 패턴은 전부 `<디렉토리>/**` 또는 단일 파일이다.
 */
function matches(pattern: string, path: string): boolean {
  if (pattern.endsWith('/**')) return path.startsWith(pattern.slice(0, -2))
  return pattern === path
}

function matchedFilters(path: string): string[] {
  const f = filters()
  return Object.entries(f)
    .filter(([, patterns]) => patterns.some((p) => matches(p, path)))
    .map(([name]) => name)
}

describe('🔴 e2e/** 만 바꿔도 frontend=true 여야 한다', () => {
  it('frontend 필터에 e2e/** 가 있다', () => {
    expect(filters().frontend).toContain('e2e/**')
  })

  it('E2E spec 단독 변경이 frontend 로 잡힌다', () => {
    expect(matchedFilters('e2e/03-job-detail.spec.ts')).toContain('frontend')
  })

  it('e2e 하위 어떤 파일이든 잡힌다', () => {
    for (const p of ['e2e/helpers/auth.ts', 'e2e/fixtures/x.json', 'e2e/00-smoke.spec.ts']) {
      expect(matchedFilters(p), p).toContain('frontend')
    }
  })

  it('E2E Smoke job 이 frontend 조건으로 돈다', () => {
    const job = Object.entries(workflow.jobs).find(([, j]) =>
      typeof j.if === 'string' && j.if.includes("outputs.frontend == 'true'") && !j.if.includes('prisma'))
    expect(job, 'frontend 단독 조건 job(E2E Smoke)이 있어야 한다').toBeDefined()
  })

  it('quality job 도 frontend 를 포함한 조건이다', () => {
    const quality = workflow.jobs.quality
    expect(quality?.if).toContain("outputs.frontend == 'true'")
  })
})

describe('기존 필터 계약은 그대로다', () => {
  it('frontend 는 src·public·e2e 세 개다', () => {
    expect(filters().frontend).toEqual(['src/**', 'public/**', 'e2e/**'])
  })

  it('다른 필터 키가 사라지지 않았다', () => {
    const keys = Object.keys(filters())
    for (const k of ['ads', 'agents', 'admin', 'prisma', 'scripts', 'seo', 'docs-only']) {
      expect(keys, `${k} 필터가 사라졌다`).toContain(k)
    }
  })

  it('agents 변경은 frontend 로 잡히지 않는다 — 별도 게이트가 본다', () => {
    expect(matchedFilters('agents/coo/moderator.ts')).not.toContain('frontend')
    expect(matchedFilters('agents/coo/moderator.ts')).toContain('agents')
  })

  it('docs 변경은 frontend 로 잡히지 않는다', () => {
    expect(matchedFilters('docs/operations/x.md')).not.toContain('frontend')
  })

  it('scripts 는 여전히 ops-typecheck 쪽으로만 간다', () => {
    const m = matchedFilters('scripts/ops-doctor.ts')
    expect(m).toContain('scripts')
    expect(m).not.toContain('frontend')
  })
})

describe('🔴 디자인 감사 전용 filter — 감사 도구가 자기 변경을 검사한다', () => {
  // ── 왜 필요한가 ──────────────────────────────────────────────
  //  `design-audit` job 이 `frontend` 필터로 돌면 **감사 도구 자신의 변경을 놓친다.**
  //  `frontend` 는 `src/**`·`public/**`·`e2e/**` 뿐이라
  //  audit 스크립트·baseline·tailwind 설정은 거기 안 걸린다 —
  //  **baseline 만 몰래 올리는 PR 이 검사 없이 통과**한다.

  const REQUIRED = [
    'src/**',
    'scripts/design-token-audit.ts',
    'scripts/design-audit-baseline.json',
    'tailwind.config.ts',
    '.github/workflows/ci.yml',
  ]

  it('design 필터가 존재하고 필수 경로를 전부 담는다', () => {
    const design = filters().design
    expect(design, 'design 필터가 없다').toBeDefined()
    for (const p of REQUIRED) expect(design, `${p} 누락`).toContain(p)
  })

  it('detect-changes 가 design 을 output 으로 내보낸다', () => {
    const outputs = (workflow.jobs['detect-changes'] as unknown as { outputs?: Record<string, string> }).outputs
    expect(outputs?.design, 'outputs.design 이 없으면 job 조건이 항상 빈 값이다').toBeTruthy()
  })

  it('🔴 design-audit job 이 frontend 가 아니라 design 조건으로 돈다', () => {
    const job = workflow.jobs['design-audit']
    expect(job, 'design-audit job 이 없다').toBeDefined()
    expect(job.if).toContain("outputs.design == 'true'")
    expect(job.if, 'frontend 조건이 남아 있다').not.toContain("outputs.frontend == 'true'")
  })

  it.each([
    ['scripts/design-token-audit.ts', 'audit 스크립트만 변경'],
    ['scripts/design-audit-baseline.json', 'baseline 만 변경'],
    ['tailwind.config.ts', 'tailwind 설정만 변경'],
    ['.github/workflows/ci.yml', 'CI 자신만 변경'],
    ['src/components/ui/Button.tsx', '화면 코드 변경'],
  ])('%s 단독 변경 → design-audit 실행 (%s)', (path) => {
    expect(matchedFilters(path), `${path} 가 design 에 안 걸린다`).toContain('design')
  })

  it.each([
    'docs/operations/2026-09-15-system-foundation-2.md',
    'docs/features/R02-coupang-cps.md',
    'README.md',
  ])('%s 같은 일반 문서만 변경 → design-audit 실행 안 함', (path) => {
    expect(matchedFilters(path), `${path} 가 design 에 잘못 걸린다`).not.toContain('design')
  })

  it('🔴 frontend 필터로는 audit 도구 변경을 못 잡는다 — 전용 filter 가 필요한 이유', () => {
    // 이 단언이 깨지면(= frontend 가 scripts 를 담게 되면) 전용 filter 의 근거를 다시 본다.
    for (const p of ['scripts/design-token-audit.ts', 'scripts/design-audit-baseline.json', 'tailwind.config.ts']) {
      expect(matchedFilters(p), `${p}`).not.toContain('frontend')
    }
  })
})

