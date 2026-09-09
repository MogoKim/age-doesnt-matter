import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

/**
 * `.vercelignore` 와 타입 검사 범위의 불일치를 막는다 — 2026-09-09.
 *
 * 사고: Next 16 전환 PR 의 Vercel Preview 가 계속 실패했다. `Compiled successfully` 다음
 * `Running TypeScript ...` 에서 죽었고 errorCode 는 `module_not_found` 였다.
 *
 * 원인은 **빌드 입력과 타입 검사 범위가 어긋난 것**이다.
 *   · `.vercelignore` 가 `/agents/` · `/scripts/` 를 Vercel 빌드 입력에서 뺀다
 *   · 그런데 `/src/__tests__/` 는 빼지 않았다
 *   · `tsconfig.json` 의 전역 include 패턴(`**` + `/` + `*.ts`)이 그 테스트들을 타입 검사에 포함한다
 *   · 테스트가 사라진 agents/scripts 를 import → **TS2307 15건**으로 빌드 실패
 *
 * 로컬 재현: agents/scripts 만 제외 → TS2307 15건. src/__tests__ 까지 제외 → 0건.
 *
 * 이 테스트는 그 조합이 다시 생기는 것을 막는다. 고치는 방향은 **빌드 입력 정렬**이지
 * `typescript.ignoreBuildErrors` 나 tsconfig exclude 가 아니다 — 그건 검사를 끄는 것이다.
 */

const ROOT = join(__dirname, '../..')

/** 주석·빈 줄을 걷어낸 실제 무시 규칙. */
const ignoreRules = readFileSync(join(ROOT, '.vercelignore'), 'utf-8')
  .split('\n')
  .map((l) => l.trim())
  .filter((l) => l.length > 0 && !l.startsWith('#'))

/** `/agents/` 든 `agents/` 든 같은 뜻으로 본다. */
const ignores = (dir: string) => ignoreRules.some((r) => r.replace(/^\//, '').replace(/\/$/, '') === dir)

describe('.vercelignore — 빌드 입력과 타입 검사 범위가 어긋나지 않는다', () => {
  it('agents 와 scripts 를 빌드 입력에서 뺀다 (Vercel 런타임에 필요 없다)', () => {
    expect(ignores('agents'), 'agents 를 다시 포함하지 마라 — 번들만 커진다').toBe(true)
    expect(ignores('scripts'), 'scripts 를 다시 포함하지 마라').toBe(true)
  })

  it('★ agents/scripts 를 뺐으면 src/__tests__ 도 빼야 한다', () => {
    // 이 조합이 어긋나면 Vercel 이 "Running TypeScript" 에서 module_not_found 로 죽는다.
    const excludedSources = ignores('agents') || ignores('scripts')
    expect(
      excludedSources && ignores('src/__tests__'),
      'agents/scripts 를 뺀 채 src/__tests__ 를 남기면 테스트가 없는 모듈을 import 한 채 타입 검사된다',
    ).toBe(true)
  })

  it('검사를 끄는 방식으로 우회하지 않는다', () => {
    const nextConfig = readFileSync(join(ROOT, 'next.config.js'), 'utf-8')
    expect(nextConfig, 'ignoreBuildErrors 는 타입 검사를 통째로 끈다 — 해결이 아니다')
      .not.toMatch(/ignoreBuildErrors\s*:\s*true/)

    const tsconfig = JSON.parse(readFileSync(join(ROOT, 'tsconfig.json'), 'utf-8')) as { exclude: string[] }
    expect(tsconfig.exclude, 'tsconfig 에서 테스트를 빼면 GitHub CI 의 검사 범위까지 줄어든다')
      .not.toContain('src/__tests__')
  })
})

describe('GitHub CI 의 검사 범위는 줄지 않았다', () => {
  const tsconfig = JSON.parse(readFileSync(join(ROOT, 'tsconfig.json'), 'utf-8')) as {
    include: string[]
    exclude: string[]
  }

  it('tsconfig 가 여전히 테스트를 타입 검사한다', () => {
    expect(tsconfig.include).toContain('**/*.ts')
    expect(tsconfig.exclude.some((e) => e.includes('__tests__'))).toBe(false)
  })

  it('테스트 파일이 실제로 존재하고 agents/scripts 를 검사한다', () => {
    // .vercelignore 는 Vercel 입력만 줄인다. 저장소와 CI 에는 그대로 있어야 한다.
    const files = readdirSync(join(ROOT, 'src/__tests__')).filter((f) => f.endsWith('.test.ts'))
    expect(files.length, 'src/__tests__ 가 저장소에서 사라졌다').toBeGreaterThan(50)

    const crossImports = files.filter((f) =>
      /\.\.\/\.\.\/(agents|scripts)\//.test(readFileSync(join(ROOT, 'src/__tests__', f), 'utf-8')),
    )
    expect(crossImports.length, 'agents/scripts 를 검사하는 테스트가 있어야 한다').toBeGreaterThan(0)
  })

  it('vitest 가 src/__tests__ 를 제외하지 않는다', () => {
    const cfg = readFileSync(join(ROOT, 'vitest.config.ts'), 'utf-8')
    expect(cfg).not.toMatch(/exclude[\s\S]{0,120}__tests__/)
  })
})
