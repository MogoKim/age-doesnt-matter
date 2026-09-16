/**
 * `SearchField` 정본 계약 — Foundation 3.0 (A1).
 *
 * ── 왜 필요한가 ──────────────────────────────────────────────
 *  파서가 **7곳에 복사**돼 있었다(API 3 · 목록 클라이언트 3 · 검색바 1).
 *  하나를 고치면 나머지 여섯을 빠뜨린다.
 *
 *  더 중요한 건 타입이 있던 자리다. `SearchField` 는
 *  `queries/posts/posts.base.ts` 에 있었는데 그 모듈은 `prisma` 와 `next/cache` 를
 *  import 한다. **클라이언트 컴포넌트가 거기서 값을 하나라도 가져오면
 *  브라우저 번들에 Prisma 와 서버 캐시가 딸려온다.**
 *  지금까지는 `import type` 이라 지워졌지만, 한 번만 실수하면 새는 구조였다.
 *
 *  그래서 정본을 **의존성이 하나도 없는** `@/lib/list-query` 로 옮겼다.
 *  이 테스트는 ① 동작이 7개 복사본과 같고 ② 그 무의존성이 유지되며
 *  ③ 기존 import 경로가 깨지지 않음을 고정한다.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { parseSearchField, type SearchField } from '@/lib/list-query'

// `posts.base` 는 import 만으로 Prisma 클라이언트를 만든다 — 이 테스트가 지적하는 성질 그 자체다.
// 재수출 호환을 확인하려면 서버 의존을 끊어야 한다.
vi.mock('@/lib/prisma', () => ({ prisma: {} }))

const ROOT = resolve(process.cwd())
const SRC = join(ROOT, 'src')

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) return name === '__tests__' ? [] : walk(full)
    return /\.tsx?$/.test(name) ? [full] : []
  })
}
const FILES = walk(SRC)
const rel = (f: string) => f.slice(ROOT.length + 1)

describe('동작 — 7개 복사본과 같은 결과', () => {
  it.each([
    ['title', 'title'],
    ['content', 'content'],
    ['both', 'both'],
    [null, 'both'],
    [undefined, 'both'],
    ['', 'both'],
    ['TITLE', 'both'],   // 대소문자 구분 — 기존 동작 그대로
    ['제목', 'both'],
    ['both,title', 'both'],
  ] as Array<[string | null | undefined, SearchField]>)('parseSearchField(%p) → %p', (input, expected) => {
    expect(parseSearchField(input)).toBe(expected)
  })

  it('반환값은 항상 세 값 중 하나다', () => {
    for (const raw of ['title', 'content', 'both', null, undefined, '', 'x', '0', 'null']) {
      expect(['both', 'title', 'content']).toContain(parseSearchField(raw as string | null))
    }
  })
})

describe('🔴 정본 모듈은 브라우저에 서버 코드를 끌고 오지 않는다', () => {
  const src = readFileSync(join(SRC, 'lib/list-query.ts'), 'utf-8')

  it('list-query.ts 는 import 가 하나도 없다', () => {
    const imports = src.match(/^\s*import\s/gm) ?? []
    expect(imports, `import 가 생겼다: ${imports.join(', ')}`).toEqual([])
  })

  // 주석은 서버 모듈 이름을 설명으로 언급한다 — 판정은 **import 문**만 본다.
  const specifiers = [...src.matchAll(/^\s*import[^'"]*['"]([^'"]+)['"]/gm)].map((m) => m[1])

  it('list-query.ts 는 어떤 모듈도 import 하지 않는다', () => {
    expect(specifiers, `import 가 생겼다: ${specifiers.join(', ')}`).toEqual([])
  })

  it.each(['@/lib/prisma', 'next/cache', '@/generated/prisma', 'server-only'])(
    'list-query.ts 는 %s 를 import 하지 않는다',
    (mod) => {
      expect(specifiers.some((sp) => sp.includes(mod))).toBe(false)
    },
  )

  it("'use client' 컴포넌트가 posts.base 에서 값을 가져오지 않는다", () => {
    const offenders: string[] = []
    for (const f of FILES) {
      const t = readFileSync(f, 'utf-8')
      if (!/^['"]use client['"]/m.test(t.slice(0, 200))) continue
      // `import type {...} from '...posts.base'` 는 지워지므로 허용, 값 import 는 금지
      for (const m of t.matchAll(/^import\s+(type\s+)?\{[^}]*\}\s+from\s+'([^']*posts\.base)'/gm)) {
        if (!m[1]) offenders.push(`${rel(f)} → ${m[2]}`)
      }
    }
    expect(offenders, `클라이언트가 prisma 모듈에서 값을 가져온다: ${offenders.join(', ')}`).toEqual([])
  })
})

describe('중복이 돌아오지 않는다', () => {
  it('parseSearchField 정의는 list-query.ts 한 곳뿐이다', () => {
    const defs = FILES.filter((f) => /function parseSearchField\s*\(/.test(readFileSync(f, 'utf-8')))
    expect(defs.map(rel)).toEqual(['src/lib/list-query.ts'])
  })

  it('SearchField 타입 선언은 list-query.ts 한 곳뿐이다 (재수출은 선언이 아니다)', () => {
    const decls = FILES.filter((f) =>
      /^\s*(export\s+)?type SearchField\s*=/m.test(readFileSync(f, 'utf-8')),
    )
    expect(decls.map(rel)).toEqual(['src/lib/list-query.ts'])
  })

  it('같은 일을 하는 다른 이름의 파서도 없다 (parseSf 등)', () => {
    const offenders = FILES.filter((f) => /function parseSf\s*\(/.test(readFileSync(f, 'utf-8')))
    expect(offenders.map(rel)).toEqual([])
  })
})

describe('기존 import 경로 호환', () => {
  it('posts.base 모듈이 살아 있고 기존 export 를 유지한다', async () => {
    const mod = await import('@/lib/queries/posts/posts.base')
    expect(typeof mod.buildTextSearch).toBe('function')
    expect(mod.DELETED_USER).toBeDefined()
  })

  it('posts.base 는 재수출 형태를 유지한다', () => {
    const t = readFileSync(join(SRC, 'lib/queries/posts/posts.base.ts'), 'utf-8')
    expect(t).toContain("export type { SearchField } from '@/lib/list-query'")
  })

  it('buildTextSearch 가 세 축 모두에서 기존 조건을 만든다', async () => {
    const { buildTextSearch } = await import('@/lib/queries/posts/posts.base')
    expect(buildTextSearch('갱년기', 'title').OR).toHaveLength(1)
    expect(buildTextSearch('갱년기', 'content').OR).toHaveLength(1)
    expect(buildTextSearch('갱년기', 'both').OR).toHaveLength(2)
    expect(buildTextSearch('   ', 'both')).toEqual({})
    expect(buildTextSearch(undefined, 'both')).toEqual({})
  })
})
