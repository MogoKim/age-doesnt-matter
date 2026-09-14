/**
 * 공개 시드 글 3건 정합성 — **실패 경로** 테스트.
 *
 * 이 작업의 핵심 약속은 "아무것도 지우지 않는다"이다.
 * 그래서 "잘 숨기는가"보다 **"지우면 안 될 때 멈추는가 / 못 지우게 돼 있는가"**를 본다.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  isSeedAccount, planTargets, checkBaseline, verifyAfter, tag, fingerprint, sha256,
  SEED_PROVIDER_ID, CONFIRM_TOKEN, TRANSACTION_OPTIONS,
  EXPECTED_FROM, EXPECTED_TO, EXPECTED_BASELINE, EXPECTED_AFTER, EXPECTED_REACTIONS,
  assertManifestIntegrity, parseManifest, verifyIdentity, compareReactions, verifyContentUnchanged,
  totalReports,
  type SeedPostRow, type Baseline, type AfterCheck, type LivePostRow, type ReactionCounts,
  type ManifestRow,
} from './seed-post-integrity.js'
import {
  executeSeedHide, assertPatchShape, SeedAbortError, ALLOWED_PATCH_KEYS,
  type SeedTx, type TransactionRunner,
} from './seed-post-integrity-exec.js'

const ROOT = resolve(__dirname, '../..')

// ── 🔴 seed_ 접두사 ───────────────────────────────────────────
describe('🔴 시드 계정 접두사는 `seed_` 다 — `seed-` 가 아니다', () => {
  it('`seed_001` 형태를 시드로 본다', () => {
    for (const id of ['seed_001', 'seed_005', 'seed_007', 'seed_21']) {
      expect(isSeedAccount(id), id).toBe(true)
    }
  })
  it('🔴 하이픈 형태는 시드가 아니다 — 이 오독이 "정합성 해소됨" 오보를 만들었다', () => {
    expect(isSeedAccount('seed-001')).toBe(false)
  })
  it('카카오 숫자 ID·탈퇴 계정·빈 값은 시드가 아니다', () => {
    for (const id of ['3812345678', 'withdrawn_3812345678', '', null, undefined]) {
      expect(isSeedAccount(id as string | null)).toBe(false)
    }
  })
  it('seed 로 시작하는 다른 형태에 속지 않는다', () => {
    for (const id of ['seeder_001', 'seed_abc', 'xseed_001', 'seed_']) {
      expect(isSeedAccount(id), id).toBe(false)
    }
  })
  it('정규식이 전체 일치다', () => {
    expect(SEED_PROVIDER_ID.source).toContain('^')
    expect(SEED_PROVIDER_ID.source).toContain('$')
  })
})

// ── 착수 조건 ────────────────────────────────────────────────
const BASE: Baseline = {
  seedPublishedPosts: 3,
  boardType: { STORY: 2, HUMOR: 1 },
  comments: 9, realMemberComments: 2,
  postLikes: 4, realMemberPostLikes: 0,
  guestLikesOnComments: 1, postViews: 5,
  homeCurationOverrides: 2, postsWithR2Image: 0,
}

describe('착수 조건이 다르면 write 전에 멈춘다', () => {
  it('실측이 기대와 같으면 이슈 0', () => {
    expect(checkBaseline(BASE)).toEqual([])
  })

  const shifts: [keyof Baseline, number][] = [
    ['seedPublishedPosts', 4], ['comments', 10], ['realMemberComments', 1],
    ['postLikes', 5], ['guestLikesOnComments', 0], ['postViews', 6],
    ['homeCurationOverrides', 3],
  ]
  for (const [k, v] of shifts) {
    it(`${k} 가 달라지면 BASELINE_MISMATCH`, () => {
      const issues = checkBaseline({ ...BASE, [k]: v })
      expect(issues.some((i) => i.code === 'BASELINE_MISMATCH')).toBe(true)
    })
  }

  it('🔴 실회원 Post Like 가 생기면 멈춘다 — 전제가 바뀐 것이다', () => {
    expect(checkBaseline({ ...BASE, realMemberPostLikes: 1 })
      .some((i) => i.code === 'BASELINE_MISMATCH')).toBe(true)
  })
  it('🔴 R2 이미지가 생기면 멈춘다 — 이미지 처리 계획이 없다', () => {
    expect(checkBaseline({ ...BASE, postsWithR2Image: 1 })
      .some((i) => i.code === 'BASELINE_MISMATCH')).toBe(true)
  })
  it('boardType 분해가 달라지면 잡는다', () => {
    expect(checkBaseline({ ...BASE, boardType: { STORY: 3 } })
      .some((i) => i.code === 'BASELINE_BOARD_TYPE')).toBe(true)
  })
  it('기대 밖 boardType 이 섞이면 잡는다', () => {
    expect(checkBaseline({ ...BASE, boardType: { STORY: 2, HUMOR: 1, JOB: 1 } })
      .some((i) => i.code === 'BASELINE_BOARD_TYPE')).toBe(true)
  })
})

// ── 대상 판정 ────────────────────────────────────────────────
const row = (over: Partial<SeedPostRow> = {}): SeedPostRow => ({
  id: 'p1', boardType: 'STORY', status: 'PUBLISHED', source: 'USER', providerId: 'seed_001', ...over,
})
const THREE: SeedPostRow[] = [
  row({ id: 'p1', providerId: 'seed_001' }),
  row({ id: 'p2', providerId: 'seed_005' }),
  row({ id: 'p3', providerId: 'seed_007', boardType: 'HUMOR' }),
]

describe('대상 판정은 fail-closed 다', () => {
  it('3건 전부 조건을 만족하면 이슈 0', () => {
    const p = planTargets(THREE)
    expect(p.issues).toEqual([])
    expect(p.targets).toEqual(['p1', 'p2', 'p3'])
  })

  it('🔴 시드가 아닌 작성자가 섞이면 대상에서 빼고 전체를 실패시킨다', () => {
    const p = planTargets([...THREE.slice(0, 2), row({ id: 'p3', providerId: '3812345678' })])
    expect(p.issues.some((i) => i.code === 'NOT_SEED_AUTHOR')).toBe(true)
    expect(p.issues.some((i) => i.code === 'TARGET_COUNT')).toBe(true)
    expect(p.targets).not.toContain('p3')
  })

  it('이미 HIDDEN 이면 대상이 아니다', () => {
    const p = planTargets([...THREE.slice(0, 2), row({ id: 'p3', status: 'HIDDEN' })])
    expect(p.issues.some((i) => i.code === 'UNEXPECTED_STATUS')).toBe(true)
  })
  it('이미 source=BOT 이면 대상이 아니다', () => {
    const p = planTargets([...THREE.slice(0, 2), row({ id: 'p3', source: 'BOT' })])
    expect(p.issues.some((i) => i.code === 'UNEXPECTED_SOURCE')).toBe(true)
  })
  it('중복이 들어오면 잡는다', () => {
    expect(planTargets([...THREE, THREE[0]]).issues.some((i) => i.code === 'DUPLICATE')).toBe(true)
  })
  it('🔴 4건이면 멈춘다 — 3건짜리 작업이다', () => {
    const p = planTargets([...THREE, row({ id: 'p4', providerId: 'seed_002' })])
    expect(p.issues.some((i) => i.code === 'TARGET_COUNT')).toBe(true)
  })
  it('2건이어도 멈춘다', () => {
    expect(planTargets(THREE.slice(0, 2)).issues.some((i) => i.code === 'TARGET_COUNT')).toBe(true)
  })
  it('이슈 detail 에 원본 ID 가 없다', () => {
    const p = planTargets([row({ id: 'secret-id', providerId: 'nope' })])
    const joined = p.issues.map((i) => i.detail).join(' ')
    expect(joined).not.toContain('secret-id')
    expect(tag('secret-id')).toBe(`post#${fingerprint('secret-id')}`)
  })
})

// ── 🔴 구조로 막는 것 ─────────────────────────────────────────
describe('🔴 반응 데이터는 구조적으로 못 건드린다', () => {
  it('트랜잭션 인터페이스에 반응 테이블이 아예 없다', () => {
    const src = readFileSync(resolve(ROOT, 'agents/purge/seed-post-integrity-exec.ts'), 'utf8')
    const iface = src.slice(src.indexOf('export interface SeedTx'), src.indexOf('export interface TransactionOptions'))
    for (const t of ['comment', 'like', 'guestLike', 'postView', 'scrap', 'report']) {
      expect(iface, `SeedTx 에 ${t} 가 있으면 안 된다`).not.toContain(`${t}:`)
    }
  })
  it('Post 삭제 경로가 인터페이스에 없다', () => {
    const src = readFileSync(resolve(ROOT, 'agents/purge/seed-post-integrity-exec.ts'), 'utf8')
    const iface = src.slice(src.indexOf('export interface SeedTx'), src.indexOf('export interface TransactionOptions'))
    expect(iface).toContain('updateMany')
    expect(iface).not.toContain('post: {\n    delete')
    expect(iface.split('post: {')[1]?.split('}')[0] ?? '').not.toContain('deleteMany')
  })
  it('tombstone(제목·본문 비우기) 코드가 없다', () => {
    for (const f of ['seed-post-integrity.ts', 'seed-post-integrity-exec.ts']) {
      const src = readFileSync(resolve(ROOT, `agents/purge/${f}`), 'utf8')
      expect(src, f).not.toContain("title: ''")
      expect(src, f).not.toContain("content: ''")
    }
  })
  it('바꿀 수 있는 필드는 status·source 둘뿐이다', () => {
    expect([...ALLOWED_PATCH_KEYS]).toEqual(['status', 'source'])
    expect(() => assertPatchShape({ status: 'HIDDEN', source: 'BOT' })).not.toThrow()
  })
  it('🔴 title 을 끼워 넣으면 던진다', () => {
    expect(() => assertPatchShape({ status: 'HIDDEN', source: 'BOT', title: '' }))
      .toThrow(/허용되지 않은 필드/)
  })
  it('🔴 content 를 끼워 넣어도 던진다', () => {
    expect(() => assertPatchShape({ status: 'HIDDEN', source: 'BOT', content: '' }))
      .toThrow(/허용되지 않은 필드/)
  })
  it('값이 계약과 다르면 던진다', () => {
    expect(() => assertPatchShape({ status: 'DELETED', source: 'BOT' })).toThrow(/계약과 다르다/)
    expect(() => assertPatchShape({ status: 'HIDDEN', source: 'USER' })).toThrow(/계약과 다르다/)
  })
})

// ── 트랜잭션 ─────────────────────────────────────────────────
type PostRow = Awaited<ReturnType<SeedTx['post']['findMany']>>[number]

/** manifest 와 일치하는 라이브 행을 만든다. `over` 로 특정 인덱스만 어긋뜨린다. */
function postsFrom(over: Record<number, Partial<PostRow>>): PostRow[] {
  return MFX.map((m, i) => ({
    id: m.id, authorId: `author-${m.id}`, boardType: m.boardType,
    status: 'PUBLISHED', source: 'USER',
    title: `제목-${m.id}`, content: `본문-${m.id}`,
    author: { providerId: m.providerId },
    ...(over[i] ?? {}),
  }))
}

function fakeDb(opts: {
  posts?: PostRow[]
  updated?: number
  curation?: number
  throwOnTx?: unknown
  onOptions?: (o: unknown) => void
}) {
  const calls: string[] = []
  let committed = false
  const posts = opts.posts ?? MFX.map((m) => ({
    id: m.id, authorId: `author-${m.id}`, boardType: m.boardType,
    status: 'PUBLISHED', source: 'USER',
    title: `제목-${m.id}`, content: `본문-${m.id}`,
    author: { providerId: m.providerId },
  }))
  const tx: SeedTx = {
    post: {
      findMany: async () => posts,
      updateMany: async (a) => {
        calls.push('post.updateMany')
        const w = a.where as { id: { in: string[] } }
        return { count: opts.updated ?? w.id.in.length }
      },
    },
    homeCurationOverride: {
      deleteMany: async () => { calls.push('curation.deleteMany'); return { count: opts.curation ?? 2 } },
    },
  }
  const db: TransactionRunner = {
    $transaction: async (fn, options) => {
      opts.onOptions?.(options)
      if (opts.throwOnTx !== undefined) throw opts.throwOnTx
      const r = await fn(tx); committed = true; return r
    },
  }
  return { db, calls, wasCommitted: () => committed }
}

/**
 * 트랜잭션 테스트용 manifest fixture.
 * 해시는 fake 가 돌려주는 값과 맞춰 둔다 — 그래야 identity 검사를 통과하고
 * **불일치를 일부러 만들 때만** 실패한다.
 */
const MFX: ManifestRow[] = ['p1', 'p2', 'p3'].map((id, i) => ({
  id,
  providerId: ['seed_001', 'seed_005', 'seed_007'][i],
  authorIdSha256: sha256(`author-${id}`),
  boardType: i === 2 ? 'HUMOR' : 'STORY',
  expectedStatus: 'PUBLISHED',
  expectedSource: 'USER',
  titleSha256: sha256(`제목-${id}`),
  contentSha256: sha256(`본문-${id}`),
}))

const DEPS = { manifest: MFX, expectedCurationDeletes: 2 }

describe('트랜잭션 실행', () => {
  it('정상 경로 — 3건 갱신 · 큐레이션 2건 제거', async () => {
    const f = fakeDb({})
    const r = await executeSeedHide(f.db, DEPS)
    expect(r).toMatchObject({ updated: 3, curationDeleted: 2 })
    expect(r.updatedIds).toEqual(['p1', 'p2', 'p3'])
    expect(f.wasCommitted()).toBe(true)
  })

  it('Serializable 격리 옵션이 전달된다', async () => {
    let seen: unknown = null
    const f = fakeDb({ onOptions: (o) => { seen = o } })
    await executeSeedHide(f.db, DEPS)
    expect(seen).toMatchObject({ isolationLevel: 'Serializable', timeout: 60_000 })
    expect(TRANSACTION_OPTIONS.isolationLevel).toBe('Serializable')
  })

  it('🔴 직렬화 충돌은 재시도하지 않고 ABORT — 커밋 0', async () => {
    const f = fakeDb({ throwOnTx: Object.assign(new Error('write conflict'), { code: 'P2034' }) })
    await expect(executeSeedHide(f.db, DEPS)).rejects.toThrow(/재시도하지 않는다/)
    expect(f.wasCommitted()).toBe(false)
  })

  it('충돌이 아닌 오류는 그대로 올린다', async () => {
    const f = fakeDb({ throwOnTx: new Error('연결이 끊겼다') })
    await expect(executeSeedHide(f.db, DEPS)).rejects.toThrow(/연결이 끊겼다/)
  })

  it('트랜잭션 안에서 status 가 바뀌어 있으면 ABORT', async () => {
    const f = fakeDb({ posts: postsFrom({ 0: { status: 'HIDDEN' } }) })
    await expect(executeSeedHide(f.db, DEPS)).rejects.toThrow(/IDENTITY_STATUS/)
    expect(f.wasCommitted()).toBe(false)
  })

  it('source 가 바뀌어 있어도 ABORT', async () => {
    const f = fakeDb({ posts: postsFrom({ 0: { source: 'BOT' } }) })
    await expect(executeSeedHide(f.db, DEPS)).rejects.toThrow(/IDENTITY_SOURCE/)
  })

  it('대상 일부가 사라졌으면 ABORT', async () => {
    const f = fakeDb({ posts: postsFrom({}).slice(0, 1) })
    await expect(executeSeedHide(f.db, DEPS)).rejects.toThrow(/IDENTITY_MISSING/)
    expect(f.wasCommitted()).toBe(false)
  })

  it('🔴 제목이 바뀌어 있으면 ABORT — 해시로 잡는다', async () => {
    const f = fakeDb({ posts: postsFrom({ 0: { title: '누가 고친 제목' } }) })
    await expect(executeSeedHide(f.db, DEPS)).rejects.toThrow(/IDENTITY_TITLE/)
    expect(f.wasCommitted()).toBe(false)
  })
  it('🔴 본문이 비워져 있어도 ABORT', async () => {
    const f = fakeDb({ posts: postsFrom({ 0: { content: '' } }) })
    await expect(executeSeedHide(f.db, DEPS)).rejects.toThrow(/IDENTITY_CONTENT/)
  })
  it('🔴 작성자가 시드가 아니게 바뀌었으면 ABORT', async () => {
    const f = fakeDb({ posts: postsFrom({ 0: { author: { providerId: '3812345678' } } }) })
    await expect(executeSeedHide(f.db, DEPS)).rejects.toThrow(/IDENTITY_PROVIDER/)
  })
  it('🔴 authorId 가 바뀌었으면 ABORT', async () => {
    const f = fakeDb({ posts: postsFrom({ 0: { authorId: 'someone-else' } }) })
    await expect(executeSeedHide(f.db, DEPS)).rejects.toThrow(/IDENTITY_AUTHOR/)
  })
  it('🔴 boardType 이 바뀌었으면 ABORT', async () => {
    const f = fakeDb({ posts: postsFrom({ 0: { boardType: 'JOB' } }) })
    await expect(executeSeedHide(f.db, DEPS)).rejects.toThrow(/IDENTITY_BOARD_TYPE/)
  })

  it('영향 행이 대상 수와 다르면 ABORT — 커밋 0', async () => {
    const f = fakeDb({ updated: 2 })
    await expect(executeSeedHide(f.db, DEPS)).rejects.toThrow(SeedAbortError)
    expect(f.wasCommitted()).toBe(false)
  })

  it('큐레이션 영향 행이 다르면 ABORT', async () => {
    const f = fakeDb({ curation: 3 })
    await expect(executeSeedHide(f.db, DEPS)).rejects.toThrow(/HomeCurationOverride 영향 행 3/)
    expect(f.wasCommitted()).toBe(false)
  })

  it('대상 0건이면 실행하지 않는다', async () => {
    const f = fakeDb({})
    await expect(executeSeedHide(f.db, { manifest: [], expectedCurationDeletes: 0 }))
      .rejects.toThrow(/0건/)
    expect(f.wasCommitted()).toBe(false)
  })

  it('낙관적 잠금 — where 에 기대 status·source 가 들어간다', async () => {
    let where: unknown = null
    const tx: SeedTx = {
      post: {
        findMany: async () => postsFrom({}),
        updateMany: async (a) => { where = a.where; return { count: 3 } },
      },
      homeCurationOverride: { deleteMany: async () => ({ count: 2 }) },
    }
    await executeSeedHide({ $transaction: async (fn) => fn(tx) }, DEPS)
    expect(where).toMatchObject({ status: EXPECTED_FROM.status, source: EXPECTED_FROM.source })
  })

  it('큐레이션 해제가 갱신보다 먼저다', async () => {
    const f = fakeDb({})
    await executeSeedHide(f.db, DEPS)
    expect(f.calls.indexOf('curation.deleteMany')).toBeLessThan(f.calls.indexOf('post.updateMany'))
  })
})

// ── 사후 검증 (구 5축 검사는 B단계에서 제거 — 아래 "판정 단일화" 블록으로 옮겼다) ──
// 반응은 `compareReactions`(감소만 실패), 본문은 `verifyContentUnchanged`(해시 일치),
// 성공 판정은 `verifyAfter`(HIDDEN/BOT 3 · 공개 0 · 큐레이션 0) — 셋이 각자 한 가지만 본다.

// ── 계약 상수 ────────────────────────────────────────────────
describe('계약 상수', () => {
  it('기대 전이는 PUBLISHED/USER → HIDDEN/BOT 이다', () => {
    expect(EXPECTED_FROM).toEqual({ status: 'PUBLISHED', source: 'USER' })
    expect(EXPECTED_TO).toEqual({ status: 'HIDDEN', source: 'BOT' })
  })
  it('DELETED 로 바꾸지 않는다 — hard delete 도 soft delete 도 아니다', () => {
    expect(EXPECTED_TO.status).not.toBe('DELETED')
  })
  it('🔴 사후 기대값에 절대 총계가 없다 — 관측값으로만 쓴다', () => {
    expect(EXPECTED_AFTER.seedHiddenBot).toBe(EXPECTED_BASELINE.seedPublishedPosts)
    expect(EXPECTED_AFTER).not.toHaveProperty('totalPosts')
    expect(EXPECTED_AFTER).not.toHaveProperty('publishedTotal')
    expect(EXPECTED_AFTER).not.toHaveProperty('hiddenTotal')
  })
  it('확인 토큰이 고정돼 있다', () => {
    expect(CONFIRM_TOKEN).toBe('HIDE-SEED-PUBLIC-POSTS-3')
  })
})

// ── 🔴 확정 manifest — identity 를 fail-closed 로 고정 ─────────
const MANIFEST_RAW = readFileSync(resolve(ROOT, 'docs/operations/data/2026-09-14-seed-post-manifest.csv'), 'utf8')

describe('🔴 확정 manifest 무결성', () => {
  it('SHA-256 이 코드에 박힌 값과 같다', () => {
    expect(() => assertManifestIntegrity(MANIFEST_RAW)).not.toThrow()
  })
  it('한 글자만 바뀌어도 ABORT', () => {
    expect(() => assertManifestIntegrity(MANIFEST_RAW + ' ')).toThrow(/변조/)
  })
  it('3행이고 providerId 3종이 정확히 들어 있다', () => {
    const rows = parseManifest(MANIFEST_RAW)
    expect(rows).toHaveLength(3)
    expect(rows.map((r) => r.providerId).sort()).toEqual(['seed_001', 'seed_005', 'seed_007'])
  })
  it('모든 행이 PUBLISHED/USER 기대값을 갖는다', () => {
    for (const r of parseManifest(MANIFEST_RAW)) {
      expect(r.expectedStatus).toBe('PUBLISHED')
      expect(r.expectedSource).toBe('USER')
    }
  })
  it('title·content·authorId 해시가 64자 hex 다', () => {
    for (const r of parseManifest(MANIFEST_RAW)) {
      for (const h of [r.titleSha256, r.contentSha256, r.authorIdSha256]) {
        expect(h).toMatch(/^[0-9a-f]{64}$/)
      }
    }
  })
  it('boardType 분해가 STORY 2 · HUMOR 1 이다', () => {
    const bt: Record<string, number> = {}
    for (const r of parseManifest(MANIFEST_RAW)) bt[r.boardType] = (bt[r.boardType] ?? 0) + 1
    expect(bt).toEqual({ STORY: 2, HUMOR: 1 })
  })
})

// ── 🔴 트랜잭션 내 identity 전수 재확인 ───────────────────────
describe('🔴 identity 8축을 트랜잭션 안에서 다시 본다', () => {
  const M = parseManifest(MANIFEST_RAW)
  const liveOf = (m: typeof M[number], over: Partial<LivePostRow> = {}): LivePostRow => ({
    id: m.id, authorId: 'author-x', providerId: m.providerId, boardType: m.boardType,
    status: m.expectedStatus, source: m.expectedSource,
    titleSha256: m.titleSha256, contentSha256: m.contentSha256,
    authorIdSha256: m.authorIdSha256, ...over,
  })

  it('전건 일치하면 이슈 0', () => {
    expect(verifyIdentity(M, M.map((m) => liveOf(m)))).toEqual([])
  })

  const axes: [string, Partial<LivePostRow>][] = [
    ['IDENTITY_AUTHOR', { authorIdSha256: 'f'.repeat(64) }],
    ['IDENTITY_PROVIDER', { providerId: 'seed_999' }],
    ['IDENTITY_BOARD_TYPE', { boardType: 'JOB' }],
    ['IDENTITY_STATUS', { status: 'HIDDEN' }],
    ['IDENTITY_SOURCE', { source: 'BOT' }],
    ['IDENTITY_TITLE', { titleSha256: 'a'.repeat(64) }],
    ['IDENTITY_CONTENT', { contentSha256: 'b'.repeat(64) }],
  ]
  for (const [code, over] of axes) {
    it(`${code} 가 어긋나면 잡는다`, () => {
      const live = M.map((m, i) => liveOf(m, i === 0 ? over : {}))
      expect(verifyIdentity(M, live).some((x) => x.code === code), code).toBe(true)
    })
  }

  it('manifest 에 없는 글이 섞이면 잡는다', () => {
    const live = [...M.map((m) => liveOf(m)), liveOf(M[0], { id: 'stranger' })]
    expect(verifyIdentity(M, live).some((x) => x.code === 'IDENTITY_EXTRA')).toBe(true)
  })
  it('manifest 의 글이 안 보이면 잡는다', () => {
    expect(verifyIdentity(M, M.slice(1).map((m) => liveOf(m)))
      .some((x) => x.code === 'IDENTITY_MISSING')).toBe(true)
  })
  it('이슈 detail 에 원본 ID·제목·본문이 없다', () => {
    const live = M.map((m, i) => liveOf(m, i === 0 ? { providerId: 'seed_999' } : {}))
    const joined = verifyIdentity(M, live).map((i) => i.detail).join(' ')
    for (const m of M) {
      expect(joined).not.toContain(m.id)
      expect(joined).not.toContain(m.titleSha256)
      expect(joined).not.toContain(m.contentSha256)
    }
  })
})

// ── 🔴 반응 축 전수 ───────────────────────────────────────────
const FULL: ReactionCounts = {
  comments: 9, realMemberComments: 2,
  postLikes: 4, realMemberPostLikes: 0,
  commentLikes: 0, realMemberCommentLikes: 0,
  guestLikesOnPosts: 0, guestLikesOnComments: 1,
  scraps: 0, realMemberScraps: 0,
  postViews: 5, reports: 0,
}

describe('🔴 반응 축 12개 — 감소는 실패, 증가는 허용', () => {
  it('전후 동일하면 이슈 0', () => {
    expect(compareReactions(FULL, FULL)).toEqual([])
  })

  for (const k of Object.keys(FULL) as (keyof ReactionCounts)[]) {
    it(`${k} 가 줄면 실패한다`, () => {
      const after = { ...FULL, [k]: (FULL[k] as number) - 1 }
      expect(compareReactions(FULL, after).some((i) => i.code === 'REACTION_LOST'), k).toBe(true)
    })
  }

  it('🔴 동시 신규 반응으로 늘어난 것은 허용한다', () => {
    const after = { ...FULL, comments: 10, postLikes: 5, postViews: 40 }
    expect(compareReactions(FULL, after)).toEqual([])
  })
  it('실회원 축이 늘어나는 것도 허용한다', () => {
    expect(compareReactions(FULL, { ...FULL, realMemberComments: 3 })).toEqual([])
  })
  it('여러 축이 동시에 줄면 전부 보고한다', () => {
    const after = { ...FULL, comments: 8, postViews: 4, guestLikesOnComments: 0 }
    expect(compareReactions(FULL, after).filter((i) => i.code === 'REACTION_LOST')).toHaveLength(3)
  })
  it('착수 기대 반응값이 실측과 같다', () => {
    expect(EXPECTED_REACTIONS).toEqual(FULL)
  })
})

// ── 🔴 본문 해시 사후 대조 ────────────────────────────────────
describe('🔴 title·content 는 비어 있는지가 아니라 해시로 본다', () => {
  const M = parseManifest(MANIFEST_RAW)
  const same = M.map((m) => ({ id: m.id, titleSha256: m.titleSha256, contentSha256: m.contentSha256 }))

  it('해시가 그대로면 이슈 0', () => {
    expect(verifyContentUnchanged(M, same)).toEqual([])
  })
  it('🔴 제목이 바뀌면 잡는다 — 비어 있지 않아도 잡힌다', () => {
    const bent = same.map((r, i) => (i === 0 ? { ...r, titleSha256: 'c'.repeat(64) } : r))
    expect(verifyContentUnchanged(M, bent).some((i) => i.code === 'CONTENT_CHANGED')).toBe(true)
  })
  it('🔴 본문이 바뀌면 잡는다', () => {
    const bent = same.map((r, i) => (i === 0 ? { ...r, contentSha256: 'd'.repeat(64) } : r))
    expect(verifyContentUnchanged(M, bent).some((i) => i.code === 'CONTENT_CHANGED')).toBe(true)
  })
  it('빈 문자열로 tombstone 해도 해시가 달라 잡힌다', () => {
    const emptySha = sha256('')
    const bent = same.map((r, i) => (i === 0 ? { ...r, titleSha256: emptySha, contentSha256: emptySha } : r))
    expect(verifyContentUnchanged(M, bent).filter((i) => i.code === 'CONTENT_CHANGED')).toHaveLength(1)
  })
  it('행이 사라지면 잡는다', () => {
    expect(verifyContentUnchanged(M, same.slice(1)).some((i) => i.code === 'CONTENT_MISSING')).toBe(true)
  })
})

// ── 🔴 B단계: 판정 단일화 ─────────────────────────────────────
//
// 이전 `verifyAfter` 는 반응 5축을 **exact equality** 로 또 봤다.
// 그래서 12축 `compareReactions`(감소만 실패)와 **판정이 둘**이 됐고,
// 실행 중 누가 댓글을 달아 9 → 10 이 되면 12축은 통과하는데 5축이 실패했다.
// 반응 판정은 `compareReactions` **하나**여야 한다.
describe('🔴 verifyAfter 에서 반응 exact equality 를 걷어냈다', () => {
  const base: AfterCheck = {
    seedHiddenBot: 3,
    homeCurationOverrides: 0,
    seedPublishedRemaining: 0,
    totalPosts: 3968, publishedTotal: 216, hiddenTotal: 3545,
  }

  it('확정 3건이 HIDDEN/BOT 이고 큐레이션 0 이면 통과', () => {
    expect(verifyAfter(base)).toEqual([])
  })

  it('🔴 전체 Post 절대값이 달라도 실패하지 않는다 — 관측값일 뿐이다', () => {
    // 다른 배치가 글을 쓰거나 지워도 이 작업의 성패와 무관하다.
    expect(verifyAfter({ ...base, totalPosts: 4001 })).toEqual([])
  })
  it('🔴 PUBLISHED·HIDDEN 총계가 달라도 실패하지 않는다', () => {
    expect(verifyAfter({ ...base, publishedTotal: 230, hiddenTotal: 3600 })).toEqual([])
  })

  it('확정 3건이 HIDDEN/BOT 이 아니면 실패한다 — 이게 성공 판정이다', () => {
    expect(verifyAfter({ ...base, seedHiddenBot: 2 }).some((i) => i.code === 'HIDDEN_BOT_COUNT')).toBe(true)
  })
  it('공개 시드 글이 남으면 실패한다', () => {
    expect(verifyAfter({ ...base, seedPublishedRemaining: 1 })
      .some((i) => i.code === 'STILL_PUBLISHED')).toBe(true)
  })
  it('큐레이션이 남으면 실패한다', () => {
    expect(verifyAfter({ ...base, homeCurationOverrides: 1 })
      .some((i) => i.code === 'CURATION_REMAINS')).toBe(true)
  })

  it('🔴 AfterCheck 에 반응 축이 더 이상 없다 — 판정이 하나다', () => {
    const keys = Object.keys(base)
    for (const k of ['comments', 'realMemberComments', 'postLikes',
                     'guestLikesOnComments', 'postViews', 'postsWithEmptyTitleOrContent']) {
      expect(keys, `${k} 는 compareReactions·verifyContentUnchanged 가 본다`).not.toContain(k)
    }
  })

  it('🔴 실행 중 댓글이 늘어난 실행도 전체가 통과한다', () => {
    // verifyAfter(성공 판정) + compareReactions(감소만 실패) 를 합쳐도 이슈 0 이어야 한다.
    const after = { ...FULL, comments: 10, postViews: 12 }
    expect([...verifyAfter(base), ...compareReactions(FULL, after)]).toEqual([])
  })
})

// ── 🔴 Report 는 두 경로의 합집합이다 ─────────────────────────
describe('🔴 Report 는 postId·commentId 두 경로를 합쳐 센다', () => {
  it('글 신고만 있으면 그 수', () => {
    expect(totalReports({ onPosts: 2, onComments: 0 })).toBe(2)
  })
  it('댓글 신고만 있어도 센다 — postId 경로로는 안 잡힌다', () => {
    expect(totalReports({ onPosts: 0, onComments: 3 })).toBe(3)
  })
  it('둘 다 있으면 합이다', () => {
    expect(totalReports({ onPosts: 2, onComments: 3 })).toBe(5)
  })
  it('🔴 댓글 신고가 생겼다 사라지면 감소로 잡힌다', () => {
    const before = { ...FULL, reports: totalReports({ onPosts: 0, onComments: 1 }) }
    const after = { ...FULL, reports: totalReports({ onPosts: 0, onComments: 0 }) }
    expect(compareReactions(before, after).some((i) => i.code === 'REACTION_LOST')).toBe(true)
  })
})
