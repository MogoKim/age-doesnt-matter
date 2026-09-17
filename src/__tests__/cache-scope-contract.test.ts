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
   * 자동 승격도 일자리 목록에 영향을 준다 — `promotionLevel === 'HOT'` 이
   * `JobCardItem.isUrgent` 를 거쳐 카드의 **급구 배지**로 보이기 때문이다.
   * 그래서 승격 경로도 `JOBS_LIST_TAG` 에 연결한다(지역 목록이 이 태그를 공유한다).
   *
   * 🔴 실행 문맥이 달라 API 도 다르다 — 승격은 detached 호출이라
   *    `updateTag` 가 아니라 `revalidateTag(tag, 'max')` 를 쓴다.
   *    실제 호출 검증은 `promotion-job-cache.test.ts` 가 한다.
   */
  it('자동 승격이 일자리 목록 태그에 연결돼 있다', () => {
    const promo = read('lib/actions/promotion.ts')
    expect(promo).toContain("if (boardType === 'JOB') revalidateJobPromotion(postId)")
    expect(promo).toContain("if (boardType === 'JOB') revalidateJobPromotionBulk()")
  })

  it('승격 헬퍼가 목록·홈 태그를 담고, detached 문맥용 API 를 쓴다', () => {
    const cache = read('lib/cache/job-cache.ts')
    // 승격 헬퍼 두 개만 잘라 본다 — 뒤쪽 Server Action 용 헬퍼는 updateTag 를 쓴다(정상).
    const from = cache.indexOf('export function revalidateJobPromotion')
    const to = cache.indexOf('export function revalidateJobPostsBulk')
    const block = cache.slice(from, to > from ? to : undefined)
    expect(block).toContain('revalidateTag(JOBS_LIST_TAG')
    expect(block).toContain('revalidateTag(HOME_JOBS_TAG')
    expect(block).not.toContain('updateTag(')
  })

  it('🔴 승격이 카드에 보인다는 연결 고리 (계약의 근거)', () => {
    expect(read('lib/queries/posts/posts.jobs.ts')).toContain("isUrgent: post.promotionLevel === 'HOT'")
    const card = read('components/features/jobs/JobCard.tsx')
    expect(card).toContain('job.isUrgent')
    expect(card).toContain('급구')
  })

  /**
   * `adminSetPostLikeCount` 자체는 여전히 `revalidateJobPost` 를 직접 부르지 않는다.
   * 다만 그것이 부르는 `checkAndPromotePost` 가 이제 연결돼 있어
   * **승격이 일어나면 일자리 목록이 갱신된다.** 승격이 없으면 카드가 바뀌지 않으므로
   * 갱신할 것도 없다. 이 관계를 고정한다 — 연결이 끊기면 먼저 깨진다.
   */
  it('adminSetPostLikeCount 는 승격 경로를 통해 연결된다', () => {
    const src = read('lib/actions/admin/admin.content.ts')
    const start = src.indexOf('export async function adminSetPostLikeCount')
    const next = src.indexOf('\nexport async function ', start + 1)
    expect(src.slice(start, next === -1 ? undefined : next)).toContain('checkAndPromotePost(')
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
  /**
   * 🔴 실제 조회 실패 전파는 **`cache-scope-invocation.test.ts`** 가 진짜 함수를 돌려 확인한다.
   *    (앞서 여기 있던 별도 `failing()` 테스트는 구현을 검증하지 않아 제거했다.)
   *    여기서는 그 성질이 깨질 수 있는 **구조**만 본다 — 캐시 정의 안의 catch·빈 배열 기본값.
   */
  it('캐시 정의 안에 실패를 삼키는 코드가 없다', () => {
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
