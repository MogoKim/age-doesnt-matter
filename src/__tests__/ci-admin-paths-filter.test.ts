/**
 * CI `admin` paths-filter **행동 계약**.
 *
 * ── 왜 필요한가 ──────────────────────────────────────────────
 *  `admin` 필터는 오래 `src/app/(admin)/**` 한 줄이었다. 두 가지 문제가 있었다.
 *
 *   ① **그 경로는 존재하지 않는다.** 실제 관리자 route 는 `src/app/admin/**` 이다.
 *      그런데도 매칭은 됐다 — picomatch 가 앞에 `?`·`!`·`+`·`*`·`@` 가 없는 맨 `(admin)` 을
 *      **캡처 그룹**으로 컴파일해 리터럴 `admin` 세그먼트에 걸렸기 때문이다.
 *      즉 **문법 부작용으로만 살아 있었다.** 누가 "route group 이 없네" 하고 괄호를
 *      실경로로 '고치면' 소리 없이 죽는다.
 *   ② **page 층 말고는 전부 놓쳤다.** 어드민 화면의 본체(컴포넌트·쿼리·server action·
 *      API·인증·미들웨어)와 E2E 하네스 자신이 필터 밖이었다.
 *      PR #486 이 그 예다 — 어드민 4개 화면을 전환했는데 `admin=false` 였다.
 *
 * ── 왜 실제 matcher 를 쓰나 ──────────────────────────────────
 *  `ci-paths-filter.test.ts` 가 쓰던 손으로 만든 matcher 는 `dir/**` 와 단일 파일만
 *  처리했다. 새 필터는 `admin*.ts`·`0[6-9]-*.spec.ts` 같은 패턴을 쓴다 —
 *  흉내 낸 matcher 로는 **전부 false 가 나와 false-green** 이 된다.
 *  그래서 `dorny/paths-filter@v3` 와 **같은 라이브러리·같은 옵션**을 쓴다:
 *  `picomatch(pattern, { dot: true })` (dorny v3 `src/filter.ts` 의 `MatchOptions`).
 *
 * ── 🔴 E2E_ADMIN_ENABLED 와 혼동하지 말 것 ────────────────────
 *  이 필터를 넓혀도 `vars.E2E_ADMIN_ENABLED` 가 꺼져 있으면 E2E Admin 은 **계속 skip** 이다.
 *  그 게이트는 결함이 아니라 안전 계약이다 — 어드민 E2E 는 저장·삭제·회원 제재를 실제로
 *  실행하므로 격리 staging + 전용 계정에서만 켠다(`e2e-admin-guard.test.ts`).
 *  필터 확대는 **그 게이트가 켜지는 날을 위한 선행 조건**이지 게이트 해제가 아니다.
 */
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parse } from 'yaml'
import picomatch from 'picomatch'

const ROOT = resolve(process.cwd())
const CI_PATH = resolve(ROOT, '.github/workflows/ci.yml')

interface Step { id?: string; with?: { filters?: string } }
interface Job { if?: string; steps?: Step[]; outputs?: Record<string, string> }
interface Workflow { jobs: Record<string, Job> }

const workflow = parse(readFileSync(CI_PATH, 'utf8')) as Workflow

function filters(): Record<string, string[]> {
  const step = workflow.jobs['detect-changes'].steps?.find((s) => s.id === 'filter')
  expect(step?.with?.filters, 'detect-changes 에 filter 스텝이 있어야 한다').toBeTruthy()
  return parse(step!.with!.filters!) as Record<string, string[]>
}

const ADMIN_PATTERNS = filters().admin

/** dorny/paths-filter@v3 와 동일한 판정: picomatch + `{ dot: true }`. */
const DORNY_OPTIONS = { dot: true } as const
function isAdmin(path: string): boolean {
  return ADMIN_PATTERNS.some((p) => picomatch(p, DORNY_OPTIONS)(path))
}
function matchedBy(pattern: string, paths: string[]): string[] {
  const m = picomatch(pattern, DORNY_OPTIONS)
  return paths.filter((f) => m(f))
}

/** 저장소가 실제로 추적 중인 파일 전부 — 가정 대신 실측으로 판정한다. */
const TRACKED = execFileSync('git', ['ls-files'], { cwd: ROOT, encoding: 'utf8' })
  .trim()
  .split('\n')

describe('🔴 기존 관리자 page 48개를 하나도 잃지 않는다', () => {
  const pages = TRACKED.filter((f) => f.startsWith('src/app/admin/'))

  it('src/app/admin/** 이 실제로 존재한다 (구 표기 src/app/(admin)/** 는 없다)', () => {
    expect(pages.length, 'src/app/admin 하위 파일이 0이면 경로 가정이 틀린 것이다').toBeGreaterThan(0)
    expect(TRACKED.some((f) => f.startsWith('src/app/(admin)/'))).toBe(false)
  })

  it('48개 전부 admin 으로 잡힌다 — 누락 0', () => {
    const missed = pages.filter((f) => !isAdmin(f))
    expect(missed, `누락: ${missed.join(', ')}`).toEqual([])
  })

  it('구 패턴 src/app/(admin)/** 는 목록에서 사라졌다', () => {
    expect(ADMIN_PATTERNS, '존재하지 않는 경로 표기가 남아 있다').not.toContain('src/app/(admin)/**')
  })
})

describe('어드민 표면 변경이 전부 감지된다', () => {
  it.each([
    ['src/app/admin/content/page.tsx', '관리자 page'],
    ['src/app/api/admin/check-post/route.ts', '관리자 API route'],
    ['src/components/admin/ContentTable.tsx', '화면 본체 컴포넌트'],
    ['src/components/admin/ui/AdminControls.tsx', '어드민 공용 컨트롤'],
    ['src/lib/actions/admin.ts', 'server action (단일 파일)'],
    ['src/lib/actions/admin-auth.ts', 'server action (admin*.ts)'],
    ['src/lib/actions/admin/posts.ts', 'server action (디렉터리)'],
    ['src/lib/queries/admin.ts', 'query (단일 파일)'],
    ['src/lib/queries/admin/retention.ts', 'query (디렉터리)'],
    ['src/lib/admin-auth.ts', '어드민 토큰 검증'],
    ['src/middleware.ts', '/admin 진입 차단 미들웨어'],
    ['e2e/qa/07-admin-members.spec.ts', 'qa-admin spec (06~09)'],
    ['e2e/qa/13-admin-auditlog.spec.ts', 'qa-admin spec (10~14)'],
    ['e2e/fixtures/auth.setup.ts', 'setup-admin 의존'],
    ['playwright.config.ts', 'qa-admin project 정의'],
  ])('%s → admin=true (%s)', (path) => {
    expect(isAdmin(path)).toBe(true)
  })
})

describe('🔴 검사 도구 자신이 바뀌어도 검증이 돈다', () => {
  // design 필터가 같은 이유로 자기 도구를 담는다 —
  // 없으면 "필터·계약만 고친 PR" 이 검증 없이 통과한다.
  it.each([
    '.github/workflows/ci.yml',
    'src/__tests__/ci-admin-paths-filter.test.ts',
  ])('%s 단독 변경 → admin=true', (path) => {
    expect(isAdmin(path)).toBe(true)
  })

  it('ci.yml 단독 변경이면 quality job 이 돌아 이 테스트가 실제로 실행된다', () => {
    // quality 가 vitest 를 돌린다. admin 조건이 없으면 ci.yml 만 고친 PR 에서
    // 이 계약 테스트가 한 번도 실행되지 않는다.
    expect(workflow.jobs.quality?.if).toContain("outputs.admin == 'true'")
    expect(isAdmin('.github/workflows/ci.yml')).toBe(true)
  })
})

describe('오탐 — 무관한 변경은 admin 으로 잡지 않는다', () => {
  it.each([
    ['docs/ops/followup-e2e-admin-paths-filter.md', '문서(이름에 admin 이 들어가도)'],
    ['docs/operations/2026-09-16-handoff.md', '일반 운영 문서'],
    ['README.md', '루트 문서'],
    ['src/components/features/community/CommentSection.tsx', '공개면 컴포넌트'],
    ['src/app/community/page.tsx', '공개면 page'],
    ['src/lib/post-url.ts', '공개 URL 규칙'],
    ['src/lib/queries/posts.ts', '공개 query'],
    ['src/lib/actions/drafts.ts', '공개 server action'],
    ['agents/coo/moderator.ts', '에이전트'],
    ['scripts/ops-doctor.ts', '운영 스크립트'],
    ['prisma/schema.prisma', 'DB 스키마'],
    ['e2e/qa/01-public-pages.spec.ts', 'qa-admin 범위 밖 spec'],
    ['e2e/qa/15-deep-qa.spec.ts', 'qa-admin 범위 밖 spec(15~)'],
    ['e2e/00-smoke.spec.ts', 'qa 폴더 밖 spec'],
  ])('%s → admin=false (%s)', (path) => {
    expect(isAdmin(path)).toBe(false)
  })

  it('admin 이 잡는 파일은 전부 의도한 접두사 안에 있다', () => {
    const ALLOWED_PREFIXES = [
      'src/app/admin/',
      'src/app/api/admin/',
      'src/components/admin/',
      'src/lib/queries/admin',
      'src/lib/actions/admin',
      'src/lib/admin-auth.ts',
      'src/middleware.ts',
      'e2e/qa/',
      'e2e/fixtures/auth.setup.ts',
      'playwright.config.ts',
      '.github/workflows/ci.yml',
      'src/__tests__/ci-admin-paths-filter.test.ts',
    ]
    const stray = TRACKED.filter(isAdmin).filter((f) => !ALLOWED_PREFIXES.some((p) => f.startsWith(p)))
    expect(stray, `의도 밖 파일이 admin 으로 잡힌다: ${stray.join(', ')}`).toEqual([])
  })

  it('e2e/qa 에서 잡히는 것은 qa-admin testMatch 범위(06~14)뿐이다', () => {
    const caught = TRACKED.filter((f) => f.startsWith('e2e/qa/')).filter(isAdmin)
    for (const f of caught) {
      expect(f, `${f} 가 qa-admin 범위 밖인데 잡힌다`).toMatch(/^e2e\/(qa\/(0[6-9]|1[0-4])-.*\.spec\.ts|fixtures\/auth\.setup\.ts)$/)
    }
    expect(caught.length, 'qa-admin spec 이 하나도 안 잡힌다').toBeGreaterThan(0)
  })
})

describe('죽은 패턴이 없다', () => {
  it.each(ADMIN_PATTERNS)('%s 는 최소 1개 파일을 잡는다', (pattern) => {
    expect(matchedBy(pattern, TRACKED).length, `${pattern} 이 아무것도 안 잡는다 — 오타이거나, 경로가 사라졌거나, 새 파일이 아직 git add 되지 않았다`)
      .toBeGreaterThan(0)
  })

  it('필터 확대가 실제로 커버리지를 늘렸다', () => {
    const covered = TRACKED.filter(isAdmin)
    const pagesOnly = TRACKED.filter((f) => f.startsWith('src/app/admin/'))
    expect(covered.length).toBeGreaterThan(pagesOnly.length)
  })
})

describe('🔴 필터를 넓혀도 안전 게이트는 그대로다', () => {
  const e2eAdmin = workflow.jobs['e2e-admin']

  it('e2e-admin job 이 여전히 vars.E2E_ADMIN_ENABLED 로 게이트된다', () => {
    expect(e2eAdmin, 'e2e-admin job 이 없다').toBeDefined()
    expect(e2eAdmin.if, 'E2E_ADMIN_ENABLED 게이트가 사라졌다').toContain("vars.E2E_ADMIN_ENABLED == 'true'")
  })

  it('게이트가 꺼져 있으면 admin=true 여도 skip 이다 — 두 조건은 AND 다', () => {
    expect(e2eAdmin.if).toContain("needs.detect-changes.outputs.admin == 'true'")
    expect(e2eAdmin.if, 'AND 가 아니면 필터만으로 어드민 E2E 가 돈다').toContain('&&')
    expect(e2eAdmin.if, 'OR 이면 안전 계약이 깨진다').not.toContain('||')
  })

  it('detect-changes 가 admin 을 output 으로 내보낸다', () => {
    expect(workflow.jobs['detect-changes'].outputs?.admin, 'outputs.admin 이 없으면 조건이 항상 빈 값이다')
      .toBeTruthy()
  })

  it('admin 출력을 쓰는 job 은 quality 와 e2e-admin 둘뿐이다 — 영향 범위를 고정한다', () => {
    const consumers = Object.entries(workflow.jobs)
      .filter(([, j]) => typeof j.if === 'string' && j.if.includes('outputs.admin'))
      .map(([name]) => name)
      .sort()
    expect(consumers).toEqual(['e2e-admin', 'quality'])
  })
})
