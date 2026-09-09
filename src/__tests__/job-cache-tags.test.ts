import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * R6 P0-4 — JOB 캐시 태그·무효화 회귀 테스트.
 *
 * 배경: `unstable_cache` 엔트리는 경로가 아니라 태그로만 지워진다.
 * 어드민 mutation 이 쓰는 `revalidateServicePaths` 는 `revalidatePath` 만 호출해
 * JOB 캐시를 하나도 못 지웠고, 그래서 공고를 숨겨도 상세가 최대 300초,
 * sitemap 이 최대 3600초 옛 상태로 남았다.
 *
 * 여기서는 태그가 실제로 붙는지, 그리고 DB write 성공 후에만 무효화가 도는지를 고정한다.
 */

const revalidateTagMock = vi.fn()
/**
 * Next 16 전환(2026-09-09): job-cache 는 **실행 문맥에 따라 API 가 다르다.**
 *   · revalidateJobCreated  → Route Handler(/api/bot/jobs) 전용 → revalidateTag(tag,'max')
 *   · revalidateJobPost·Bulk → Server Action(어드민) 전용        → updateTag(tag)
 * 그래서 둘 다 mock 하고, "어떤 태그를 지웠는가" 는 두 mock 을 합쳐서 본다.
 */
const updateTagMock = vi.fn()
/** 문맥과 무관하게 무효화된 태그 전체. 어느 API 를 썼는지는 별도 테스트가 고정한다. */
const invalidatedTags = () =>
  [...revalidateTagMock.mock.calls, ...updateTagMock.mock.calls].map(([t]) => String(t))

/**
 * unstable_cache 등록 기록.
 * 모듈 최상위(import 시점)에 등록되는 캐시가 있어 vi.clearAllMocks 로 지워지면 안 된다 →
 * vi.fn 이 아니라 평범한 배열에 쌓는다.
 */
interface CacheRegistration { keyParts: unknown[]; opts: { revalidate?: number; tags?: string[] } }
const cacheRegistrations: CacheRegistration[] = []

vi.mock('next/cache', () => ({
  revalidateTag: (tag: string) => revalidateTagMock(tag),
  updateTag: (tag: string) => updateTagMock(tag),
  revalidatePath: vi.fn(),
  unstable_cache: (fn: unknown, keyParts: unknown[], opts: CacheRegistration['opts']) => {
    cacheRegistrations.push({ keyParts, opts })
    return fn
  },
}))

const findRegistration = (key: string, second?: string) =>
  cacheRegistrations.find(
    (r) => r.keyParts[0] === key && (second === undefined || r.keyParts[1] === second),
  )

vi.mock('@/lib/prisma', () => ({ prisma: { post: { findMany: vi.fn(), findUnique: vi.fn() } } }))

beforeEach(() => {
  // cacheRegistrations 는 지우지 않는다(모듈 import 시점 등록이 사라진다)
  revalidateTagMock.mockClear()
  updateTagMock.mockClear()
})

describe('1·2. 조회 캐시에 태그가 붙는다', () => {
  it('latest-jobs 에 jobs-list 태그가 붙는다', async () => {
    const { JOBS_LIST_TAG } = await import('@/lib/cache/job-cache')
    await import('@/lib/queries/posts/posts.jobs')
    const latest = findRegistration('latest-jobs')
    expect(latest).toBeDefined()
    expect(latest!.opts.tags).toContain(JOBS_LIST_TAG)
  })

  it('jobs-list-page1 에도 같은 jobs-list 태그가 붙는다', async () => {
    const { JOBS_LIST_TAG } = await import('@/lib/cache/job-cache')
    await import('@/lib/queries/posts/posts.jobs')
    const page1 = findRegistration('jobs-list-page1')
    expect(page1).toBeDefined()
    expect(page1!.opts.tags).toContain(JOBS_LIST_TAG)
  })

  it('job-detail-public 에 전역 태그와 per-id 태그가 모두 붙는다', async () => {
    const { JOB_DETAIL_TAG, jobDetailCacheTag } = await import('@/lib/cache/job-cache')
    const mod = await import('@/lib/queries/posts/posts.jobs')
    await mod.getJobDetailPublic('cjob123').catch(() => null)

    const call = findRegistration('job-detail-public', 'cjob123')
    expect(call).toBeDefined()
    // keyParts 에 postId 가 들어가야 글마다 별도 엔트리가 된다
    expect(call!.keyParts).toEqual(['job-detail-public', 'cjob123'])
    expect(call!.opts.tags).toContain(JOB_DETAIL_TAG)
    expect(call!.opts.tags).toContain(jobDetailCacheTag('cjob123'))
    expect(call!.opts.revalidate).toBe(300)
  })
})

describe('3·4. 봇 JOB 생성 무효화', () => {
  it('생성 성공 시 jobs-list · home-jobs · sitemap-posts 를 무효화한다', async () => {
    const { revalidateJobCreated, JOBS_LIST_TAG, HOME_JOBS_TAG, SITEMAP_POSTS_TAG } =
      await import('@/lib/cache/job-cache')
    revalidateJobCreated()
    const tags = revalidateTagMock.mock.calls.map(([t]) => t)
    expect(tags).toEqual([JOBS_LIST_TAG, HOME_JOBS_TAG, SITEMAP_POSTS_TAG])
  })

  it('신규 postId 에는 상세 캐시가 없으므로 상세 태그는 건드리지 않는다', async () => {
    const { revalidateJobCreated, JOB_DETAIL_TAG } = await import('@/lib/cache/job-cache')
    revalidateJobCreated()
    const tags = revalidateTagMock.mock.calls.map(([t]) => String(t))
    expect(tags).not.toContain(JOB_DETAIL_TAG)
    expect(tags.some((t) => t.startsWith('job-detail-'))).toBe(false)
  })

  it('생성 실패(예외) 시 무효화가 일어나지 않는다 — 호출 자체가 write 뒤에 있다', async () => {
    // route 소스를 정적 검사한다: revalidateJobCreated() 는 create 성공 이후,
    // 그리고 catch 블록 밖에 있어야 한다.
    const { readFileSync } = await import('node:fs')
    const src = readFileSync('src/app/api/bot/jobs/route.ts', 'utf8')
    const createIdx = src.indexOf('prisma.post.create')
    const revalidateIdx = src.indexOf('revalidateJobCreated()')
    const catchIdx = src.indexOf('} catch (err)')
    expect(createIdx).toBeGreaterThan(-1)
    expect(revalidateIdx).toBeGreaterThan(createIdx)
    expect(revalidateIdx).toBeLessThan(catchIdx)
  })
})

describe('5·6. 단건 vs 일괄 무효화', () => {
  it('단건 변경은 per-id 상세 태그를 쓴다 (전역 job-detail 아님)', async () => {
    const { revalidateJobPost, JOB_DETAIL_TAG, jobDetailCacheTag } =
      await import('@/lib/cache/job-cache')
    revalidateJobPost('cjobABC')
    const tags = invalidatedTags()
    expect(tags).toContain(jobDetailCacheTag('cjobABC'))
    expect(tags).not.toContain(JOB_DETAIL_TAG)
  })

  it('단건 변경에서 includeSitemap:false 면 sitemap-posts 는 지우지 않는다', async () => {
    const { revalidateJobPost, SITEMAP_POSTS_TAG } = await import('@/lib/cache/job-cache')
    revalidateJobPost('cjobABC', { includeSitemap: false })
    const tags = invalidatedTags()
    expect(tags).not.toContain(SITEMAP_POSTS_TAG)
  })

  it('일괄 변경은 전역 job-detail 태그를 쓴다', async () => {
    const { revalidateJobPostsBulk, JOBS_LIST_TAG, HOME_JOBS_TAG, JOB_DETAIL_TAG, SITEMAP_POSTS_TAG } =
      await import('@/lib/cache/job-cache')
    revalidateJobPostsBulk()
    const tags = invalidatedTags()
    expect(tags).toEqual([JOBS_LIST_TAG, HOME_JOBS_TAG, JOB_DETAIL_TAG, SITEMAP_POSTS_TAG])
  })
})

describe('5-1. 실행 문맥별 캐시 API (Next 16)', () => {
  it('revalidateJobCreated 는 revalidateTag 를 쓴다 — Route Handler 에서 updateTag 는 던진다', async () => {
    const { revalidateJobCreated } = await import('@/lib/cache/job-cache')
    revalidateJobCreated()
    expect(revalidateTagMock, '/api/bot/jobs 는 Server Action 이 아니다').toHaveBeenCalled()
    expect(updateTagMock).not.toHaveBeenCalled()
  })

  it('revalidateJobPost 는 updateTag 를 쓴다 — 어드민이 바꾸고 바로 확인한다', async () => {
    const { revalidateJobPost } = await import('@/lib/cache/job-cache')
    revalidateJobPost('cjobABC')
    expect(updateTagMock, "'max' 는 즉시가 아니다 — 어드민 화면이 옛 값을 보여준다").toHaveBeenCalled()
    expect(revalidateTagMock).not.toHaveBeenCalled()
  })
})

describe('7. revalidate-deleted 태그', () => {
  const readTagsBlock = async () => {
    const { readFileSync } = await import('node:fs')
    const src = readFileSync('src/app/api/admin/revalidate-deleted/route.ts', 'utf8')
    return {
      src,
      block: src.slice(src.indexOf('const tags = ['), src.indexOf('for (const tag of tags)')),
    }
  }

  it('태그 배열 엔트리가 정확히 10개다', async () => {
    const { block } = await readTagsBlock()
    // 주석·빈 줄·대괄호를 뺀 실제 엔트리만 센다(리터럴과 상수가 섞여 있다)
    const entries = block
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith('//') && !l.startsWith('const tags') && l !== ']')
      .filter((l) => l.endsWith(','))
    expect(entries).toHaveLength(10)
  })

  it('JOB 관련 4개 태그는 리터럴이 아니라 job-cache 상수를 쓴다', async () => {
    const { src, block } = await readTagsBlock()
    for (const constName of ['SITEMAP_POSTS_TAG', 'JOBS_LIST_TAG', 'HOME_JOBS_TAG', 'JOB_DETAIL_TAG']) {
      expect(block, `tags 배열이 ${constName} 를 써야 한다`).toContain(constName)
    }
    expect(src).toContain("from '@/lib/cache/job-cache'")
  })

  it('무효화되는 실제 태그 값에 JOB 4종이 모두 들어간다', async () => {
    const { JOBS_LIST_TAG, HOME_JOBS_TAG, JOB_DETAIL_TAG, SITEMAP_POSTS_TAG } =
      await import('@/lib/cache/job-cache')
    // 상수 값 자체가 바뀌면 여기서 잡힌다
    expect([JOBS_LIST_TAG, HOME_JOBS_TAG, JOB_DETAIL_TAG, SITEMAP_POSTS_TAG]).toEqual([
      'jobs-list',
      'home-jobs',
      'job-detail',
      'sitemap-posts',
    ])
  })
})

describe('8. 기존 계약 불변', () => {
  it('getJobDetailPublic 은 postId 하나를 받아 Promise 를 돌려준다', async () => {
    const mod = await import('@/lib/queries/posts/posts.jobs')
    expect(typeof mod.getJobDetailPublic).toBe('function')
    expect(mod.getJobDetailPublic.length).toBe(1)
    expect(mod.getJobDetailPublic('x')).toBeInstanceOf(Promise)
  })

  it('JOB 조회 함수 export 가 유지된다', async () => {
    const mod = await import('@/lib/queries/posts/posts.jobs')
    for (const name of ['getLatestJobs', 'getJobList', 'getJobListPage', 'getCachedJobsPage', 'getJobDetailPublic', 'getJobDetail']) {
      expect(mod).toHaveProperty(name)
    }
  })

  it('JOB 태그 문자열이 호출부에 복붙되지 않고 job-cache 모듈에만 정의된다', async () => {
    const { readFileSync } = await import('node:fs')
    const files = [
      'src/lib/queries/posts/posts.jobs.ts',
      'src/lib/actions/admin/admin.content.ts',
      'src/lib/actions/admin/admin.members.ts',
      'src/lib/actions/admin/admin.reports.ts',
      'src/lib/actions/reports.ts',
      'src/app/api/bot/jobs/route.ts',
    ]
    for (const f of files) {
      const src = readFileSync(f, 'utf8')
      expect(src, `${f} 에 jobs-list 리터럴이 있으면 안 된다`).not.toMatch(/'jobs-list'/)
      expect(src, `${f} 에 job-detail 리터럴이 있으면 안 된다`).not.toMatch(/'job-detail'/)
    }

    // revalidate-deleted 는 sitemap-posts·home-jobs 까지 상수로 바꿨으므로 4종 모두 검사한다
    const revalidateSrc = readFileSync('src/app/api/admin/revalidate-deleted/route.ts', 'utf8')
    for (const lit of ["'jobs-list'", "'home-jobs'", "'job-detail'", "'sitemap-posts'"]) {
      expect(revalidateSrc, `revalidate-deleted 에 ${lit} 리터럴이 있으면 안 된다`).not.toContain(lit)
    }
  })
})
