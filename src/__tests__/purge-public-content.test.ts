/**
 * 공개 콘텐츠 영구 삭제 — **실패 경로** 테스트.
 *
 * 이 도구에는 롤백이 없다. hard delete 는 되돌릴 수 없다.
 * 그래서 "잘 지워지는가"보다 **"지우면 안 될 때 멈추는가"**를 더 많이 본다.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  parseCsv, toPurgeRows, buildPlan, detectDrift, assertCsvIntegrity,
  assertCooWriteAuthority, classifyRunState, fingerprint, tag,
  EXPECTED_TOTAL, EXPECTED_ORIGIN_COUNTS, EXPECTED_PRESERVE_TOTAL,
  type PurgeRow, type LiveRow,
} from '@/lib/purge/public-content-plan'
import {
  planR2Deletion, toObjectKey, extractImageUrls, classifyHead, classifyDelete,
  R2_PUBLIC_HOSTS,
} from '@/lib/purge/r2-keys'
import {
  executePurge, PurgeAbortError,
  type PurgeTx, type TransactionRunner, type ExpectedCounts,
} from '@/lib/purge/public-content-exec'

const CSV_PATH = resolve(process.cwd(), 'docs/operations/data/2026-09-14-public-content-purge.csv')
const RAW = readFileSync(CSV_PATH, 'utf8')
const ROWS = toPurgeRows(parseCsv(RAW))

// ── 확정 CSV 계약 ─────────────────────────────────────────────
describe('확정 CSV 계약', () => {
  it('SHA-256 이 코드에 박힌 값과 같다', () => {
    expect(() => assertCsvIntegrity(RAW)).not.toThrow()
  })

  it('한 글자만 바뀌어도 ABORT 한다', () => {
    expect(() => assertCsvIntegrity(RAW + ' ')).toThrow(/변조/)
  })

  it('628행이고 전건 PUBLISHED 기대값이다', () => {
    expect(ROWS).toHaveLength(EXPECTED_TOTAL)
    expect(ROWS.every((r) => r.expectedStatus === 'PUBLISHED')).toBe(true)
  })

  it('역사적 출처 분해가 기대와 정확히 같다', () => {
    const got: Record<string, number> = {}
    for (const r of ROWS) got[r.originAction] = (got[r.originAction] ?? 0) + 1
    expect(got).toEqual(EXPECTED_ORIGIN_COUNTS)
    expect(Object.values(EXPECTED_ORIGIN_COUNTS).reduce((a, b) => a + b, 0)).toBe(EXPECTED_TOTAL)
  })

  it('ID 중복이 없다', () => {
    expect(new Set(ROWS.map((r) => r.id)).size).toBe(EXPECTED_TOTAL)
  })

  it('실제 CSV 로 세운 계획에 이슈가 0건이다', () => {
    expect(buildPlan(ROWS).issues).toEqual([])
  })
})

// ── 후보 누락·중복 ────────────────────────────────────────────
describe('후보 누락·중복', () => {
  it('한 건이 빠지면 ROW_COUNT 로 잡는다', () => {
    const issues = buildPlan(ROWS.slice(1)).issues
    expect(issues.some((i) => i.code === 'ROW_COUNT')).toBe(true)
  })

  it('중복이 섞이면 DUPLICATE_ID 로 잡는다', () => {
    const dup = [...ROWS.slice(0, EXPECTED_TOTAL - 1), ROWS[0]]
    const issues = buildPlan(dup).issues
    expect(issues.some((i) => i.code === 'DUPLICATE_ID')).toBe(true)
  })

  it('출처 분해가 어긋나면 ORIGIN_COUNT 로 잡는다', () => {
    const bent = ROWS.map((r, i) => (i === 0 ? { ...r, originAction: 'KEEP_NOINDEX' } : r))
    expect(buildPlan(bent).issues.some((i) => i.code === 'ORIGIN_COUNT')).toBe(true)
  })

  it('모르는 조치명이 들어오면 잡는다', () => {
    const bent = ROWS.map((r, i) => (i === 0 ? { ...r, originAction: 'DELETE_EVERYTHING' } : r))
    expect(buildPlan(bent).issues.some((i) => i.code === 'UNKNOWN_ORIGIN_ACTION')).toBe(true)
  })
})

// ── 보존 대상 혼입 ────────────────────────────────────────────
describe('보호 대상 혼입', () => {
  const preserve = Array.from({ length: EXPECTED_PRESERVE_TOTAL }, (_, i) => `keep-${i}`)

  it('보존 경계와 겹치지 않으면 통과한다', () => {
    expect(buildPlan(ROWS, preserve).issues).toEqual([])
  })

  it('보존 대상이 후보에 섞이면 PRESERVE_OVERLAP 으로 잡는다', () => {
    const withTarget = [...preserve.slice(1), ROWS[0].id]
    const issues = buildPlan(ROWS, withTarget).issues
    expect(issues.some((i) => i.code === 'PRESERVE_OVERLAP')).toBe(true)
  })

  it('보존 대상 수가 줄면 PRESERVE_COUNT 로 잡는다', () => {
    const issues = buildPlan(ROWS, preserve.slice(1)).issues
    expect(issues.some((i) => i.code === 'PRESERVE_COUNT')).toBe(true)
  })
})

// ── 실행 직전 drift ───────────────────────────────────────────
const liveOf = (r: PurgeRow, over: Partial<LiveRow> = {}): LiveRow => ({
  id: r.id, boardType: r.boardType, status: 'PUBLISHED', titleSha256_12: r.titleSha256_12,
  hasRealAuthor: false, hasRealComment: false, hasGuestComment: false, ...over,
})
const SOME = ROWS.slice(0, 5)

describe('실행 직전 drift', () => {
  it('전건 일치면 이슈 0 이고 전부 지울 수 있다', () => {
    const d = detectDrift(SOME, SOME.map((r) => liveOf(r)))
    expect(d.issues).toEqual([])
    expect(d.deletable).toHaveLength(5)
    expect(d.protectedExclusions).toEqual([])
  })

  it('응답에서 한 건이 빠지면 MISSING·LIVE_COUNT 로 잡는다', () => {
    const d = detectDrift(SOME, SOME.slice(1).map((r) => liveOf(r)))
    expect(d.issues.map((i) => i.code)).toContain('MISSING')
    expect(d.issues.map((i) => i.code)).toContain('LIVE_COUNT')
  })

  it('응답에 없는 글이 섞이면 LIVE_EXTRA 로 잡는다', () => {
    const live = [...SOME.map((r) => liveOf(r)), liveOf({ ...SOME[0], id: 'stranger' })]
    expect(detectDrift(SOME, live).issues.some((i) => i.code === 'LIVE_EXTRA')).toBe(true)
  })

  it('중복 응답이면 LIVE_DUPLICATE 로 잡는다', () => {
    const live = [...SOME.map((r) => liveOf(r)), liveOf(SOME[0])]
    expect(detectDrift(SOME, live).issues.some((i) => i.code === 'LIVE_DUPLICATE')).toBe(true)
  })

  it('status 가 바뀌었으면 지우지 않는다', () => {
    const live = SOME.map((r, i) => liveOf(r, i === 0 ? { status: 'DELETED' } : {}))
    const d = detectDrift(SOME, live)
    expect(d.issues.some((i) => i.code === 'DRIFT_STATUS')).toBe(true)
    expect(d.deletable).toHaveLength(4)
  })

  it('boardType 이 바뀌었으면 지우지 않는다', () => {
    const live = SOME.map((r, i) => liveOf(r, i === 0 ? { boardType: 'NOTICE' } : {}))
    expect(detectDrift(SOME, live).issues.some((i) => i.code === 'DRIFT_BOARD_TYPE')).toBe(true)
  })

  it('제목이 바뀌었으면 DRIFT_TITLE 로 잡는다', () => {
    const live = SOME.map((r, i) => liveOf(r, i === 0 ? { titleSha256_12: 'deadbeefcafe' } : {}))
    expect(detectDrift(SOME, live).issues.some((i) => i.code === 'DRIFT_TITLE')).toBe(true)
  })
})

// ── 실행 직전 사람 흔적 ───────────────────────────────────────
describe('실행 직전 사람 흔적이 생기면 그 글만 빠진다', () => {
  it('실회원 댓글이 새로 달린 글은 자동 제외된다 — ABORT 가 아니다', () => {
    const live = SOME.map((r, i) => liveOf(r, i === 2 ? { hasRealComment: true } : {}))
    const d = detectDrift(SOME, live)
    expect(d.issues).toEqual([])
    expect(d.protectedExclusions).toEqual([SOME[2].id])
    expect(d.deletable).toHaveLength(4)
    expect(d.deletable).not.toContain(SOME[2].id)
  })

  it('실회원이 쓴 글로 바뀌었으면 제외된다', () => {
    const live = SOME.map((r, i) => liveOf(r, i === 0 ? { hasRealAuthor: true } : {}))
    expect(detectDrift(SOME, live).protectedExclusions).toEqual([SOME[0].id])
  })

  it('게스트 댓글(사람 흔적)도 제외 사유다', () => {
    const live = SOME.map((r, i) => liveOf(r, i === 1 ? { hasGuestComment: true } : {}))
    expect(detectDrift(SOME, live).protectedExclusions).toEqual([SOME[1].id])
  })

  it('여러 건에 흔적이 생겨도 나머지는 계속 지울 수 있다', () => {
    const live = SOME.map((r, i) => liveOf(r, i < 3 ? { hasRealComment: true } : {}))
    const d = detectDrift(SOME, live)
    expect(d.protectedExclusions).toHaveLength(3)
    expect(d.deletable).toHaveLength(2)
  })
})

// ── 로그 위생 ─────────────────────────────────────────────────
describe('로그에 원본 ID 가 남지 않는다', () => {
  it('tag 는 원본 ID 를 담지 않는다', () => {
    const id = ROWS[0].id
    expect(tag(id)).not.toContain(id)
    expect(tag(id)).toBe(`post#${fingerprint(id)}`)
  })

  it('모든 이슈 detail 에 원본 ID 가 없다', () => {
    const ids = new Set(ROWS.map((r) => r.id))
    const bent = [...ROWS.slice(0, EXPECTED_TOTAL - 1), ROWS[0]]
    const live = SOME.map((r, i) => liveOf(r, i === 0 ? { status: 'HIDDEN' } : {}))
    const details = [...buildPlan(bent, [ROWS[0].id]).issues, ...detectDrift(SOME, live).issues]
      .map((i) => i.detail).join(' ')
    for (const id of ids) expect(details).not.toContain(id)
    expect(details.length).toBeGreaterThan(0)
  })
})

// ── COO write 권한 ────────────────────────────────────────────
describe('DB write 는 COO 경로만', () => {
  it('coo: 주체 + canWrite 면 통과', () => {
    expect(() => assertCooWriteAuthority({ agentId: 'coo:content-purge', canWrite: true })).not.toThrow()
  })
  it('주체 미지정이면 거부', () => {
    expect(() => assertCooWriteAuthority({ agentId: '', canWrite: true })).toThrow(/COO/)
  })
  it('COO 가 아니면 거부', () => {
    expect(() => assertCooWriteAuthority({ agentId: 'cto:audit', canWrite: true })).toThrow(/COO/)
  })
  it('canWrite=false 면 거부', () => {
    expect(() => assertCooWriteAuthority({ agentId: 'coo:content-purge', canWrite: false })).toThrow(/canWrite/)
  })
})

// ── 재실행 판정 ───────────────────────────────────────────────
describe('재실행 판정', () => {
  it('전건 남아 있으면 시작 전', () => expect(classifyRunState(628, 628)).toBe('NOT_STARTED'))
  it('전건 사라졌으면 완료', () => expect(classifyRunState(628, 0)).toBe('COMPLETE'))
  it('섞여 있으면 PARTIAL — 자동으로 이어 지우지 않는다', () => {
    expect(classifyRunState(628, 12)).toBe('PARTIAL')
  })
})

// ── R2 ────────────────────────────────────────────────────────
const HOST_A = `https://${R2_PUBLIC_HOSTS[0]}`
const HOST_B = `https://${R2_PUBLIC_HOSTS[1]}`

describe('R2 객체 키', () => {
  it('두 공개 호스트가 같은 키로 정규화된다 — 같은 버킷이기 때문이다', () => {
    expect(toObjectKey(`${HOST_A}/magazine/a.jpg`)).toBe('magazine/a.jpg')
    expect(toObjectKey(`${HOST_B}/magazine/a.jpg`)).toBe('magazine/a.jpg')
  })

  it('우리 버킷이 아니면 null', () => {
    expect(toObjectKey('https://images.unsplash.com/photo-1.jpg')).toBeNull()
    expect(toObjectKey('not a url')).toBeNull()
  })

  it('썸네일과 본문 이미지를 모두 뽑는다', () => {
    const urls = extractImageUrls(`${HOST_A}/t.webp`, `본문 ![x](${HOST_A}/b.png) 그리고 링크 https://x.com/page`)
    expect(urls).toContain(`${HOST_A}/t.webp`)
    expect(urls).toContain(`${HOST_A}/b.png`)
    expect(urls).not.toContain('https://x.com/page')
  })
})

describe('R2 공유 객체는 절대 지우지 않는다', () => {
  it('보존 글이 같은 키를 쓰면 shared 로 뺀다', () => {
    const plan = planR2Deletion(
      [{ id: 'd1', thumbnailUrl: `${HOST_A}/shared.jpg`, content: '' }],
      [{ id: 'k1', thumbnailUrl: `${HOST_A}/shared.jpg`, content: '' }],
    )
    expect(plan.shared).toEqual(['shared.jpg'])
    expect(plan.exclusive).toEqual([])
  })

  it('🔴 보존 글이 다른 호스트로 같은 객체를 참조해도 shared 다', () => {
    const plan = planR2Deletion(
      [{ id: 'd1', thumbnailUrl: `${HOST_A}/same.jpg`, content: '' }],
      [{ id: 'k1', thumbnailUrl: `${HOST_B}/same.jpg`, content: '' }],
    )
    expect(plan.shared).toEqual(['same.jpg'])
    expect(plan.exclusive).toEqual([])
  })

  it('삭제 글만 쓰는 키는 exclusive 다', () => {
    const plan = planR2Deletion(
      [{ id: 'd1', thumbnailUrl: `${HOST_A}/only.jpg`, content: '' }],
      [{ id: 'k1', thumbnailUrl: `${HOST_A}/other.jpg`, content: '' }],
    )
    expect(plan.exclusive).toEqual(['only.jpg'])
  })

  it('외부 이미지는 삭제 대상이 아니다', () => {
    const plan = planR2Deletion(
      [{ id: 'd1', thumbnailUrl: 'https://images.unsplash.com/p.jpg', content: '' }],
      [],
    )
    expect(plan.exclusive).toEqual([])
    expect(plan.external).toEqual(['https://images.unsplash.com/p.jpg'])
  })
})

describe('R2 HTTP 상태 판정', () => {
  it('200 은 존재, 404 는 부재', () => {
    expect(classifyHead(200)).toBe('PRESENT')
    expect(classifyHead(404)).toBe('ABSENT')
  })
  it('403·429·5xx 는 "없다"가 아니라 UNCERTAIN 이다', () => {
    for (const s of [403, 429, 500, 502, 503]) expect(classifyHead(s)).toBe('UNCERTAIN')
  })
  it('DELETE 는 204·200 만 성공으로 본다', () => {
    expect(classifyDelete(204)).toBe('DELETED')
    expect(classifyDelete(200)).toBe('DELETED')
    for (const s of [403, 429, 500]) expect(classifyDelete(s)).toBe('UNCERTAIN')
  })
})

// ── 트랜잭션 실행 ─────────────────────────────────────────────
const EXPECTED_ZERO: ExpectedCounts = {
  reportOnComment: 0, reportOnPost: 0, homeCurationOverride: 0,
  notification: 0, commentWaveQueue: 0, userPostWaveQueue: 0, post: 3,
}

function fakeDb(counts: Partial<Record<string, number>>, commentIds: string[] = []) {
  const calls: string[] = []
  const del = (name: string) => async () => {
    calls.push(name)
    return { count: counts[name] ?? 0 }
  }
  const tx: PurgeTx = {
    report: { deleteMany: async (a) => { const k = JSON.stringify(a.where).includes('commentId') ? 'Report(comment)' : 'Report(post)'; calls.push(k); return { count: counts[k] ?? 0 } } },
    homeCurationOverride: { deleteMany: del('HomeCurationOverride') },
    notification: { deleteMany: del('Notification') },
    commentWaveQueue: { deleteMany: del('CommentWaveQueue') },
    userPostWaveQueue: { deleteMany: del('UserPostWaveQueue') },
    comment: { findMany: async () => commentIds.map((id) => ({ id })) },
    post: { deleteMany: del('Post') },
  }
  let committed = false
  const db: TransactionRunner = {
    $transaction: async (fn) => { const r = await fn(tx); committed = true; return r },
  }
  return { db, calls, wasCommitted: () => committed }
}

describe('트랜잭션 실행', () => {
  it('기대값과 전부 맞으면 단계 결과를 돌려준다', async () => {
    const f = fakeDb({ Post: 3 })
    const steps = await executePurge(f.db, ['a', 'b', 'c'], EXPECTED_ZERO, ['STORY'])
    expect(steps.map((s) => s.step)).toEqual([
      'Report(comment)', 'Report(post)', 'HomeCurationOverride',
      'Notification', 'CommentWaveQueue', 'UserPostWaveQueue', 'Post',
    ])
    expect(f.wasCommitted()).toBe(true)
  })

  it('Restrict 를 푸는 단계가 Post 삭제보다 먼저 온다', async () => {
    const f = fakeDb({ Post: 3 }, ['c1'])
    await executePurge(f.db, ['a', 'b', 'c'], { ...EXPECTED_ZERO }, ['STORY'])
    expect(f.calls.indexOf('Report(comment)')).toBeLessThan(f.calls.indexOf('Post'))
    expect(f.calls.indexOf('HomeCurationOverride')).toBeLessThan(f.calls.indexOf('Post'))
  })

  it('Post 영향 행이 기대와 다르면 던지고 커밋하지 않는다', async () => {
    const f = fakeDb({ Post: 2 })
    await expect(executePurge(f.db, ['a', 'b', 'c'], EXPECTED_ZERO, ['STORY']))
      .rejects.toThrow(PurgeAbortError)
    expect(f.wasCommitted()).toBe(false)
  })

  it('CASCADE 선행 단계의 예상량이 어긋나도 멈춘다', async () => {
    const f = fakeDb({ 'Report(post)': 7, Post: 3 })
    await expect(executePurge(f.db, ['a', 'b', 'c'], EXPECTED_ZERO, ['STORY']))
      .rejects.toThrow(/Report\(post\) 영향 행 7/)
    expect(f.wasCommitted()).toBe(false)
  })

  it('FK RESTRICT 로 DB 가 거부하면 그대로 터뜨린다 — 삼키지 않는다', async () => {
    const boom: TransactionRunner = {
      $transaction: async () => { throw new Error('FK violation on Report_postId_fkey') },
    }
    await expect(executePurge(boom, ['a'], { ...EXPECTED_ZERO, post: 1 }, ['STORY']))
      .rejects.toThrow(/FK violation/)
  })

  it('대상이 0건이면 실행하지 않는다', async () => {
    const f = fakeDb({})
    await expect(executePurge(f.db, [], EXPECTED_ZERO, ['STORY'])).rejects.toThrow(/0건/)
    expect(f.wasCommitted()).toBe(false)
  })

  it('DB 가 아무것도 못 지웠으면(no-op) 성공으로 보지 않는다', async () => {
    const f = fakeDb({ Post: 0 })
    await expect(executePurge(f.db, ['a', 'b', 'c'], EXPECTED_ZERO, ['STORY']))
      .rejects.toThrow(/Post 영향 행 0/)
    expect(f.wasCommitted()).toBe(false)
  })

  it('부분 삭제는 커밋되지 않는다 — 전부 아니면 전무다', async () => {
    const f = fakeDb({ Post: 1 })
    await expect(executePurge(f.db, ['a', 'b', 'c'], EXPECTED_ZERO, ['STORY'])).rejects.toThrow()
    expect(f.wasCommitted()).toBe(false)
  })
})
