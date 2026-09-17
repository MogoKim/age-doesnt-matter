/**
 * 캐시 무효화 — **실제 호출** 검증.
 *
 * `cache-scope-contract.test.ts` 는 소스 문자열로 형태를 고정한다.
 * 여기서는 **함수를 실제로 돌려** 어떤 태그가 몇 번 불렸는지 본다.
 *
 * 🔴 **증명 범위**: 호출된 무효화 API 와 인자, 그리고 DB 로 넘어간 쿼리 인자.
 *    **증명하지 않는 것**: Vercel 이 캐시를 실제로 저장·삭제했는지, ISR write 수, 비용.
 *    `unstable_cache` 는 여기서 원본 함수를 그대로 돌려주는 mock 이다.
 *    **운영 글·공고를 수정하거나 삭제하지 않는다.**
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/* ── 감시 대상 ─────────────────────────────────────────────── */
const updateTag = vi.fn()
const revalidateTag = vi.fn()
const revalidatePath = vi.fn()
vi.mock('next/cache', () => ({
  updateTag: (t: string) => updateTag(t),
  revalidateTag: (t: string, p?: string) => revalidateTag(t, p),
  revalidatePath: (p: string) => revalidatePath(p),
  unstable_cache: (fn: (...a: unknown[]) => unknown) => fn,
}))

const redirect = vi.fn((_u?: string) => { throw new Error('NEXT_REDIRECT') })
vi.mock('next/navigation', () => ({ redirect: (u: string) => redirect(u) }))

let sessionUserId: string | null = 'author-1'
vi.mock('@/lib/auth', () => ({ auth: async () => (sessionUserId ? { user: { id: sessionUserId } } : null) }))

let adminCookie: string | undefined
vi.mock('next/headers', () => ({
  cookies: async () => ({ get: () => (adminCookie ? { value: adminCookie } : undefined), set: () => {}, delete: () => {} }),
}))

vi.mock('@/lib/banned-words', () => ({ checkBannedWords: async () => null }))
vi.mock('@/lib/sanitize', () => ({ sanitizeHtml: (s: string) => s, stripHtmlTags: (s: string) => s, plainTextToSafeHtml: (s: string) => s }))
vi.mock('@/lib/summary', () => ({ buildSummary: () => '요약' }))
vi.mock('@/lib/r2', () => ({ deleteFromR2: async () => {} }))
vi.mock('@/lib/actions/promotion', () => ({ checkAndPromotePost: async () => {} }))
vi.mock('@/lib/notify', () => ({ notifyUser: async () => {}, isRealUser: () => true }))

/* ── prisma mock ───────────────────────────────────────────── */
type Row = Record<string, unknown> | null
const db = {
  postFindUnique: null as Row,
  postFindFirst: null as Row,
  updateThrows: false,
  findManyThrows: false,
  countThrows: false,
  findManyArgs: [] as unknown[],
  countArgs: [] as unknown[],
}
/**
 * 모르는 모델·연산도 안전하게 받아내는 관대한 mock.
 * `post` 만 실제 동작을 흉내 내고 나머지는 빈 값을 돌려준다 — 실제 DB 를 쓰지 않는다.
 */
function emptyFor(op: string): unknown {
  if (op === 'findMany' || op === 'groupBy') return []
  if (op === 'count') return 0
  return null
}
const postModel = {
  findUnique: async () => db.postFindUnique,
  findFirst: async () => db.postFindFirst,
  update: async () => { if (db.updateThrows) throw new Error('DB write failed'); return {} },
  updateMany: async () => { if (db.updateThrows) throw new Error('DB write failed'); return { count: 1 } },
  findMany: async (args: unknown) => {
    db.findManyArgs.push(args)
    if (db.findManyThrows) throw new Error('findMany failed')
    return []
  },
  count: async (args: unknown) => {
    db.countArgs.push(args)
    if (db.countThrows) throw new Error('count failed')
    return 0
  },
  groupBy: async () => [],
}
vi.mock('@/lib/prisma', () => ({
  prisma: new Proxy({} as Record<string, unknown>, {
    get: (_t, model: string) => {
      if (model === 'then') return undefined
      if (model === '$transaction') return async (ops: unknown) => (Array.isArray(ops) ? Promise.all(ops) : [])
      if (model === 'post') return postModel
      return new Proxy({}, { get: (_t2, op: string) => async () => emptyFor(op) })
    },
  }),
}))

import { updatePost, deletePost } from '@/lib/actions/posts'
import { adminMovePost } from '@/lib/actions/admin/admin.content'
import { getCachedJobsRegionPage } from '@/lib/queries/posts'
import { postDetailCacheTag } from '@/lib/queries/posts/posts.base'
import { createAdminToken } from '@/lib/admin-auth'

const tags = () => updateTag.mock.calls.map((c) => c[0] as string)
const detailTags = () => tags().filter((t) => t.startsWith('post-detail-'))

function form(over: Record<string, string> = {}) {
  const fd = new FormData()
  fd.set('title', over.title ?? '제목입니다')
  fd.set('content', over.content ?? '본문 내용이 충분히 깁니다')
  fd.set('category', over.category ?? '일상')
  return fd
}

beforeEach(async () => {
  vi.clearAllMocks()
  sessionUserId = 'author-1'
  process.env.ADMIN_JWT_SECRET = 'x'.repeat(40)
  adminCookie = await createAdminToken({ adminId: 'a1', email: 'a@b.com', nickname: '관리자' })
  Object.assign(db, {
    postFindUnique: { authorId: 'author-1', boardType: 'STORY', status: 'PUBLISHED', slug: 'my-slug', thumbnailUrl: null },
    postFindFirst: { boardType: 'STORY', category: '일상', source: 'USER', slug: 'my-slug' },
    updateThrows: false, findManyThrows: false, countThrows: false,
  })
  db.findManyArgs.length = 0
  db.countArgs.length = 0
})
afterEach(() => vi.clearAllMocks())

/* ═══════════════════ ③ 글 상세 — 성공 경로 ═══════════════════ */
describe('🔴 updatePost — 실제 호출', () => {
  it('ID·slug 두 태그를 정확히 부르고 전역 post-detail 은 부르지 않는다', async () => {
    await updatePost('post-1', form())
    expect(detailTags().sort()).toEqual([postDetailCacheTag('post-1'), postDetailCacheTag('my-slug')].sort())
    expect(tags()).not.toContain('post-detail')
  })

  it('slug 가 없으면 ID 태그 하나만 부른다', async () => {
    db.postFindUnique = { ...(db.postFindUnique as object), slug: null } as Row
    await updatePost('post-1', form())
    expect(detailTags()).toEqual([postDetailCacheTag('post-1')])
  })

  it('slug 가 ID 와 같으면 중복 호출하지 않는다', async () => {
    db.postFindUnique = { ...(db.postFindUnique as object), slug: 'post-1' } as Row
    await updatePost('post-1', form())
    expect(detailTags()).toEqual([postDetailCacheTag('post-1')])
  })

  it('post-meta·홈 태그와 경로 무효화 계약이 그대로다', async () => {
    await updatePost('post-1', form())
    expect(tags()).toEqual(expect.arrayContaining(['post-meta', 'home-trending', 'home-stories', 'home-humor']))
    expect(revalidatePath.mock.calls.map((c) => c[0])).toEqual(
      expect.arrayContaining(['/community/stories/post-1', '/community/stories']),
    )
  })
})

describe('🔴 deletePost — 실제 호출', () => {
  const run = async (id = 'post-1') => { try { await deletePost(id) } catch { /* redirect */ } }

  it('ID·slug 두 태그를 부르고 전역 post-detail 은 부르지 않는다', async () => {
    await run()
    expect(detailTags().sort()).toEqual([postDetailCacheTag('post-1'), postDetailCacheTag('my-slug')].sort())
    expect(tags()).not.toContain('post-detail')
  })

  it('slug 가 없으면 ID 태그 하나', async () => {
    db.postFindUnique = { ...(db.postFindUnique as object), slug: null } as Row
    await run()
    expect(detailTags()).toEqual([postDetailCacheTag('post-1')])
  })

  it('목록·홈·sitemap·경로 계약이 그대로다', async () => {
    await run()
    expect(tags()).toEqual(expect.arrayContaining([
      'post-meta', 'home-trending', 'home-stories', 'home-humor', 'home-magazine', 'home-jobs', 'community-board-page',
    ]))
    expect(revalidatePath.mock.calls.map((c) => c[0])).toEqual(
      expect.arrayContaining(['/', '/best', '/search', '/community/stories', '/community/stories/post-1']),
    )
  })
})

describe('🔴 adminMovePost — 실제 호출', () => {
  it('ID·slug 두 태그를 부르고 전역 post-detail 은 부르지 않는다', async () => {
    await adminMovePost('post-1', 'HUMOR' as never, null)
    expect(detailTags().sort()).toEqual([postDetailCacheTag('post-1'), postDetailCacheTag('my-slug')].sort())
    expect(tags()).not.toContain('post-detail')
  })

  it('slug 가 없으면 ID 태그 하나', async () => {
    db.postFindUnique = { ...(db.postFindUnique as object), slug: null } as Row
    db.postFindFirst = { ...(db.postFindFirst as object), slug: null } as Row
    await adminMovePost('post-1', 'HUMOR' as never, null)
    expect(detailTags()).toEqual([postDetailCacheTag('post-1')])
  })

  it('post-meta·sitemap·목록·홈 계약이 그대로다', async () => {
    await adminMovePost('post-1', 'HUMOR' as never, null)
    expect(tags()).toEqual(expect.arrayContaining([
      'post-meta', 'sitemap-posts', 'home-trending', 'home-stories', 'home-humor', 'community-board-page',
    ]))
  })
})

/* ═══════════════════ 실패 시 무효화 0 ═══════════════════ */
describe('🔴 인증·권한 실패 시 무효화 호출 0', () => {
  it('updatePost — 미로그인', async () => {
    sessionUserId = null
    const r = await updatePost('post-1', form())
    expect(r.error).toBe('로그인이 필요합니다')
    expect(updateTag).not.toHaveBeenCalled()
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it('updatePost — 남의 글', async () => {
    db.postFindUnique = { ...(db.postFindUnique as object), authorId: 'someone-else' } as Row
    const r = await updatePost('post-1', form())
    expect(r.error).toBe('본인의 글만 수정할 수 있습니다')
    expect(updateTag).not.toHaveBeenCalled()
  })

  it('deletePost — 미로그인 / 남의 글', async () => {
    sessionUserId = null
    expect((await deletePost('post-1')).error).toBe('로그인이 필요합니다')
    expect(updateTag).not.toHaveBeenCalled()

    sessionUserId = 'author-1'
    db.postFindUnique = { ...(db.postFindUnique as object), authorId: 'someone-else' } as Row
    await deletePost('post-1')
    expect(updateTag).not.toHaveBeenCalled()
  })

  it('adminMovePost — 어드민 쿠키 없음', async () => {
    adminCookie = undefined
    await expect(adminMovePost('post-1', 'HUMOR' as never, null)).rejects.toThrow('관리자 인증이 필요합니다.')
    expect(updateTag).not.toHaveBeenCalled()
    expect(revalidatePath).not.toHaveBeenCalled()
  })
})

describe('🔴 DB 쓰기 실패 시 무효화 호출 0', () => {
  it('updatePost — update 가 던지면 태그·경로 무효화가 없다', async () => {
    db.updateThrows = true
    await expect(updatePost('post-1', form())).rejects.toThrow('DB write failed')
    expect(updateTag).not.toHaveBeenCalled()
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it('adminMovePost — update 가 던지면 무효화가 없다', async () => {
    db.updateThrows = true
    await expect(adminMovePost('post-1', 'HUMOR' as never, null)).rejects.toThrow('DB write failed')
    expect(updateTag).not.toHaveBeenCalled()
  })
})

/* ═══════════════════ ② 지역 일자리 — 실제 호출 ═══════════════════ */
describe('🔴 getCachedJobsRegionPage — 실제 호출', () => {
  it.each(['서울', '경기'])('%s 가 DB 지역 필터와 30건 제한으로 전달된다', async (region) => {
    await getCachedJobsRegionPage(region)
    const args = db.findManyArgs[0] as {
      where: { jobDetail?: { region?: { contains?: string; mode?: string } }; status?: string }
      take?: number
      skip?: number
      orderBy?: unknown
    }
    expect(args.where.jobDetail?.region?.contains).toBe(region)
    expect(args.where.jobDetail?.region?.mode).toBe('insensitive')
    expect(args.where.status).toBe('PUBLISHED')
    expect(args.take, '30건 제한이 유지돼야 한다').toBe(30)
    expect(args.skip ?? 0).toBe(0)
    expect(args.orderBy).toEqual([{ isPinned: 'desc' }, { createdAt: 'desc' }])
  })

  it('지역마다 서로 다른 필터가 나간다 (키가 갈린다는 전제의 근거)', async () => {
    await getCachedJobsRegionPage('서울')
    await getCachedJobsRegionPage('경기')
    const regions = db.findManyArgs.map(
      (a) => (a as { where: { jobDetail?: { region?: { contains?: string } } } }).where.jobDetail?.region?.contains,
    )
    expect(regions).toEqual(['서울', '경기'])
  })

  it('count 에도 같은 지역 조건이 간다', async () => {
    await getCachedJobsRegionPage('서울')
    const args = db.countArgs[0] as { where: { jobDetail?: { region?: { contains?: string } } } }
    expect(args.where.jobDetail?.region?.contains).toBe('서울')
  })

  it('🔴 findMany 실패가 호출자에게 전파된다 (빈 목록으로 삼키지 않는다)', async () => {
    db.findManyThrows = true
    await expect(getCachedJobsRegionPage('서울')).rejects.toThrow('findMany failed')
  })

  it('🔴 count 실패도 호출자에게 전파된다', async () => {
    db.countThrows = true
    await expect(getCachedJobsRegionPage('서울')).rejects.toThrow('count failed')
  })
})
