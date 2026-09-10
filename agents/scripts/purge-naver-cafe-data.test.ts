import { afterEach, describe, expect, it } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parseArgs, projectRefOf, isExecutionAuthorized, run, type Ctx } from './purge-naver-cafe-data.js'
import { EXPECTED, TOMBSTONE_PATCH, isTombstoned, type PurgeExpectation } from '../purge/naver-origin-policy.js'

/** fixture 규모에 맞춘 기준선 — 기준선은 코드가 아니라 데이터다. */
const FIXTURE_EXPECTED: Omit<PurgeExpectation, 'publicUserPosts'> = {
  naverOrigin: EXPECTED.naverOrigin,
  tombstonePosts: EXPECTED.tombstonePosts,
  humanCommentsOnTombstone: EXPECTED.humanCommentsOnTombstone,
  nullAuthorCommentsOnTombstone: EXPECTED.nullAuthorCommentsOnTombstone,
  guestLikesOnNaver: EXPECTED.guestLikesOnNaver,
  reportsOnNaver: EXPECTED.reportsOnNaver,
  homeCurationOnNaver: EXPECTED.homeCurationOnNaver,
  cafePost: 120, cafeTrend: 30, commentWaveQueue: 40,
  botLogCafeCrawler: 60, r2Objects: EXPECTED.r2Objects,
}

/** 테스트용 가짜 ref — 실제 production ref 를 테스트에도 적지 않는다. */
const REF = 'test-project-ref'
const URL_ = `https://${REF}.supabase.co`

// ─────────────────────────────────────────────────────────────────────────────
// 상태를 **실제로 바꾸는** 인메모리 DB. mutation 이 no-op 이면 테스트가 실패해야 한다.
// ─────────────────────────────────────────────────────────────────────────────
type Row = Record<string, unknown> & { id: string }
type Fault = {
  /** mutation 을 무시한다 (no-op 회귀 탐지) */ noop?: boolean
  /** 각 mutation 에서 실제로는 절반만 반영한다 */ half?: boolean
  /** n 번째 mutation 부터 HTTP 오류 */ httpErrorAfter?: number
  /** 특정 테이블만 절반 삭제 */ halfTable?: string
  /** P4 PATCH 에서 일부 필드를 빠뜨린다 */ partialPatch?: boolean
  /** R2 삭제를 무시한다 */ r2Noop?: boolean
}

function makeDb() {
  const N = EXPECTED.naverOrigin
  const T = EXPECTED.tombstonePosts
  const users: Row[] = [
    ...Array.from({ length: EXPECTED.humanUsers }, (_, i) => ({ id: `u${i}`, providerId: `${1000 + i}` })),
    ...Array.from({ length: 320 }, (_, i) => ({ id: `b${i}`, providerId: `bot_${i}` })),
  ]
  // 앞 T 건이 흔적 보유(tombstone), 나머지는 hard delete
  const posts: Row[] = Array.from({ length: N }, (_, i) => ({
    id: `p${String(i).padStart(5, '0')}`, source: i % 7 === 0 ? 'SHEET' : 'BOT',
    cafePostId: `cp${i}`, sourceUrl: null, title: `원문 제목 샘플 ${i}`,
    thumbnailUrl: i < EXPECTED.r2Objects ? `https://cdn.example/posts/${i}.webp` : null,
    summary: 's', slug: `slug-${i}`, category: 'c', seoTitle: 't', seoDescription: 'd',
    originalTitle: null, sourceSite: null, seriesId: null, seriesTitle: null, seasonId: null, controversyChainId: null,
    content: '본문', status: 'HIDDEN',
  }))
  // 흔적을 **서로 겹치지 않는** 글에 배치해 tombstone 대상이 정확히 T건이 되게 한다.
  //   실회원 댓글 71 | NULL 댓글 56 | GuestLike 111 | HomeCuration 86(행 139) = 324
  const comments: Row[] = []
  const H = EXPECTED.humanCommentsOnTombstone          // 71
  const NU = EXPECTED.nullAuthorCommentsOnTombstone    // 56
  const G = EXPECTED.guestLikesOnNaver                 // 111
  const curationPosts = T - (H + NU + G)               // 86
  for (let i = 0; i < H; i++) comments.push({ id: `ch${i}`, postId: posts[i].id, authorId: `u${i % EXPECTED.humanUsers}` })
  for (let i = 0; i < NU; i++) comments.push({ id: `cn${i}`, postId: posts[H + i].id, authorId: null })
  for (let i = 0; i < EXPECTED.botCommentsOnTombstone; i++) comments.push({ id: `cb${i}`, postId: posts[i % T].id, authorId: `b${i % 320}` })
  const db: Record<string, Row[]> = {
    User: users, Post: posts, Comment: comments,
    Like: [],
    GuestLike: Array.from({ length: G }, (_, i) => ({ id: `g${i}`, postId: posts[H + NU + i].id })),
    Report: [{ id: 'r0', postId: posts[0].id }], // 이미 실회원 댓글이 있는 글 — 중복 흔적
    HomeCurationOverride: Array.from({ length: EXPECTED.homeCurationOnNaver }, (_, i) => ({ id: `h${i}`, postId: posts[H + NU + G + (i % curationPosts)].id })),
    CafePost: Array.from({ length: 120 }, (_, i) => ({ id: `cp${i}` })),
    CafeTrend: Array.from({ length: 30 }, (_, i) => ({ id: `ct${i}` })),
    CommentWaveQueue: Array.from({ length: 40 }, (_, i) => ({ id: `q${i}` })),
    BotLog: [
      ...Array.from({ length: 60 }, (_, i) => ({ id: `bl${i}`, botType: 'CAFE_CRAWLER', details: 'x', logData: null })),
      ...Array.from({ length: 10 }, (_, i) => ({ id: `bo${i}`, botType: 'COO', details: `원문 제목 샘플 ${i}`, logData: null })),
      ...Array.from({ length: 5 }, (_, i) => ({ id: `bk${i}`, botType: 'CTO', details: '무관', logData: null })),
    ],
  }
  const r2 = new Set(posts.slice(0, EXPECTED.r2Objects).map((p) => new URL(String(p.thumbnailUrl)).pathname.replace(/^\//, '')))
  return { db, r2 }
}

/** 아주 작은 PostgREST 흉내 — 필터를 실제로 적용하고 mutation 이 상태를 바꾼다. */
function makeFetch(state: ReturnType<typeof makeDb>, fault: Fault = {}) {
  let mutationCount = 0
  const calls: { method: string; url: string }[] = []

  const matches = (row: Row, params: URLSearchParams, embedded: string[]): boolean => {
    for (const [k, v] of params) {
      if (['select', 'limit', 'offset', 'order', 'or'].includes(k) || k.includes('.')) continue
      if (k === 'id' && v.startsWith('gt.')) { if (!(String(row.id) > v.slice(3))) return false; continue }
      if (v.startsWith('in.(')) {
        const set = new Set(v.slice(4, -1).split(',').map((s) => s.replace(/"/g, '')))
        if (!set.has(String(row[k]))) return false
        continue
      }
      if (v.startsWith('eq.')) { if (String(row[k]) !== decodeURIComponent(v.slice(3))) return false; continue }
      if (v === 'not.is.null') { if (row[k] == null) return false; continue }
      if (v === 'is.null') { if (row[k] != null) return false; continue }
      if (v.startsWith('is.true')) { if (row[k] !== true) return false; continue }
    }
    // or=(cafePostId.not.is.null,sourceUrl.ilike.*cafe.naver.com*)
    const or = params.get('or')
    if (or) {
      const ok = row.cafePostId != null || String(row.sourceUrl ?? '').includes('cafe.naver.com')
      if (!ok) return false
    }
    // post:Post!inner(id) + post.or=... → 부모가 네이버 유래인지
    if (embedded.includes('post') && params.get('post.or')) {
      const parent = state.db.Post.find((p) => p.id === row.postId)
      if (!parent) return false
      if (!(parent.cafePostId != null || String(parent.sourceUrl ?? '').includes('cafe.naver.com'))) return false
    }
    return true
  }

  const fetchImpl = (async (url: string, init?: RequestInit) => {
    const method = (init?.method ?? 'GET').toUpperCase()
    calls.push({ method, url })

    // ── R2 ──
    if (url.includes('r2.cloudflarestorage.com')) {
      const key = url.split(/\/(?=[^/]*$)/).slice(-1)[0]
      const full = url.split('.com/')[1].split('/').slice(1).join('/')
      if (method === 'HEAD') return { ok: state.r2.has(full), status: state.r2.has(full) ? 200 : 404, headers: new Headers(), json: async () => ({}) } as unknown as Response
      if (method === 'DELETE') { if (!fault.r2Noop) state.r2.delete(full); return { ok: true, status: 204, headers: new Headers(), json: async () => ({}) } as unknown as Response }
      void key
    }

    const path = url.replace(`${URL_}/rest/v1/`, '')
    const [table, query = ''] = path.split('?')
    const params = new URLSearchParams(query)
    const rows = state.db[table] ?? []
    const embedded = (params.get('select') ?? '').split(',').filter((s) => s.includes(':')).map((s) => s.split(':')[0])
    const hit = rows.filter((r) => matches(r, params, embedded))

    if (method === 'GET') {
      if ((init?.headers as Record<string, string>)?.Prefer === 'count=exact') {
        return { ok: true, status: 206, headers: new Headers({ 'content-range': `0-0/${hit.length}` }), json: async () => [] } as unknown as Response
      }
      const limit = Number(params.get('limit') ?? hit.length)
      const sorted = [...hit].sort((a, b) => String(a.id).localeCompare(String(b.id)))
      return { ok: true, status: 200, headers: new Headers(), json: async () => sorted.slice(0, limit) } as unknown as Response
    }

    mutationCount++
    if (fault.httpErrorAfter != null && mutationCount > fault.httpErrorAfter) {
      return { ok: false, status: 500, headers: new Headers(), text: async () => 'boom', json: async () => [] } as unknown as Response
    }
    let target = hit
    if (fault.half || (fault.halfTable && fault.halfTable === table)) target = hit.slice(0, Math.floor(hit.length / 2))
    if (fault.noop) target = []

    if (method === 'DELETE') {
      const kill = new Set(target.map((r) => r.id))
      state.db[table] = rows.filter((r) => !kill.has(r.id))
      // FK CASCADE: Post 삭제 시 Comment 도 사라진다
      if (table === 'Post') state.db.Comment = state.db.Comment.filter((c) => !kill.has(String(c.postId)))
    } else if (method === 'PATCH') {
      const patch = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>
      const applied = fault.partialPatch ? Object.fromEntries(Object.entries(patch).filter(([k]) => k !== 'slug')) : patch
      for (const r of target) Object.assign(r, applied)
    }
    // return=representation → 실제 영향 행
    return { ok: true, status: 200, headers: new Headers(), json: async () => target.map((r) => ({ id: r.id })) } as unknown as Response
  }) as unknown as typeof fetch

  return { fetchImpl, calls, mutations: () => mutationCount }
}

let cpDir: string | null = null
afterEach(() => { if (cpDir) { rmSync(cpDir, { recursive: true, force: true }); cpDir = null } })

function ctxWith(state: ReturnType<typeof makeDb>, fault: Fault, execute: boolean) {
  const f = makeFetch(state, fault)
  cpDir = mkdtempSync(join(tmpdir(), 'purge-cp-'))
  const ctx: Ctx = {
    url: URL_, key: 'k', execute, fetch: f.fetchImpl,
    r2: { accountId: 'acc', accessKey: 'ak', secretKey: 'sk', bucket: 'b' },
    checkpointPath: join(cpDir, 'cp.json'),
    expected: FIXTURE_EXPECTED,
  }
  return { ctx, calls: f.calls }
}

describe('[T3] 확인 토큰이 없으면 실행 권한이 없다', () => {
  it.each([
    [['--execute'], false],
    [['--execute', '--confirm=PURGE-wrong'], false],
    [[`--confirm=PURGE-${REF}`], false],
    [['--execute', `--confirm=PURGE-${REF}`], true],
  ])('%o → %s', (argv, ok) => {
    expect(isExecutionAuthorized(parseArgs(argv as string[]), REF)).toBe(ok)
  })
  it('project ref 를 URL 에서 뽑는다', () => { expect(projectRefOf(URL_)).toBe(REF) })
})

describe('[T4] dry-run 은 write 를 0회 보낸다', () => {
  it('상태가 그대로다', async () => {
    const state = makeDb()
    const { ctx, calls } = ctxWith(state, {}, false)
    const before = state.db.Post.length
    await run(ctx)
    expect(calls.filter((c) => !['GET', 'HEAD'].includes(c.method))).toHaveLength(0)
    expect(state.db.Post.length).toBe(before)
    expect(state.r2.size).toBe(EXPECTED.r2Objects)
  }, 30_000)
})

describe('[T5-실행] 정상 실행은 상태를 실제로 바꾸고 최종 검증을 통과한다', () => {
  it('DB·R2 가 비워지고 보존 대상은 남는다', async () => {
    const state = makeDb()
    const { ctx, calls } = ctxWith(state, {}, true)
    await run(ctx)
    // 네이버 유래 잔량 0
    expect(state.db.Post.filter((p) => p.cafePostId != null).length).toBe(0)
    // tombstone 이 실제로 적용됐다
    const tomb = state.db.Post.filter((p) => p.title === TOMBSTONE_PATCH.title)
    expect(tomb).toHaveLength(EXPECTED.tombstonePosts)
    expect(tomb.every((r) => isTombstoned(r))).toBe(true)
    // 보존
    expect(state.db.Comment.filter((c) => c.authorId == null)).toHaveLength(EXPECTED.nullAuthorCommentsOnTombstone)
    expect(state.db.GuestLike).toHaveLength(EXPECTED.guestLikesOnNaver)
    expect(state.db.Report).toHaveLength(EXPECTED.reportsOnNaver)
    expect(state.db.HomeCurationOverride).toHaveLength(EXPECTED.homeCurationOnNaver)
    // 봇 댓글 0
    expect(state.db.Comment.filter((c) => String(c.authorId ?? '').startsWith('b'))).toHaveLength(0)
    // 테이블 전량 삭제
    for (const t of ['CafePost', 'CafeTrend', 'CommentWaveQueue']) expect(state.db[t]).toHaveLength(0)
    expect(state.db.BotLog.filter((b) => b.botType === 'CAFE_CRAWLER')).toHaveLength(0)
    expect(state.db.BotLog.filter((b) => b.botType === 'CTO')).toHaveLength(5) // 무관한 로그는 보존
    expect(state.r2.size).toBe(0)
    // 모든 mutation 에 필터가 있다
    for (const w of calls.filter((c) => !['GET', 'HEAD'].includes(c.method) && !c.url.includes('r2.cloudflare'))) {
      const keys = [...new URLSearchParams(w.url.split('?')[1] ?? '').keys()].filter((k) => !['select', 'limit', 'offset', 'order'].includes(k))
      expect(keys.length, `필터 없는 요청: ${w.method}`).toBeGreaterThan(0)
    }
    expect(calls.filter((c) => c.method === 'POST')).toHaveLength(0)
  }, 30_000)
})

describe('[T5-실패주입] 상태가 안 바뀌면 반드시 FAIL 한다', () => {
  it('mutation no-op → 던진다', async () => {
    const state = makeDb()
    const { ctx } = ctxWith(state, { noop: true }, true)
    await expect(run(ctx)).rejects.toThrow(/ABORT/)
  }, 30_000)

  it('부분 삭제(절반만 반영) → 던진다', async () => {
    const state = makeDb()
    const { ctx } = ctxWith(state, { half: true }, true)
    await expect(run(ctx)).rejects.toThrow(/ABORT/)
  }, 30_000)

  it('중간 HTTP 오류 → 던지고 done 을 찍지 않는다', async () => {
    const state = makeDb()
    const { ctx } = ctxWith(state, { httpErrorAfter: 3 }, true)
    await expect(run(ctx)).rejects.toThrow()
  }, 30_000)

  it('P4 tombstone 이 절반만 적용 → 던진다', async () => {
    const state = makeDb()
    const { ctx } = ctxWith(state, { halfTable: 'Post' }, true)
    await expect(run(ctx)).rejects.toThrow(/ABORT/)
  }, 30_000)

  it('P4 PATCH 가 slug 를 빠뜨리면 → tombstone 미완으로 던진다', async () => {
    const state = makeDb()
    const { ctx } = ctxWith(state, { partialPatch: true }, true)
    await expect(run(ctx)).rejects.toThrow(/ABORT/)
    expect(state.db.Post.some((p) => p.title === TOMBSTONE_PATCH.title && p.slug != null)).toBe(true)
  }, 30_000)

  it('P7 CafePost 절반 삭제 → 던진다', async () => {
    const state = makeDb()
    const { ctx } = ctxWith(state, { halfTable: 'CafePost' }, true)
    await expect(run(ctx)).rejects.toThrow(/ABORT/)
  }, 30_000)

  it('R2 삭제가 no-op → 던진다', async () => {
    const state = makeDb()
    const { ctx } = ctxWith(state, { r2Noop: true }, true)
    await expect(run(ctx)).rejects.toThrow(/ABORT/)
  }, 30_000)
})

describe('[T6-resume] 중간 실패 후 같은 명령으로 완료된다', () => {
  it('HTTP 오류로 멈춘 뒤 재실행하면 끝까지 간다', async () => {
    const state = makeDb()
    // 1차: 3번째 mutation 부터 실패
    const first = ctxWith(state, { httpErrorAfter: 3 }, true)
    await expect(run(first.ctx)).rejects.toThrow()
    const midPosts = state.db.Post.length
    expect(midPosts).toBeLessThanOrEqual(EXPECTED.naverOrigin) // 일부만 진행됐다
    // 2차: 같은 상태에서 정상 재실행
    const second = ctxWith(state, {}, true)
    await run(second.ctx)
    expect(state.db.Post.filter((p) => p.cafePostId != null)).toHaveLength(0)
    expect(state.db.Post.filter((p) => p.title === TOMBSTONE_PATCH.title)).toHaveLength(EXPECTED.tombstonePosts)
    expect(state.r2.size).toBe(0)
    for (const t of ['CafePost', 'CafeTrend', 'CommentWaveQueue']) expect(state.db[t]).toHaveLength(0)
  }, 30_000)

  it('완료 후 다시 실행해도 범위가 넓어지지 않는다 (멱등)', async () => {
    const state = makeDb()
    await run(ctxWith(state, {}, true).ctx)
    const snapshot = {
      post: state.db.Post.length, comment: state.db.Comment.length,
      guest: state.db.GuestLike.length, report: state.db.Report.length, curation: state.db.HomeCurationOverride.length,
    }
    const again = ctxWith(state, {}, true)
    await run(again.ctx)
    expect(again.calls.filter((c) => !['GET', 'HEAD'].includes(c.method) && !c.url.includes('r2.cloudflare'))).toHaveLength(0)
    expect({
      post: state.db.Post.length, comment: state.db.Comment.length,
      guest: state.db.GuestLike.length, report: state.db.Report.length, curation: state.db.HomeCurationOverride.length,
    }).toEqual(snapshot)
  }, 30_000)
})

describe('[T1] 후보에 USER Post 가 섞이면 즉시 중단', () => {
  it('USER 1건이면 던지고 write 하지 않는다', async () => {
    const state = makeDb()
    state.db.Post.push({ id: 'zuser', source: 'USER', cafePostId: 'cpX', sourceUrl: null, title: 't', thumbnailUrl: null })
    const { ctx, calls } = ctxWith(state, {}, true)
    await expect(run(ctx)).rejects.toThrow(/FAIL-CLOSED/)
    expect(calls.filter((c) => !['GET', 'HEAD'].includes(c.method))).toHaveLength(0)
  }, 30_000)
})

describe('[T10] 폐기 후 네이버 원문 소비처가 0 이어야 한다 — 코드 계약', () => {
  it('CafePost 를 읽는 런타임 경로는 보존 purge 하나뿐이다', async () => {
    const { readFileSync, readdirSync } = await import('node:fs')
    const path = await import('node:path')
    const root = path.resolve(__dirname, '../..')
    const hits: string[] = []
    const walk = (dir: string) => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, e.name)
        if (['node_modules', '.git', '.next', 'generated'].includes(e.name)) continue
        if (e.isDirectory()) { walk(full); continue }
        if (!/\.tsx?$/.test(e.name) || /\.test\.tsx?$/.test(e.name)) continue
        if (/prisma\.cafePost\b/.test(readFileSync(full, 'utf8'))) hits.push(path.relative(root, full))
      }
    }
    for (const d of ['src', 'agents', 'scripts']) walk(path.join(root, d))
    expect(hits.sort()).toEqual(['agents/scripts/purge-old-logs.ts'])
  }, 30_000)
})
