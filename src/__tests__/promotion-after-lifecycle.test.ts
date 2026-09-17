/**
 * 승격 호출의 **실행 생명주기** 계약.
 *
 * ── 왜 필요한가 ──────────────────────────────────────────────
 *  승격 호출이 `void fn(...).catch(...)` 였다. 이 형태는 Server Action 이 응답을 마친 뒤에도
 *  계속 돌 수 있는데, **그 시점에 등록한 `revalidateTag` 는 요청의 캐시 무효화 처리에서
 *  빠질 수 있다.** Codex 가 Next 16.3.4 에서 재현했다.
 *
 *  Next 가 주는 해결책이 `after()` 다 — 응답을 보낸 뒤에도 **요청 수명 안에서** 콜백을 돌려주고,
 *  그 안에서 등록한 무효화가 처리된다.
 *
 * ── 🔴 형태가 중요하다 ───────────────────────────────────────
 *   허용:  after(async () => { await 승격함수(...) })
 *   금지:  after(이미시작한Promise)        — 이미 시작했으므로 등록 시점이 그대로다
 *   금지:  after(() => { void 승격함수() }) — 콜백이 기다리지 않아 같은 문제가 남는다
 *
 * 🔴 DB·Redis·외부 네트워크는 전부 격리한다.
 */
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/* ── after() 를 흉내 낸다: 콜백을 모아 두었다가 "응답 종료 후" 돌린다 ── */
const afterCallbacks: Array<() => Promise<unknown> | unknown> = []
const afterCalls: unknown[] = []
vi.mock('next/server', () => ({
  after: (cb: unknown) => {
    afterCalls.push(cb)
    if (typeof cb === 'function') afterCallbacks.push(cb as () => Promise<unknown>)
  },
}))

/** 응답이 끝난 뒤 Next 가 하는 일 — 등록된 콜백을 끝까지 기다린다. */
async function flushAfter() {
  const cbs = [...afterCallbacks]
  afterCallbacks.length = 0
  for (const cb of cbs) await cb()
}

const revalidateTag = vi.fn()
const updateTag = vi.fn()
const revalidatePath = vi.fn()
vi.mock('next/cache', () => ({
  revalidateTag: (t: string, p?: string) => revalidateTag(t, p),
  updateTag: (t: string) => updateTag(t),
  revalidatePath: (p: string) => revalidatePath(p),
  unstable_cache: (fn: (...a: unknown[]) => unknown) => fn,
}))

/* ── 외부 의존 전부 격리 ── */
vi.mock('@upstash/redis', () => ({
  Redis: class { async get() { return null } async set() { return 'OK' } async del() { return 1 } },
}))
vi.mock('@/lib/seo/board-slug-cache', () => ({
  invalidateCachedBoardType: async () => {},
  readCachedBoardType: async () => ({ hit: false as const }),
  writeCachedBoardType: async () => {},
}))
vi.stubGlobal('fetch', vi.fn(async () => new Response('{}')))

const promoted: string[] = []
vi.mock('@/lib/actions/promotion', () => ({
  checkAndPromotePost: vi.fn(async (postId: string) => {
    await new Promise((r) => setTimeout(r, 0))   // 응답보다 늦게 끝나는 상황
    promoted.push(`single:${postId}`)
    const { revalidateJobPromotion } = await import('@/lib/cache/job-cache')
    revalidateJobPromotion(postId)
  }),
  retroactivePromotionUpdate: vi.fn(async (boardType: string) => {
    await new Promise((r) => setTimeout(r, 0))
    promoted.push(`bulk:${boardType}`)
    const { revalidateJobPromotionBulk } = await import('@/lib/cache/job-cache')
    revalidateJobPromotionBulk()
    return { updated: 1, promoted: 1 }
  }),
}))

const SRC = resolve(process.cwd(), 'src')
const read = (p: string) => readFileSync(join(SRC, p), 'utf-8')
/** 주석을 지운 코드만 — 주석 속 금지 예시 문구를 위반으로 세지 않기 위해서다. */
const codeOnly = (p: string) =>
  read(p).replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')

const CALL_SITES = [
  ['lib/actions/likes.ts', 'checkAndPromotePost'],
  ['lib/actions/guest-likes.ts', 'checkAndPromotePost'],
  ['lib/actions/comments.ts', 'checkAndPromotePost'],
  ['lib/actions/admin/admin.content.ts', 'checkAndPromotePost'],
  ['lib/actions/admin/admin.config.ts', 'retroactivePromotionUpdate'],
] as const

beforeEach(() => {
  vi.clearAllMocks()
  afterCallbacks.length = 0
  afterCalls.length = 0
  promoted.length = 0
})

describe('🔴 승격 호출 5곳이 after() 콜백으로 관리된다', () => {
  it.each(CALL_SITES)('%s — %s 를 after(async () => { await ... }) 로 부른다', (file, fn) => {
    const src = codeOnly(file)
    const re = new RegExp(String.raw`after\(\s*async\s*\(\)\s*=>\s*\{[\s\S]{0,400}?await\s+${fn}\(`)
    expect(re.test(src), `${file}: after(async () => { await ${fn}(...) }) 형태가 아니다`).toBe(true)
  })

  it.each(CALL_SITES)('%s — 승격을 void 로 흘려보내지 않는다', (file, fn) => {
    const src = codeOnly(file)
    expect(src, `${file} 에 void ${fn}( 가 남아 있다`).not.toMatch(new RegExp(String.raw`void\s+${fn}\(`))
  })

  it.each(CALL_SITES)('%s — after 안에서 다시 void 로 흘리지 않는다', (file, fn) => {
    const src = codeOnly(file)
    expect(src).not.toMatch(new RegExp(String.raw`after\([\s\S]{0,200}?void\s+${fn}\(`))
  })

  it.each(CALL_SITES)('%s — 이미 시작한 Promise 를 after 에 넘기지 않는다', (file) => {
    const src = codeOnly(file)
    // after(변수) / after(fn(...)) 형태 금지 — 콜백만 허용
    for (const m of src.matchAll(/after\(\s*([^\s)])/g)) {
      expect(['a', '('].includes(m[1]), `after( 뒤에 콜백이 아닌 것이 왔다: ${m[0]}`).toBe(true)
    }
  })

  it('다섯 곳 모두 next/server 의 after 를 import 한다', () => {
    for (const [file] of CALL_SITES) {
      expect(read(file), `${file} 에 after import 가 없다`).toMatch(/import \{[^}]*\bafter\b[^}]*\} from 'next\/server'/)
    }
  })
})

describe('🔴 응답 종료 뒤에 작업이 끝나고 태그 무효화가 처리된다', () => {
  it('단건 — after 플러시 전에는 아직이고, 플러시 후 승격과 무효화가 완료된다', async () => {
    const { after } = await import('next/server')
    const { checkAndPromotePost } = await import('@/lib/actions/promotion')

    // 호출부가 하는 일과 같은 형태
    after(async () => { await checkAndPromotePost('job-1', 'JOB' as never, 10, 0) })

    // 응답 시점: 아직 아무것도 끝나지 않았다
    expect(promoted).toEqual([])
    expect(revalidateTag).not.toHaveBeenCalled()

    await flushAfter()

    expect(promoted).toEqual(['single:job-1'])
    expect(revalidateTag.mock.calls.map((c) => c[0])).toEqual(
      expect.arrayContaining(['jobs-list', 'home-jobs']),
    )
  })

  it('일괄 — 플러시 후 목록 태그가 무효화된다', async () => {
    const { after } = await import('next/server')
    const { retroactivePromotionUpdate } = await import('@/lib/actions/promotion')
    after(async () => { await retroactivePromotionUpdate('JOB' as never, 5, 20) })

    expect(promoted).toEqual([])
    await flushAfter()

    expect(promoted).toEqual(['bulk:JOB'])
    expect(revalidateTag.mock.calls.map((c) => c[0])).toEqual(
      expect.arrayContaining(['jobs-list', 'home-jobs', 'job-detail']),
    )
  })

  it('after 에 넘긴 것이 함수다 (이미 실행된 Promise 가 아니다)', async () => {
    const { after } = await import('next/server')
    const { checkAndPromotePost } = await import('@/lib/actions/promotion')
    after(async () => { await checkAndPromotePost('job-1', 'JOB' as never, 10, 0) })
    expect(afterCalls).toHaveLength(1)
    expect(typeof afterCalls[0]).toBe('function')
    await flushAfter()
  })
})

describe('문서 정합성', () => {
  it('job-cache 가 "자동 승격은 무효화하지 않는다" 고 적지 않는다', () => {
    const src = read('lib/cache/job-cache.ts')
    expect(src).not.toMatch(/자동 승격은[\s\S]{0,40}무효화하지 않는다/)
  })

  it('"detached 면 updateTag 가 반드시 던진다" 는 설명이 남아 있지 않다', () => {
    const src = read('lib/cache/job-cache.ts')
    expect(src).not.toMatch(/그 문맥에서 `updateTag` 는 던지고/)
  })
})
