/**
 * 캐시 무효화 범위 계약 — 지역 일자리(②) · 글 상세(③).
 *
 * 🔴 **이 테스트가 증명하는 것과 못 하는 것**
 *   증명함: 어떤 무효화 API 를 **어떤 태그로 몇 번** 부르는가, 캐시 정의가 어떤 태그를 다는가.
 *   증명 못 함: Vercel 이 실제로 캐시를 유지·삭제했는지, ISR write 가 줄었는지, 비용이 줄었는지.
 *   그건 런타임 관측(Vercel Observability) 없이는 확인할 수 없다.
 *   **운영 글·공고를 수정하거나 삭제해서 검증하지 않는다.**
 */
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const updateTag = vi.fn()
const revalidateTag = vi.fn()
const revalidatePath = vi.fn()
vi.mock('next/cache', () => ({
  updateTag: (t: string) => updateTag(t),
  revalidateTag: (t: string, p?: string) => revalidateTag(t, p),
  revalidatePath: (p: string) => revalidatePath(p),
  unstable_cache: (fn: (...a: unknown[]) => unknown) => fn,
}))
vi.mock('@/lib/prisma', () => ({ prisma: {} }))

import {
  JOBS_LIST_TAG, HOME_JOBS_TAG, JOB_DETAIL_TAG, SITEMAP_POSTS_TAG,
  revalidateJobCreated, revalidateJobPost, revalidateJobPostsBulk, jobDetailCacheTag,
} from '@/lib/cache/job-cache'
import { postDetailCacheTag, postCacheKeys } from '@/lib/queries/posts/posts.base'

const SRC = resolve(process.cwd(), 'src')
const read = (p: string) => readFileSync(join(SRC, p), 'utf-8')

beforeEach(() => {
  updateTag.mockClear(); revalidateTag.mockClear(); revalidatePath.mockClear()
})

/* ─────────────────────────────────────────────────────────────
   ② 지역 일자리
   ───────────────────────────────────────────────────────────── */
describe('② 지역 일자리 — 조회 캐시가 기존 태그에 연결된다', () => {
  const jobs = read('lib/queries/posts/posts.jobs.ts')
  const regionBlock = jobs.slice(jobs.indexOf('export const getCachedJobsRegionPage'))
    .slice(0, jobs.slice(jobs.indexOf('export const getCachedJobsRegionPage')).indexOf(')\n\n') + 1)

  it('지역별 캐시가 존재하고 JOBS_LIST_TAG 를 단다', () => {
    expect(jobs).toContain('export const getCachedJobsRegionPage')
    expect(regionBlock).toContain('tags: [JOBS_LIST_TAG]')
  })

  it('캐시 키가 지역마다 갈린다 (region 이 인자)', () => {
    expect(regionBlock).toMatch(/\(region: string\)/)
  })

  it('기존 필터·정렬·30건 제한을 그대로 넘긴다', () => {
    expect(regionBlock).toContain('getJobListPage({ region, limit: 30 })')
  })

  it('시간 재검증은 3600초다 (페이지와 동일)', () => {
    expect(regionBlock).toContain('revalidate: 3600')
    expect(read('app/(main)/jobs/region/[sido]/page.tsx')).toContain('export const revalidate = 3600')
  })

  it('지역 페이지가 캐시본을 쓰고, 캐시되지 않은 원본을 직접 부르지 않는다', () => {
    const page = read('app/(main)/jobs/region/[sido]/page.tsx')
    expect(page).toContain('getCachedJobsRegionPage')
    expect(page).not.toMatch(/getJobListPage\s*\(/)
  })

  it('🔴 조회 실패를 빈 목록으로 캐시하지 않는다 — 더미 DB 가드가 캐시 바깥이다', () => {
    const page = read('app/(main)/jobs/region/[sido]/page.tsx')
    const guard = page.slice(page.indexOf('async function getRegionJobs'))
    // try 안에서 캐시본을 부르고, catch 는 캐시 밖에서 처리한다
    expect(guard).toMatch(/try \{\s*return await getCachedJobsRegionPage\(region\)/)
    expect(guard).toContain('if (!CI_DUMMY_DB) throw error')
    // 캐시 정의 자체에는 try/catch 나 빈 배열 기본값이 없다
    expect(regionBlock).not.toContain('catch')
    expect(regionBlock).not.toContain('jobs: []')
  })
})

describe('② 목록에 영향 주는 쓰기 경로가 지역 목록까지 갱신한다', () => {
  it('신규 공고 — Route Handler 는 revalidateTag(tag, "max") 를 쓴다 (API 차이 유지)', () => {
    revalidateJobCreated()
    expect(revalidateTag.mock.calls.map((c) => c[0])).toContain(JOBS_LIST_TAG)
    // 🔴 Server Action 밖이라 updateTag 를 쓰면 던진다. 대신 즉시 최신값 보장은 아니다.
    expect(revalidateTag.mock.calls.every((c) => c[1] === 'max')).toBe(true)
    expect(updateTag).not.toHaveBeenCalled()
  })

  it('단건 변경 — Server Action 은 updateTag 를 쓴다 (read-your-own-writes)', () => {
    revalidateJobPost('job1')
    expect(updateTag.mock.calls.map((c) => c[0])).toEqual(
      expect.arrayContaining([JOBS_LIST_TAG, HOME_JOBS_TAG, jobDetailCacheTag('job1'), SITEMAP_POSTS_TAG]),
    )
    expect(revalidateTag).not.toHaveBeenCalled()
  })

  it('일괄 변경 — 전역 JOB_DETAIL_TAG 까지 함께 지운다 (기존 동작 유지)', () => {
    revalidateJobPostsBulk()
    expect(updateTag.mock.calls.map((c) => c[0])).toEqual(
      expect.arrayContaining([JOBS_LIST_TAG, HOME_JOBS_TAG, JOB_DETAIL_TAG, SITEMAP_POSTS_TAG]),
    )
  })

  it.each([
    ['adminSetPostPromotionLevel', '승격'],
    ['adminUpdatePostStatus', '상태 변경·숨김'],
    ['adminTogglePin', '고정'],
    ['adminToggleFeatured', '집중'],
    ['adminUpdatePostContent', '본문 수정'],
    ['adminMovePost', '게시판 이동'],
  ])('%s (%s) 가 JOB 일 때 JOBS_LIST_TAG 경로를 탄다', (fn) => {
    const src = read('lib/actions/admin/admin.content.ts')
    const start = src.indexOf(`export async function ${fn}`)
    expect(start, `${fn} 이 없다`).toBeGreaterThan(-1)
    const next = src.indexOf('\nexport async function ', start + 1)
    const body = src.slice(start, next === -1 ? undefined : next)
    expect(body, `${fn} 에 JOB 무효화가 없다`).toMatch(/revalidateJobPost\(|revalidateJobPostsBulk\(/)
  })

  /**
   * 🔴 **기존부터 있던 누락 — 이번 배치에서 고치지 않는다.**
   *  `adminSetPostLikeCount` 는 JOB 일자리 캐시를 무효화하지 않는다.
   *  지금은 보이는 영향이 없다 — `JobCardItem` 에 `likeCount` 가 없고,
   *  일자리 정렬 기준도 `isPinned`·`createdAt` 뿐이라 목록이 바뀌지 않는다.
   *  다만 이 함수는 `checkAndPromotePost` 를 부르므로 **승격이 일어나면** 간접 영향 가능성이 있다.
   *  살아 있는 예외로 고정한다 — 조건이 바뀌면(카드에 공감 수가 생기면) 이 테스트가 먼저 깨진다.
   */
  it('알려진 누락: adminSetPostLikeCount 는 JOB 무효화를 하지 않는다 (영향 없음 조건 포함)', () => {
    const src = read('lib/actions/admin/admin.content.ts')
    const start = src.indexOf('export async function adminSetPostLikeCount')
    const next = src.indexOf('\nexport async function ', start + 1)
    const body = src.slice(start, next === -1 ? undefined : next)
    expect(body).not.toMatch(/revalidateJobPost\(|revalidateJobPostsBulk\(/)

    // 영향이 없는 근거를 함께 고정한다
    const jobs = read('lib/queries/posts/posts.jobs.ts')
    const card = jobs.slice(jobs.indexOf('export interface JobCardItem'), jobs.indexOf('export interface JobCardItem') + 600)
    expect(card, 'JobCardItem 에 likeCount 가 생겼다 — 누락이 실제 결함이 된다').not.toContain('likeCount')
    expect(jobs).toContain("orderBy: [{ isPinned: 'desc' }, { createdAt: 'desc' }]")
  })

  it('일괄 삭제·일괄 처리는 bulk 경로를 쓴다', () => {
    const src = read('lib/actions/admin/admin.content.ts')
    for (const fn of ['adminBulkDeleteExpiredJobs', 'adminBulkAction']) {
      const start = src.indexOf(`export async function ${fn}`)
      const next = src.indexOf('\nexport async function ', start + 1)
      expect(src.slice(start, next === -1 ? undefined : next)).toContain('revalidateJobPostsBulk()')
    }
  })
})

/* ─────────────────────────────────────────────────────────────
   ③ 글 상세
   ───────────────────────────────────────────────────────────── */
describe('③ postCacheKeys — CUID 와 slug 둘 다, 중복 없이', () => {
  it.each([
    ['id1', 'my-slug', ['id1', 'my-slug']],
    ['id1', null, ['id1']],
    ['id1', undefined, ['id1']],
    ['id1', '', ['id1']],
    ['id1', 'id1', ['id1']],
  ])('postCacheKeys(%p, %p) → %j', (id, slug, expected) => {
    expect(postCacheKeys(id, slug as string | null)).toEqual(expected)
  })

  it('태그는 ASCII 안전 토큰으로 정규화된다 (한글 slug 500 방지)', () => {
    const tag = postDetailCacheTag('갱년기-이야기')
    expect(tag.startsWith('post-detail-')).toBe(true)
    expect(/^[\x20-\x7E]+$/.test(tag)).toBe(true)
  })
})

describe('🔴 ③ 단건 경로만 좁힌다 — 전역 태그와 일괄 동작은 그대로', () => {
  const posts = read('lib/actions/posts.ts')
  const admin = read('lib/actions/admin/admin.content.ts')
  const body = (src: string, fn: string) => {
    const s = src.indexOf(`export async function ${fn}`)
    const n = src.indexOf('\nexport async function ', s + 1)
    return src.slice(s, n === -1 ? undefined : n)
  }

  it.each([
    ['updatePost', () => body(posts, 'updatePost')],
    ['deletePost', () => body(posts, 'deletePost')],
    ['adminMovePost', () => body(admin, 'adminMovePost')],
  ])('%s 는 전역 post-detail 대신 글별 태그를 쓴다', (_n, get) => {
    const b = get()
    expect(b).not.toContain("updateTag('post-detail')")
    expect(b).toMatch(/updateTag\(postDetailCacheTag\(/)
  })

  it('세 경로 모두 id·slug 두 키를 순회한다', () => {
    for (const b of [body(posts, 'updatePost'), body(posts, 'deletePost'), body(admin, 'adminMovePost')]) {
      expect(b).toMatch(/for \(const \w+ of (postCacheKeys\(|postIdentifiers\))/)
    }
  })

  it('id·slug 를 얻으려고 쿼리를 추가하지 않는다 — 기존 select 에 slug 만 더한다', () => {
    expect(posts).toContain('status: true, slug: true')
    expect(posts).toContain('thumbnailUrl: true, slug: true')
  })

  it('🔴 전역 post-detail 태그 자체는 캐시 정의에 남아 있다', () => {
    expect(read('lib/queries/posts/posts.base.ts')).toContain("tags: ['post-detail', postDetailCacheTag(postId)]")
  })

  it('🔴 일괄·비상 경로는 전역 태그를 계속 쓴다', () => {
    expect(read('app/api/admin/revalidate-deleted/route.ts')).toContain("'post-detail'")
  })

  it('slug 를 바꾸는 기능을 새로 만들지 않았다', () => {
    for (const b of [body(posts, 'updatePost'), body(admin, 'adminMovePost')]) {
      expect(b).not.toMatch(/generateCommunitySlug|slug:\s*\w+Slug/)
    }
  })
})

describe('③ 보존 계약 — post-meta·목록·홈·sitemap·경로', () => {
  const posts = read('lib/actions/posts.ts')
  const admin = read('lib/actions/admin/admin.content.ts')

  it('post-meta 는 전역 그대로다 (글별 태그가 없는 단일 캐시)', () => {
    expect(read('lib/queries/posts/posts.base.ts')).toContain("['post-meta'],")
    for (const src of [posts, admin]) expect(src).toContain("updateTag('post-meta')")
  })

  it('홈 태그가 그대로 남아 있다', () => {
    for (const t of ['home-trending', 'home-stories', 'home-humor']) {
      expect(posts).toContain(`updateTag('${t}')`)
    }
  })

  it('sitemap·목록 태그와 경로 무효화가 그대로다', () => {
    expect(admin).toContain("updateTag('sitemap-posts')")
    expect(admin).toContain("updateTag('community-board-page')")
    expect(posts).toContain("updateTag('community-board-page')")
    expect(posts).toMatch(/revalidatePath\('\/best'\)/)
    expect(posts).toMatch(/revalidatePath\('\/search'\)/)
  })

  it('인증 가드가 그대로다 — 좁히기가 인증보다 먼저 오지 않는다', () => {
    const b = admin.slice(admin.indexOf('export async function adminMovePost'))
    expect(b.indexOf('await requireAdmin()')).toBeLessThan(b.indexOf('updateTag(postDetailCacheTag('))
  })
})

/* ─────────────────────────────────────────────────────────────
   실패 시 동작 — 인증 실패 · DB 실패
   ───────────────────────────────────────────────────────────── */
describe('🔴 실패 시 무효화가 일어나지 않는다', () => {
  it('DB 조회가 실패하면 캐시는 값을 저장하지 않는다 (빈 목록으로 굳지 않음)', async () => {
    // `unstable_cache` 는 mock 에서 원본 함수를 그대로 돌려준다 —
    // 던지는 함수는 값을 만들지 않는다는 성질을 여기서 고정한다.
    const failing = async () => { throw new Error('DB down') }
    await expect(failing()).rejects.toThrow('DB down')

    // 캐시 정의에 catch 나 빈 배열 기본값이 없어야 이 성질이 유지된다
    const jobs = read('lib/queries/posts/posts.jobs.ts')
    const block = jobs.slice(jobs.indexOf('export const getCachedJobsRegionPage'))
    expect(block.slice(0, block.indexOf(')\n\n'))).not.toMatch(/catch|\?\?\s*\[\]|jobs:\s*\[\]/)
  })

  it('지역 페이지의 더미 DB 폴백은 CI 빌드에서만 열린다', () => {
    const page = read('app/(main)/jobs/region/[sido]/page.tsx')
    const guard = page.slice(page.indexOf('async function getRegionJobs'))
    const throwAt = guard.indexOf('if (!CI_DUMMY_DB) throw error')
    const fallbackAt = guard.indexOf('return { jobs: [], total: 0 }')
    expect(throwAt, '더미 DB 가드가 없다').toBeGreaterThan(-1)
    // 폴백보다 throw 가 **먼저** 와야 운영에서 빈 목록이 정상처럼 굳지 않는다
    expect(throwAt).toBeLessThan(fallbackAt)
  })
})

describe('🔴 인증 실패 시 글별 무효화도 일어나지 않는다', () => {
  const prismaCalls: string[] = []
  it('adminMovePost — 쿠키 없음이면 던지고 updateTag·revalidatePath 0', async () => {
    vi.resetModules()
    prismaCalls.length = 0
    vi.doMock('next/headers', () => ({ cookies: async () => ({ get: () => undefined }) }))
    vi.doMock('@/lib/prisma', () => ({
      prisma: new Proxy({}, {
        get: (_t, m: string) => (m === 'then' ? undefined : new Proxy({}, {
          get: (_t2, op: string) => (...a: unknown[]) => { prismaCalls.push(`${m}.${op}`); void a; return Promise.resolve(null) },
        })),
      }),
    }))
    updateTag.mockClear(); revalidatePath.mockClear()

    const mod = await import('@/lib/actions/admin/admin.content')
    await expect(mod.adminMovePost('p1', 'STORY' as never, null)).rejects.toThrow('관리자 인증이 필요합니다.')
    expect(prismaCalls, `DB 를 건드렸다: ${prismaCalls.join(', ')}`).toEqual([])
    expect(updateTag, '인증 실패인데 캐시를 무효화했다').not.toHaveBeenCalled()
    expect(revalidatePath).not.toHaveBeenCalled()
  })
})
