/**
 * 승격 호출의 **실행 생명주기** 계약 — 실제 변경 액션 5개를 돌려 확인한다.
 *
 * ── 왜 필요한가 ──────────────────────────────────────────────
 *  승격 호출이 `void fn(...).catch(...)` 였다. 이 형태는 Server Action 이 응답을 마친 뒤에도
 *  계속 돌 수 있는데, **그 시점에 등록한 `revalidateTag` 는 요청의 캐시 무효화 처리에서
 *  빠질 수 있다.** Codex 가 Next 16.3.4 에서 재현했다.
 *
 *  🔴 문제는 예외가 아니라 **등록 시점**이다. "detached 면 `updateTag` 가 반드시 던진다" 는
 *     앞선 설명은 정확하지 않았다.
 *
 *  해결은 `after()` — 응답을 보낸 뒤에도 **요청 수명 안에서** 콜백을 돌려 등록을 살린다.
 *  일자리 캐시가 걸린 **JOB 만** 옮기고, 그 외 게시판은 변경 전 방식 그대로 둔다.
 *
 * ⚠️ **증명 범위**: 액션이 승격을 언제 실행하고 어떤 태그를 무효화하는가.
 *    **증명하지 않는 것**: Next·Vercel 이 실제로 캐시를 지웠는지. `after` 는 여기서 mock 이다.
 *    DB·Redis·외부 네트워크는 전부 격리한다.
 */
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/* ── after(): 콜백을 모아 두었다가 "응답 종료 후" 돌린다 ── */
const afterCallbacks: Array<() => Promise<unknown> | unknown> = []
const afterCalls: unknown[] = []
vi.mock('next/server', () => ({
  after: (cb: unknown) => {
    afterCalls.push(cb)
    if (typeof cb === 'function') afterCallbacks.push(cb as () => Promise<unknown>)
  },
}))
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

/* ── 외부 의존 격리 (네트워크 0) ── */
vi.mock('@upstash/redis', () => ({
  Redis: class { async get() { return null } async set() { return 'OK' } async del() { return 1 } },
}))
vi.mock('@/lib/seo/board-slug-cache', () => ({
  invalidateCachedBoardType: async () => {},
  readCachedBoardType: async () => ({ hit: false as const }),
  writeCachedBoardType: async () => {},
}))
vi.mock('@/lib/notify', () => ({ notifyUser: async () => {}, isRealUser: () => true }))
vi.mock('@/lib/banned-words', () => ({ checkBannedWords: async () => null }))
vi.mock('@/lib/sanitize', () => ({ sanitizeHtml: (s: string) => s, stripHtmlTags: (s: string) => s, plainTextToSafeHtml: (s: string) => s }))
vi.mock('@/lib/summary', () => ({ buildSummary: () => '요약' }))
vi.mock('next/navigation', () => ({ redirect: () => { throw new Error('NEXT_REDIRECT') } }))
vi.mock('next/headers', () => ({
  cookies: async () => ({ get: () => (state.adminCookie ? { value: state.adminCookie } : undefined), set: () => {}, delete: () => {} }),
  headers: async () => new Headers({ 'x-forwarded-for': '1.2.3.4' }),
}))
vi.mock('@/lib/auth', () => ({ auth: async () => (state.userId ? { user: { id: state.userId } } : null) }))
vi.mock('@/lib/rate-limit', () => ({ checkRateLimit: () => null, checkApiRateLimit: async () => null }))

/* ── 승격 함수: 실제 구현 대신 "JOB 이면 태그 무효화" 만 흉내 ── */
const promoted: string[] = []
vi.mock('@/lib/actions/promotion', () => ({
  checkAndPromotePost: vi.fn(async (postId: string, boardType: string) => {
    await new Promise((r) => setTimeout(r, 0))          // 응답보다 늦게 끝나는 상황
    promoted.push(`single:${postId}:${boardType}`)
    if (boardType === 'JOB') {
      const { revalidateJobPromotion } = await import('@/lib/cache/job-cache')
      revalidateJobPromotion(postId)
    }
  }),
  retroactivePromotionUpdate: vi.fn(async (boardType: string) => {
    await new Promise((r) => setTimeout(r, 0))
    promoted.push(`bulk:${boardType}`)
    if (boardType === 'JOB') {
      const { revalidateJobPromotionBulk } = await import('@/lib/cache/job-cache')
      revalidateJobPromotionBulk()
    }
    return { updated: 1, promoted: 1 }
  }),
}))

/* ── prisma: 필요한 것만 흉내, 나머지는 빈 값 ── */
const state = {
  userId: 'user-1' as string | null,
  adminCookie: undefined as string | undefined,
  boardType: 'JOB' as string,
  postMissing: false,
  writeThrows: false,
}
function emptyFor(op: string): unknown {
  if (op === 'findMany' || op === 'groupBy') return []
  if (op === 'count') return 0
  return null
}
const postModel = {
  findUnique: async () => (state.postMissing ? null : { id: 'p1', authorId: 'author-9', boardType: state.boardType, status: 'PUBLISHED', likeCount: 3, commentCount: 1, slug: 'my-slug', promotionLevel: 'NORMAL', hotPromotedAt: null }),
  findFirst: async () => (state.postMissing ? null : { id: 'p1', authorId: 'author-9', boardType: state.boardType, status: 'PUBLISHED', slug: 'my-slug', category: '일상', source: 'USER' }),
  update: async () => { if (state.writeThrows) throw new Error('DB write failed'); return { id: 'p1', authorId: 'author-9', likeCount: 4, commentCount: 2, boardType: state.boardType } },
  updateMany: async () => { if (state.writeThrows) throw new Error('DB write failed'); return { count: 1 } },
  findMany: async () => [],
  count: async () => 0,
}
vi.mock('@/lib/prisma', () => {
  // 🔴 팩토리는 호이스팅되므로 프록시를 **여기 안에서** 만든다.
  const proxy: Record<string, unknown> = new Proxy({} as Record<string, unknown>, {
    get: (_t, model: string) => {
      if (model === 'then') return undefined
      // 콜백 형태(`$transaction(async (tx) => ...)`)도 실제로 실행한다.
      // 실행하지 않으면 DB 실패 테스트가 "쓰기가 성공한 것처럼" 통과해 버린다.
      if (model === '$transaction') {
        return async (arg: unknown) => {
          if (typeof arg === 'function') return (arg as (tx: unknown) => unknown)(proxy)
          return Array.isArray(arg) ? Promise.all(arg) : []
        }
      }
      if (model === 'post') return postModel
      if (model === 'like' || model === 'guestLike') {
        return new Proxy({}, { get: (_t2, op: string) => async () => {
          if (state.writeThrows && (op === 'create' || op === 'delete' || op === 'deleteMany')) throw new Error('DB write failed')
          return op === 'findUnique' || op === 'findFirst' ? null : emptyFor(op)
        } })
      }
      if (model === 'boardConfig') {
        return new Proxy({}, { get: (_t2, op: string) => async () => {
          if (state.writeThrows && (op === 'update' || op === 'updateMany')) throw new Error('DB write failed')
          return op === 'findUnique'
            ? { id: 'c1', boardType: state.boardType, hotThreshold: 5, fameThreshold: 20, categories: ['일상'] }
            : emptyFor(op)
        } })
      }
      return new Proxy({}, { get: (_t2, op: string) => async () => {
        if (state.writeThrows && (op === 'update' || op === 'create' || op === 'updateMany')) throw new Error('DB write failed')
        return emptyFor(op)
      } })
    },
  })
  return { prisma: proxy }
})

import { togglePostLike } from '@/lib/actions/likes'
import { toggleGuestPostLike } from '@/lib/actions/guest-likes'
import { createComment } from '@/lib/actions/comments'
import { adminSetPostLikeCount } from '@/lib/actions/admin/admin.content'
import { adminUpdateBoardConfig } from '@/lib/actions/admin/admin.config'
import { createAdminToken } from '@/lib/admin-auth'

const SRC = resolve(process.cwd(), 'src')
const read = (p: string) => readFileSync(join(SRC, p), 'utf-8')
const codeOnly = (p: string) =>
  read(p).replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')

beforeEach(async () => {
  vi.clearAllMocks()
  afterCallbacks.length = 0
  afterCalls.length = 0
  promoted.length = 0
  process.env.ADMIN_JWT_SECRET = 'x'.repeat(40)
  Object.assign(state, {
    userId: 'user-1',
    adminCookie: await createAdminToken({ adminId: 'a1', email: 'a@b.com', nickname: '관리자' }),
    boardType: 'JOB',
    postMissing: false,
    writeThrows: false,
  })
})

/* ── 실제 액션 5개 ────────────────────────────────────────── */
type Case = [name: string, run: () => Promise<unknown>]
const ACTIONS: Case[] = [
  ['togglePostLike', () => togglePostLike('p1')],
  ['toggleGuestPostLike', () => toggleGuestPostLike('p1')],
  ['createComment', () => createComment('p1', '댓글 내용입니다')],
  ['adminSetPostLikeCount', () => adminSetPostLikeCount('p1', 7)],
  ['adminUpdateBoardConfig', () => adminUpdateBoardConfig('c1', { hotThreshold: 7 })],
]

describe('🔴 JOB — 액션 반환 전에는 승격 미실행, after 플러시 후 완료', () => {
  it.each(ACTIONS)('%s', async (_n, run) => {
    state.boardType = 'JOB'
    await run().catch(() => {})

    // 응답 시점: 콜백은 등록됐지만 아직 돌지 않았다
    expect(afterCalls.length, 'after 가 등록되지 않았다').toBeGreaterThan(0)
    expect(promoted, '응답 전에 승격이 실행됐다').toEqual([])
    expect(revalidateTag, '응답 전에 무효화가 일어났다').not.toHaveBeenCalled()

    await flushAfter()

    expect(promoted.length, 'after 후에도 승격이 실행되지 않았다').toBeGreaterThan(0)
    expect(revalidateTag.mock.calls.map((c) => c[0])).toEqual(
      expect.arrayContaining(['jobs-list', 'home-jobs']),
    )
  })

  it.each(ACTIONS)('%s — after 에 넘긴 것이 함수다 (이미 시작한 Promise 아님)', async (_n, run) => {
    state.boardType = 'JOB'
    await run().catch(() => {})
    expect(afterCalls.every((c) => typeof c === 'function')).toBe(true)
    await flushAfter()
  })
})

describe('🔴 JOB 외 — after 미등록, 기존 동작 유지', () => {
  it.each(ACTIONS)('%s', async (_n, run) => {
    state.boardType = 'STORY'
    await run().catch(() => {})
    expect(afterCalls, 'JOB 이 아닌데 after 에 등록됐다').toEqual([])
    // 기존 fire-and-forget 이 그대로 돈다 — microtask 를 한 바퀴 돌려 확인
    await new Promise((r) => setTimeout(r, 5))
    expect(promoted.length, '기존 승격 호출이 사라졌다').toBeGreaterThan(0)
    expect(revalidateTag, 'JOB 외에서 일자리 태그를 건드렸다').not.toHaveBeenCalled()
  })
})

describe('🔴 인증 실패 — after 미등록 (경로별)', () => {
  it('togglePostLike — 미로그인', async () => {
    state.userId = null
    const r = await togglePostLike('p1')
    expect((r as { error?: string }).error).toBe('로그인이 필요합니다')
    expect(afterCalls).toEqual([])
    expect(promoted).toEqual([])
  })

  it('createComment — 미로그인', async () => {
    state.userId = null
    const r = await createComment('p1', '댓글 내용입니다')
    expect((r as { error?: string }).error).toBe('로그인이 필요합니다')
    expect(afterCalls).toEqual([])
  })

  it('adminSetPostLikeCount — 어드민 쿠키 없음', async () => {
    state.adminCookie = undefined
    await expect(adminSetPostLikeCount('p1', 7)).rejects.toThrow('관리자 인증이 필요합니다.')
    expect(afterCalls).toEqual([])
  })

  it('adminUpdateBoardConfig — 어드민 쿠키 없음', async () => {
    state.adminCookie = undefined
    await expect(adminUpdateBoardConfig('c1', { hotThreshold: 7 })).rejects.toThrow('관리자 인증이 필요합니다.')
    expect(afterCalls).toEqual([])
  })

  it('toggleGuestPostLike — 대상 글이 없으면 등록하지 않는다', async () => {
    state.postMissing = true
    await toggleGuestPostLike('p1')
    expect(afterCalls).toEqual([])
  })
})

describe('🔴 DB 실패 — after 미등록 (경로별)', () => {
  it.each(ACTIONS)('%s', async (_n, run) => {
    state.boardType = 'JOB'
    state.writeThrows = true
    await run().catch(() => {})
    expect(afterCalls, 'DB 실패인데 after 에 등록됐다').toEqual([])
    expect(revalidateTag).not.toHaveBeenCalled()
  })
})

/* ── 보조: 소스 문자열 검사 ───────────────────────────────── */
describe('보조 — 소스 형태 (주 검증은 위의 실제 실행이다)', () => {
  const CALL_SITES = [
    ['lib/actions/likes.ts', 'checkAndPromotePost'],
    ['lib/actions/guest-likes.ts', 'checkAndPromotePost'],
    ['lib/actions/comments.ts', 'checkAndPromotePost'],
    ['lib/actions/admin/admin.content.ts', 'checkAndPromotePost'],
    ['lib/actions/admin/admin.config.ts', 'retroactivePromotionUpdate'],
  ] as const

  it.each(CALL_SITES)('%s — JOB 조건 안에서 after(async () => { await ... })', (file, fn) => {
    const src = codeOnly(file)
    expect(src).toMatch(/boardType === 'JOB'/)
    expect(src).toMatch(new RegExp(String.raw`after\(\s*async\s*\(\)\s*=>\s*\{[\s\S]{0,400}?await\s+${fn}\(`))
  })

  it.each(CALL_SITES)('%s — after 안에서 void 로 흘리지 않는다', (file, fn) => {
    expect(codeOnly(file)).not.toMatch(new RegExp(String.raw`after\([\s\S]{0,200}?void\s+${fn}\(`))
  })

  it.each(CALL_SITES)('%s — after( 뒤에는 콜백만 온다', (file) => {
    for (const m of codeOnly(file).matchAll(/after\(\s*([^\s)])/g)) {
      expect(['a', '('].includes(m[1]), `after( 뒤에 콜백이 아닌 것: ${m[0]}`).toBe(true)
    }
  })

  it('다섯 곳 모두 next/server 의 after 를 import 한다', () => {
    for (const [file] of CALL_SITES) {
      expect(read(file)).toMatch(/import \{[^}]*\bafter\b[^}]*\} from 'next\/server'/)
    }
  })
})

describe('문서 정합성', () => {
  it('job-cache 가 "자동 승격은 무효화하지 않는다" 고 적지 않는다', () => {
    expect(read('lib/cache/job-cache.ts')).not.toMatch(/자동 승격은[\s\S]{0,40}무효화하지 않는다/)
  })

  it('"detached 면 updateTag 가 반드시 던진다" 설명이 남아 있지 않다', () => {
    expect(read('lib/cache/job-cache.ts')).not.toMatch(/그 문맥에서 `updateTag` 는 던지고/)
  })
})
