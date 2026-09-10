import { afterEach, describe, expect, it, vi } from 'vitest'
import { parseArgs, projectRefOf, isExecutionAuthorized, resolveTargets, run, type Ctx } from './purge-naver-cafe-data.js'
import { EXPECTED } from '../purge/naver-origin-policy.js'

/** 테스트용 가짜 ref — 실제 production ref 를 테스트에도 적지 않는다. */
const REF = 'test-project-ref'

const URL_ = `https://${REF}.supabase.co`
const ctx = (execute: boolean): Ctx => ({ url: URL_, key: 'test-key', execute })

/** 실제 production 데이터 모양을 흉내낸 fetch — 네트워크로 나가지 않는다. */
function stubFetch(opts: {
  posts?: { id: string; source: string; cafePostId: string | null; sourceUrl: string | null }[]
  humanPostIds?: string[]
  botCommentIds?: string[]
  counts?: Record<string, number>
  publicNaverCount?: number
} = {}) {
  const posts = opts.posts ?? []
  const human = opts.humanPostIds ?? []
  const botComments = opts.botCommentIds ?? []
  const counts = opts.counts ?? {}
  const calls: { method: string; url: string; body?: string }[] = []

  const fn = vi.fn(async (url: string, init?: RequestInit) => {
    const method = (init?.method ?? 'GET').toUpperCase()
    calls.push({ method, url, body: init?.body as string | undefined })
    const path = url.replace(`${URL_}/rest/v1/`, '')
    const table = path.split('?')[0]

    if (method !== 'GET') return { ok: true, status: 204, headers: new Headers(), json: async () => [] } as unknown as Response

    // count 요청 (limit=1 + Prefer count) — 경로별로 답이 달라야 한다
    if ((init?.headers as Record<string, string>)?.Prefer === 'count=exact') {
      // 공개된 네이버 유래 글은 실측 0 이다. 테이블 총계와 구분해서 답한다.
      const isPublicNaver = path.includes('status=in.') && path.includes('cafePostId.not.is.null')
      const n = isPublicNaver ? (opts.publicNaverCount ?? 0) : (counts[table] ?? 0)
      return { ok: true, status: 206, headers: new Headers({ 'content-range': `0-0/${n}` }), json: async () => [] } as unknown as Response
    }
    const full =
      table === 'Post' ? posts :
      table === 'Comment' && path.includes('author.or=') ? botComments.map((id) => ({ id })) :
      table === 'Comment' || table === 'Like' || table === 'GuestLike' || table === 'Report' ? human.map((postId) => ({ postId })) :
      []
    // 실제 PostgREST 처럼 offset·limit 을 지킨다 — 안 지키면 페이지 루프가 끝나지 않는다.
    const q = new URLSearchParams(path.split('?')[1] ?? '')
    const off = Number(q.get('offset') ?? 0)
    const lim = Number(q.get('limit') ?? full.length)
    const body = full.slice(off, off + lim)
    return { ok: true, status: 200, headers: new Headers(), json: async () => body } as unknown as Response
  })
  vi.stubGlobal('fetch', fn)
  return { calls, fn }
}

afterEach(() => { vi.unstubAllGlobals() })

describe('[T3] 확인 토큰이 없으면 실행 권한이 없다', () => {
  it('--execute 만으로는 권한이 없다', () => {
    expect(isExecutionAuthorized(parseArgs(['--execute']), REF)).toBe(false)
  })

  it('토큰이 틀리면 권한이 없다', () => {
    expect(isExecutionAuthorized(parseArgs(['--execute', '--confirm=PURGE-wrong']), REF)).toBe(false)
  })

  it('--execute 없이 토큰만 있어도 권한이 없다', () => {
    expect(isExecutionAuthorized(parseArgs([`--confirm=PURGE-${REF}`]), REF)).toBe(false)
  })

  it('둘 다 맞아야 권한이 있다', () => {
    expect(isExecutionAuthorized(parseArgs(['--execute', `--confirm=PURGE-${REF}`]), REF)).toBe(true)
  })

  it('project ref 를 URL 에서 뽑는다', () => {
    expect(projectRefOf(URL_)).toBe(REF)
  })
})

describe('[T4] dry-run 은 POST/PATCH/DELETE 를 0회 보낸다', () => {
  it('기준선이 맞아도 dry-run 에서는 write 가 없다', async () => {
    const posts = Array.from({ length: EXPECTED.naverOrigin }, (_, i) => ({
      id: `p${i}`, source: 'BOT', cafePostId: 'c', sourceUrl: null,
    }))
    const humanPostIds = posts.slice(0, EXPECTED.tombstonePosts).map((p) => p.id)
    const { calls } = stubFetch({
      posts, humanPostIds, botCommentIds: [],
      counts: { Post: EXPECTED.postTotal, CafePost: EXPECTED.cafePost, CafeTrend: EXPECTED.cafeTrend, CommentWaveQueue: EXPECTED.commentWaveQueue },
    })
    await run(ctx(false))
    expect(calls.filter((c) => c.method !== 'GET')).toHaveLength(0)
  })
})

describe('[T2] 기준 건수가 어긋나면 mutation 0 으로 중단', () => {
  it('네이버 유래 건수가 예상과 다르면 던지고 write 하지 않는다', async () => {
    const posts = Array.from({ length: 10 }, (_, i) => ({ id: `p${i}`, source: 'BOT', cafePostId: 'c', sourceUrl: null }))
    const { calls } = stubFetch({ posts, counts: { Post: EXPECTED.postTotal, CafePost: EXPECTED.cafePost, CafeTrend: EXPECTED.cafeTrend, CommentWaveQueue: EXPECTED.commentWaveQueue } })
    await expect(run(ctx(true))).rejects.toThrow(/ABORT/)
    expect(calls.filter((c) => c.method !== 'GET')).toHaveLength(0)
  })

  it('CafePost 건수가 어긋나도 중단한다', async () => {
    const posts = Array.from({ length: EXPECTED.naverOrigin }, (_, i) => ({ id: `p${i}`, source: 'BOT', cafePostId: 'c', sourceUrl: null }))
    const humanPostIds = posts.slice(0, EXPECTED.tombstonePosts).map((p) => p.id)
    const { calls } = stubFetch({ posts, humanPostIds, counts: { Post: EXPECTED.postTotal, CafePost: 1, CafeTrend: EXPECTED.cafeTrend, CommentWaveQueue: EXPECTED.commentWaveQueue } })
    await expect(run(ctx(true))).rejects.toThrow(/ABORT/)
    expect(calls.filter((c) => c.method !== 'GET')).toHaveLength(0)
  })
})

describe('[T1] 후보에 USER Post 가 섞이면 즉시 중단', () => {
  it('USER 가 1건이라도 있으면 던지고 write 하지 않는다', async () => {
    const posts = [
      ...Array.from({ length: 5 }, (_, i) => ({ id: `p${i}`, source: 'BOT', cafePostId: 'c', sourceUrl: null })),
      { id: 'user-1', source: 'USER', cafePostId: 'c', sourceUrl: null },
    ]
    const { calls } = stubFetch({ posts, counts: { Post: EXPECTED.postTotal } })
    await expect(run(ctx(true))).rejects.toThrow(/FAIL-CLOSED/)
    expect(calls.filter((c) => c.method !== 'GET')).toHaveLength(0)
  })
})

describe('[T5] 모든 mutation 은 필터를 갖는다', () => {
  it('DELETE·PATCH 요청에 필터 파라미터가 반드시 있다', async () => {
    const posts = Array.from({ length: EXPECTED.naverOrigin }, (_, i) => ({
      id: `p${i}`, source: 'BOT', cafePostId: 'c', sourceUrl: null,
    }))
    const humanPostIds = posts.slice(0, EXPECTED.tombstonePosts).map((p) => p.id)
    const { calls } = stubFetch({
      posts, humanPostIds, botCommentIds: ['c1', 'c2'],
      counts: { Post: EXPECTED.postTotal, CafePost: EXPECTED.cafePost, CafeTrend: EXPECTED.cafeTrend, CommentWaveQueue: EXPECTED.commentWaveQueue },
    })
    await run(ctx(true))
    const writes = calls.filter((c) => c.method !== 'GET')
    expect(writes.length).toBeGreaterThan(0)
    for (const w of writes) {
      const query = w.url.split('?')[1] ?? ''
      const keys = [...new URLSearchParams(query).keys()].filter((k) => !['select', 'limit', 'offset', 'order'].includes(k))
      expect(keys.length, `필터 없는 요청: ${w.method}`).toBeGreaterThan(0)
    }
  })

  it('POST(생성) 요청은 한 번도 보내지 않는다', async () => {
    const posts = Array.from({ length: EXPECTED.naverOrigin }, (_, i) => ({ id: `p${i}`, source: 'BOT', cafePostId: 'c', sourceUrl: null }))
    const humanPostIds = posts.slice(0, EXPECTED.tombstonePosts).map((p) => p.id)
    const { calls } = stubFetch({ posts, humanPostIds, counts: { Post: EXPECTED.postTotal, CafePost: EXPECTED.cafePost, CafeTrend: EXPECTED.cafeTrend, CommentWaveQueue: EXPECTED.commentWaveQueue } })
    await run(ctx(true))
    expect(calls.filter((c) => c.method === 'POST')).toHaveLength(0)
  })
})

describe('[T8] 중간 실패 후 재실행해도 범위가 넓어지지 않는다', () => {
  it('대상을 매번 라이브 데이터에서 다시 구한다 — 이미 지운 것은 후보에 없다', async () => {
    // 1차: 7,449건. 2차(부분 실행 후): 남은 것만 반환 → 후보가 줄어들 뿐 넓어지지 않는다.
    const remaining = Array.from({ length: 100 }, (_, i) => ({ id: `p${i}`, source: 'BOT', cafePostId: 'c', sourceUrl: null }))
    stubFetch({ posts: remaining, humanPostIds: [], counts: { Post: EXPECTED.postTotal } })
    const t = await resolveTargets(ctx(false))
    expect(t.naverOriginIds).toHaveLength(100)
    expect(t.hardDeleteIds).toHaveLength(100)
    expect(t.tombstoneIds).toHaveLength(0)
    // 실회원 흔적이 있는 것은 절대 hard delete 후보로 넘어가지 않는다
    stubFetch({ posts: remaining, humanPostIds: remaining.slice(0, 10).map((p) => p.id), counts: { Post: EXPECTED.postTotal } })
    const t2 = await resolveTargets(ctx(false))
    expect(t2.tombstoneIds).toHaveLength(10)
    expect(t2.hardDeleteIds).toHaveLength(90)
  })
})

describe('[T10] 폐기 후 네이버 원문 소비처가 0 이어야 한다 — 코드 계약', () => {
  it('CafePost 를 읽는 런타임 경로가 없다', async () => {
    const { readFileSync, readdirSync, statSync } = await import('fs')
    const path = await import('path')
    const root = path.resolve(__dirname, '../..')
    const hits: string[] = []
    const walk = (dir: string) => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, e.name)
        // `src/generated/prisma` 는 Prisma 가 만든 클라이언트라 애플리케이션 소비처가 아니다.
        if (e.name === 'node_modules' || e.name === '.git' || e.name === '.next' || e.name === 'generated') continue
        if (e.isDirectory()) { walk(full); continue }
        if (!/\.(ts|tsx)$/.test(e.name) || /\.test\.ts$/.test(e.name)) continue
        if (statSync(full).size > 2_000_000) continue
        const src = readFileSync(full, 'utf8')
        if (/prisma\.cafePost\b/.test(src)) hits.push(path.relative(root, full))
      }
    }
    for (const d of ['src', 'agents', 'scripts']) walk(path.join(root, d))
    // 유일하게 허용되는 소비처는 보존 정책 purge 뿐이다. 그 외가 생기면 실패한다.
    expect(hits.sort()).toEqual(['agents/scripts/purge-old-logs.ts'])
  })
})
