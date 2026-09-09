import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

/**
 * 캐시 무효화 API 를 **실행 문맥에 맞게** 고정한다 — Next 16 전환, 2026-09-09.
 *
 * Next 16 에서 `revalidateTag(tag)` 가 `revalidateTag(tag, profile)` 로 바뀌었고,
 * **즉시 반영(read-your-own-writes)은 `updateTag` 만 보장**한다.
 * `revalidateTag(tag, 'max')` 는 즉시가 아니다 — 글을 쓰고 목록에 바로 안 보이는 형태로 깨진다.
 *
 * 반대로 `updateTag` 는 **Server Action 밖에서 부르면 던진다.** Route Handler 에서 쓰면 500 이다.
 *
 * 그래서 둘은 취향이 아니라 **문맥의 문제**다. 여기서 그 선택을 고정한다.
 *   · `'use server'` 파일  → updateTag
 *   · Route Handler·페이지 → revalidateTag(tag, 'max')
 *   · 공유 helper          → 호출부 문맥에 맞게 **함수를 나눈다**
 */

const ROOT = join(__dirname, '../..')

function walk(dir: string, acc: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === 'generated' || name === '__tests__') continue
    const full = join(dir, name)
    if (statSync(full).isDirectory()) walk(full, acc)
    else if (/\.tsx?$/.test(name)) acc.push(full)
  }
  return acc
}

/** 주석을 걷어낸 실행 코드만 본다 — 설명문 속 API 이름을 위반으로 세지 않는다. */
function code(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
}

const files = walk(join(ROOT, 'src')).map((f) => ({
  path: f.replace(`${ROOT}/`, ''),
  src: readFileSync(f, 'utf-8'),
}))

const isServerAction = (s: string) => /^\s*'use server'/m.test(s.split('\n').slice(0, 3).join('\n'))
const isRouteHandler = (p: string) => /\/route\.tsx?$/.test(p)
const isPage = (p: string) => /\/(page|layout)\.tsx?$/.test(p)

describe('Server Action 은 updateTag 를 쓴다 — 즉시 반영 보장', () => {
  const actions = files.filter((f) => isServerAction(f.src) && /(?:update|revalidate)Tag\(/.test(code(f.src)))

  it('대상 Server Action 을 실제로 찾았다 (스캔이 비면 전부 통과가 된다)', () => {
    expect(actions.length, 'Server Action 을 하나도 찾지 못했다').toBeGreaterThan(5)
  })

  it("어떤 Server Action 도 revalidateTag(tag, 'max') 를 쓰지 않는다", () => {
    const bad = actions.filter((f) => /revalidateTag\(/.test(code(f.src))).map((f) => f.path)
    expect(bad, "글 작성·댓글·설정·어드민 변경은 즉시 보여야 한다 — 'max' 는 즉시가 아니다").toEqual([])
  })
})

describe('Route Handler·페이지는 updateTag 를 쓰지 않는다 — 호출 시 던진다', () => {
  it('route.ts 와 page/layout 에 updateTag 가 없다', () => {
    const bad = files
      .filter((f) => (isRouteHandler(f.path) || isPage(f.path)) && /\bupdateTag\(/.test(code(f.src)))
      .map((f) => f.path)
    expect(bad, 'updateTag 는 Server Action 밖에서 던진다 — 500 이 된다').toEqual([])
  })

  it("revalidateTag 호출에는 항상 두 번째 인자가 있다", () => {
    const bad: string[] = []
    for (const f of files) {
      for (const m of code(f.src).matchAll(/revalidateTag\(([^;]*?)\)/g)) {
        if (!/,/.test(m[1])) bad.push(`${f.path}: ${m[0].slice(0, 60)}`)
      }
    }
    expect(bad, 'Next 16 에서 1인자 호출은 deprecated 경고를 낸다').toEqual([])
  })
})

describe('문맥이 섞인 helper 는 함수를 나눈다', () => {
  const jobCache = files.find((f) => f.path === 'src/lib/cache/job-cache.ts')

  it('job-cache 가 두 API 를 모두 쓴다 — 호출부 문맥이 다르기 때문이다', () => {
    expect(jobCache, 'job-cache.ts 를 찾지 못했다').toBeDefined()
    const c = code(jobCache!.src)
    expect(c, 'Route Handler(/api/bot/jobs) 경로가 있다').toMatch(/revalidateTag\(/)
    expect(c, 'Server Action(어드민) 경로가 있다').toMatch(/\bupdateTag\(/)
  })

  it('revalidateJobCreated 는 revalidateTag, revalidateJobPost 는 updateTag 다', () => {
    const c = code(jobCache!.src)
    const created = c.slice(c.indexOf('export function revalidateJobCreated'), c.indexOf('export function revalidateJobPost'))
    const post = c.slice(c.indexOf('export function revalidateJobPost('))
    expect(created, 'revalidateJobCreated 는 /api/bot/jobs 에서만 불린다 — updateTag 를 쓰면 던진다').not.toMatch(/\bupdateTag\(/)
    expect(post, '어드민이 바꾸고 바로 확인하는 경로다').toMatch(/\bupdateTag\(/)
  })

  it('revalidatePostComments 는 updateTag 다 (호출부가 전부 Server Action)', () => {
    const comments = files.find((f) => f.path === 'src/lib/queries/comments.ts')!
    const c = code(comments.src)
    const fn = c.slice(c.indexOf('export function revalidatePostComments'))
    expect(fn).toMatch(/\bupdateTag\(/)
    expect(fn, '댓글은 달자마자 보여야 한다').not.toMatch(/revalidateTag\(/)
  })
})
