/**
 * 자동 승격 → 일자리 캐시 연결 계약.
 *
 * ── 왜 필요한가 ──────────────────────────────────────────────
 *  승격은 일자리 카드에 **보인다**: `promotionLevel === 'HOT'` → `JobCardItem.isUrgent`
 *  → `JobCard` 의 급구 배지. 그런데 `checkAndPromotePost` 는 `revalidatePath('/best')` 만
 *  부르고 일자리 태그를 건드리지 않았다 — 지역 목록은 `JOBS_LIST_TAG` 로만 갱신되므로
 *  **승격이 반영되지 않았다.**
 *
 * ── 🔴 실행 문맥 ─────────────────────────────────────────────
 *  두 함수 모두 호출부가 `void fn(...).catch(...)` 다. Server Action 이 반환한 뒤
 *  실행될 수 있어 `updateTag` 는 던지고, 그 예외를 호출부 `.catch` 가 삼킨다.
 *  그래서 `revalidateTag(tag, 'max')` 를 쓰는 별도 헬퍼를 쓴다.
 *
 * 🔴 점수 계산·임계값·승격/강등 조건·`hotPromotedAt`·알림 정책은 **바꾸지 않았다.**
 *    이 테스트가 그 보존도 함께 확인한다.
 *
 * ⚠️ 증명 범위: 어떤 무효화 API 를 어떤 태그로 부르는가.
 *    Vercel 이 캐시를 실제로 지웠는지는 런타임 관측 없이 확인할 수 없다.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const revalidateTag = vi.fn()
const updateTag = vi.fn()
const revalidatePath = vi.fn()
vi.mock('next/cache', () => ({
  revalidateTag: (t: string, p?: string) => revalidateTag(t, p),
  updateTag: (t: string) => updateTag(t),
  revalidatePath: (p: string) => revalidatePath(p),
  unstable_cache: (fn: (...a: unknown[]) => unknown) => fn,
}))

const db = {
  post: null as Record<string, unknown> | null,
  posts: [] as Record<string, unknown>[],
  boardConfig: { hotThreshold: 5, fameThreshold: 20 } as Record<string, unknown> | null,
  updateThrows: false,
  txThrows: false,
  updateArgs: [] as unknown[],
  notifyCount: 0,
}
vi.mock('@/lib/prisma', () => ({
  prisma: {
    post: {
      findUnique: async () => db.post,
      findMany: async () => db.posts,
      update: (args: unknown) => {
        db.updateArgs.push(args)
        if (db.updateThrows) return Promise.reject(new Error('DB write failed'))
        return Promise.resolve({})
      },
    },
    boardConfig: { findUnique: () => ({ catch: async () => db.boardConfig, then: (r: (v: unknown) => void) => r(db.boardConfig) }) },
    notification: { create: () => ({ catch: async () => { db.notifyCount++ } }), createMany: () => ({ catch: async () => { db.notifyCount++ } }) },
    $transaction: async (ops: unknown[]) => {
      if (db.txThrows) throw new Error('DB write failed')
      return Promise.all(ops)
    },
  },
}))

import { checkAndPromotePost, retroactivePromotionUpdate } from '@/lib/actions/promotion'
import { JOBS_LIST_TAG, HOME_JOBS_TAG, JOB_DETAIL_TAG, jobDetailCacheTag } from '@/lib/cache/job-cache'

const tagged = () => revalidateTag.mock.calls.map((c) => c[0] as string)

beforeEach(() => {
  vi.clearAllMocks()
  Object.assign(db, {
    post: { promotionLevel: 'NORMAL', authorId: 'u1', hotPromotedAt: null },
    posts: [],
    boardConfig: { hotThreshold: 5, fameThreshold: 20 },
    updateThrows: false, txThrows: false, notifyCount: 0,
  })
  db.updateArgs.length = 0
})

/* ── 단건 ─────────────────────────────────────────────────── */
describe('🔴 단건 자동 재계산 — JOB', () => {
  it('레벨이 바뀌면 목록·홈·해당 공고 태그를 무효화한다', async () => {
    await checkAndPromotePost('job-1', 'JOB' as never, 10, 0)   // 10 ≥ hot 5 → HOT
    expect(tagged()).toEqual(expect.arrayContaining([JOBS_LIST_TAG, HOME_JOBS_TAG, jobDetailCacheTag('job-1')]))
  })

  it('🔴 detached 문맥이므로 updateTag 가 아니라 revalidateTag(tag, "max") 를 쓴다', async () => {
    await checkAndPromotePost('job-1', 'JOB' as never, 10, 0)
    expect(updateTag, 'updateTag 는 Server Action 밖에서 던진다').not.toHaveBeenCalled()
    expect(revalidateTag.mock.calls.every((c) => c[1] === 'max')).toBe(true)
  })

  it('레벨이 그대로면 무효화하지 않는다', async () => {
    db.post = { promotionLevel: 'HOT', authorId: 'u1', hotPromotedAt: new Date() }
    await checkAndPromotePost('job-1', 'JOB' as never, 10, 0)   // 이미 HOT
    expect(revalidateTag).not.toHaveBeenCalled()
    expect(db.updateArgs).toHaveLength(0)
  })

  it('글이 없으면 무효화하지 않는다', async () => {
    db.post = null
    await checkAndPromotePost('job-1', 'JOB' as never, 10, 0)
    expect(revalidateTag).not.toHaveBeenCalled()
  })

  it('🔴 DB 쓰기가 실패하면 무효화하지 않는다', async () => {
    db.updateThrows = true
    await expect(checkAndPromotePost('job-1', 'JOB' as never, 10, 0)).rejects.toThrow('DB write failed')
    expect(revalidateTag).not.toHaveBeenCalled()
  })

  it('sitemap 태그는 건드리지 않는다 — 승격은 status 를 바꾸지 않는다', async () => {
    await checkAndPromotePost('job-1', 'JOB' as never, 10, 0)
    expect(tagged()).not.toContain('sitemap-posts')
  })
})

describe('단건 — 커뮤니티(JOB 아님) 동작 보존', () => {
  it('커뮤니티 글은 일자리 태그를 건드리지 않는다', async () => {
    await checkAndPromotePost('post-1', 'STORY' as never, 10, 0)
    expect(revalidateTag).not.toHaveBeenCalled()
  })

  it('커뮤니티 글도 /best 경로 무효화는 그대로다', async () => {
    await checkAndPromotePost('post-1', 'STORY' as never, 10, 0)
    expect(revalidatePath).toHaveBeenCalledWith('/best')
  })

  it('승격 자체(레벨 계산·DB 반영)는 그대로 일어난다', async () => {
    await checkAndPromotePost('post-1', 'STORY' as never, 25, 0)  // 25 ≥ fame 20
    const data = (db.updateArgs[0] as { data: { promotionLevel: string; hotPromotedAt?: Date } }).data
    expect(data.promotionLevel).toBe('HALL_OF_FAME')
    expect(data.hotPromotedAt, '최초 달성이면 기록한다 — 기존 규칙').toBeInstanceOf(Date)
  })

  it('🔴 hotPromotedAt 은 이미 있으면 덮어쓰지 않는다 (불변성 보존)', async () => {
    db.post = { promotionLevel: 'NORMAL', authorId: 'u1', hotPromotedAt: new Date('2026-01-01') }
    await checkAndPromotePost('post-1', 'STORY' as never, 25, 0)
    const data = (db.updateArgs[0] as { data: Record<string, unknown> }).data
    expect('hotPromotedAt' in data).toBe(false)
  })

  it('🔴 강등(NORMAL 로 내려감)도 hotPromotedAt 을 건드리지 않는다', async () => {
    db.post = { promotionLevel: 'HOT', authorId: 'u1', hotPromotedAt: new Date('2026-01-01') }
    await checkAndPromotePost('post-1', 'STORY' as never, 0, 0)
    const data = (db.updateArgs[0] as { data: Record<string, unknown> }).data
    expect(data.promotionLevel).toBe('NORMAL')
    expect('hotPromotedAt' in data).toBe(false)
  })
})

/* ── 일괄 ─────────────────────────────────────────────────── */
describe('🔴 일괄 재계산', () => {
  const posts = (n: number) =>
    Array.from({ length: n }, (_, i) => ({
      id: `p${i}`, likeCount: 10, commentCount: 0, promotionLevel: 'NORMAL', authorId: 'u1', hotPromotedAt: null,
    }))

  it('JOB 게시판에서 실제 변경이 있으면 목록·홈·전역 상세 태그를 무효화한다', async () => {
    db.posts = posts(3)
    const r = await retroactivePromotionUpdate('JOB' as never, 5, 20)
    expect(r.updated).toBe(3)
    expect(tagged()).toEqual(expect.arrayContaining([JOBS_LIST_TAG, HOME_JOBS_TAG, JOB_DETAIL_TAG]))
    expect(revalidateTag.mock.calls.every((c) => c[1] === 'max')).toBe(true)
  })

  it('바뀔 글이 없으면 무효화하지 않는다', async () => {
    db.posts = posts(2).map((p) => ({ ...p, promotionLevel: 'HOT' }))
    const r = await retroactivePromotionUpdate('JOB' as never, 5, 20)
    expect(r.updated).toBe(0)
    expect(revalidateTag).not.toHaveBeenCalled()
  })

  it('🔴 트랜잭션이 실패하면 무효화하지 않는다', async () => {
    db.posts = posts(2)
    db.txThrows = true
    await expect(retroactivePromotionUpdate('JOB' as never, 5, 20)).rejects.toThrow('DB write failed')
    expect(revalidateTag).not.toHaveBeenCalled()
  })

  it('커뮤니티 게시판 일괄은 일자리 태그를 건드리지 않는다', async () => {
    db.posts = posts(3)
    await retroactivePromotionUpdate('STORY' as never, 5, 20)
    expect(revalidateTag).not.toHaveBeenCalled()
    expect(revalidatePath).toHaveBeenCalledWith('/best')
  })
})

/* ── 연결이 조용히 사라지지 않는다 ────────────────────────── */
describe('🔴 무효화 실패를 삼키지 않는다', () => {
  it('promotion.ts 는 무효화를 try/catch 로 감싸지 않는다', async () => {
    const { readFileSync } = await import('node:fs')
    const src = readFileSync('src/lib/actions/promotion.ts', 'utf-8')
    expect(src).toMatch(/if \(boardType === 'JOB'\) revalidateJobPromotion\(postId\)/)
    expect(src).toMatch(/if \(boardType === 'JOB'\) revalidateJobPromotionBulk\(\)/)
    expect(src).not.toMatch(/try \{[\s\S]{0,120}revalidateJobPromotion/)
  })
})
