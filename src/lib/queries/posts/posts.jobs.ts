import { cache } from 'react'
import { unstable_cache } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { postSelect, buildTextSearch, SearchField } from './posts.base'
import { JOBS_LIST_TAG, JOB_DETAIL_TAG, jobDetailCacheTag } from '@/lib/cache/job-cache'

/* ── 일자리 (홈용 간략) ── */

async function _getLatestJobs(limit = 5) {
  const rows = await prisma.post.findMany({
    where: {
      status: 'PUBLISHED',
      boardType: 'JOB',
    },
    select: {
      ...postSelect,
      jobDetail: {
        select: {
          company: true,
          salary: true,
          location: true,
          region: true,
          quickTags: true,
        },
      },
    },
    orderBy: { createdAt: 'desc' },
    take: limit,
  })

  return rows.map((post) => ({
    id: post.id,
    title: post.title,
    location: post.jobDetail?.location ?? '',
    salary: post.jobDetail?.salary ?? '',
    tags: post.jobDetail?.quickTags ?? [],
    highlight: post.summary ?? '',
    isUrgent: post.promotionLevel === 'HOT',
  }))
}
// 홈은 page.tsx의 getCachedJobs(home-jobs 태그)로 한 번 더 감싸지만
// JobListBottom은 이 함수를 직접 부른다. jobs-list 태그를 붙여 두 경로의 갱신 시점을 맞춘다.
export const getLatestJobs = unstable_cache(
  _getLatestJobs,
  ['latest-jobs'],
  { revalidate: 60, tags: [JOBS_LIST_TAG] },
)

/* ── 일자리 목록 (필터 지원) ── */

export interface JobListOptions {
  region?: string
  tags?: string[]
  cursor?: string
  limit?: number
  q?: string
  sf?: SearchField
}

export interface JobCardItem {
  id: string
  title: string
  company: string
  location: string
  region: string
  salary: string
  workHours: string | null
  workDays: string | null
  tags: string[]
  highlight: string
  isUrgent: boolean
  viewCount: number
  commentCount: number
  createdAt: string
}

export async function getJobList(
  options?: JobListOptions,
): Promise<{ jobs: JobCardItem[]; hasMore: boolean }> {
  const limit = options?.limit ?? 10

  const rows = await prisma.post.findMany({
    where: {
      status: 'PUBLISHED',
      boardType: 'JOB',
      ...(options?.cursor ? { id: { lt: options.cursor } } : {}),
      ...(options?.region
        ? { jobDetail: { region: { contains: options.region, mode: 'insensitive' } } }
        : {}),
      ...(options?.tags && options.tags.length > 0
        ? { jobDetail: { quickTags: { hasSome: options.tags } } }
        : {}),
      ...buildTextSearch(options?.q, options?.sf),
    },
    select: {
      ...postSelect,
      jobDetail: {
        select: {
          company: true,
          salary: true,
          workHours: true,
          workDays: true,
          location: true,
          region: true,
          quickTags: true,
        },
      },
    },
    orderBy: [{ isPinned: 'desc' }, { createdAt: 'desc' }],
    take: limit + 1,
  })

  const hasMore = rows.length > limit

  const jobs: JobCardItem[] = rows.slice(0, limit).map((post) => ({
    id: post.id,
    title: post.title,
    company: post.jobDetail?.company ?? '',
    location: post.jobDetail?.location ?? '',
    region: post.jobDetail?.region ?? '',
    salary: post.jobDetail?.salary ?? '',
    workHours: post.jobDetail?.workHours ?? null,
    workDays: post.jobDetail?.workDays ?? null,
    tags: post.jobDetail?.quickTags ?? [],
    highlight: post.summary ?? '',
    isUrgent: post.promotionLevel === 'HOT',
    viewCount: post.viewCount,
    commentCount: post.commentCount,
    createdAt: post.createdAt.toISOString(),
  }))

  return { jobs, hasMore }
}

/* ── 일자리 목록 (번호 페이지네이션) ── */

export interface JobListPageOptions {
  region?: string
  tags?: string[]
  skip?: number
  limit?: number
  q?: string
  sf?: SearchField
}

export async function getJobListPage(
  options?: JobListPageOptions,
): Promise<{ jobs: JobCardItem[]; total: number }> {
  const limit = options?.limit ?? 12
  const skip = options?.skip ?? 0

  const where = {
    status: 'PUBLISHED' as const,
    boardType: 'JOB' as const,
    ...(options?.region
      ? { jobDetail: { region: { contains: options.region, mode: 'insensitive' as const } } }
      : {}),
    ...(options?.tags && options.tags.length > 0
      ? { jobDetail: { quickTags: { hasSome: options.tags } } }
      : {}),
    ...buildTextSearch(options?.q, options?.sf),
  }

  const [rows, total] = await Promise.all([
    prisma.post.findMany({
      where,
      select: {
        ...postSelect,
        jobDetail: {
          select: {
            company: true,
            salary: true,
            workHours: true,
            workDays: true,
            location: true,
            region: true,
            quickTags: true,
          },
        },
      },
      orderBy: [{ isPinned: 'desc' }, { createdAt: 'desc' }],
      skip,
      take: limit,
    }),
    prisma.post.count({ where }),
  ])

  const jobs: JobCardItem[] = rows.map((post) => ({
    id: post.id,
    title: post.title,
    company: post.jobDetail?.company ?? '',
    location: post.jobDetail?.location ?? '',
    region: post.jobDetail?.region ?? '',
    salary: post.jobDetail?.salary ?? '',
    workHours: post.jobDetail?.workHours ?? null,
    workDays: post.jobDetail?.workDays ?? null,
    tags: post.jobDetail?.quickTags ?? [],
    highlight: post.summary ?? '',
    isUrgent: post.promotionLevel === 'HOT',
    viewCount: post.viewCount,
    commentCount: post.commentCount,
    createdAt: post.createdAt.toISOString(),
  }))

  return { jobs, total }
}

export const getCachedJobsPage = unstable_cache(
  () => getJobListPage({ skip: 0, limit: 12 }),
  ['jobs-list-page1'],
  { revalidate: 120, tags: [JOBS_LIST_TAG] },
)

/** 요청된 페이지를 서버에서 가져온다 — 캐시 키가 page 로 갈리고 revalidate·태그는 동일하다. */
export const getCachedJobsPageAt = unstable_cache(
  (page: number) => getJobListPage({ skip: (Math.max(1, page) - 1) * 12, limit: 12 }),
  ['jobs-list-page-at'],
  { revalidate: 120, tags: [JOBS_LIST_TAG] },
)

/**
 * 시도별 일자리 목록 — **지역마다 캐시 키가 갈린다.**
 *
 * ── 왜 필요한가 ──────────────────────────────────────────────
 *  지역 페이지(`/jobs/region/[sido]`)는 캐시되지 않은 `getJobListPage` 를 직접 불렀다.
 *  그래서 `revalidateJobCreated`·`revalidateJobPost`·`revalidateJobPostsBulk` 가
 *  `JOBS_LIST_TAG` 를 무효화해도 **지역 페이지에는 닿지 않았다** —
 *  유일한 갱신 수단이 페이지 ISR 시간(120초)뿐이었다.
 *  같은 태그에 묶어 두면 기존 쓰기 경로가 그대로 지역 목록까지 갱신한다.
 *
 * 🔴 조회 실패를 빈 목록으로 캐시하지 않는다. 여기서 잡지 않고 던지면
 *    `unstable_cache` 는 값을 저장하지 않는다. 호출부의 CI 더미 DB 가드는
 *    **캐시 바깥**에 있어야 한다(`jobs/region/[sido]/page.tsx` 참조).
 *
 * 필터·정렬·30건 제한은 `getJobListPage` 가 그대로 담당한다 — 여기서 바꾸지 않는다.
 */
export const getCachedJobsRegionPage = unstable_cache(
  (region: string) => getJobListPage({ region, limit: 30 }),
  ['jobs-region-page'],
  { revalidate: 3600, tags: [JOBS_LIST_TAG] },
)

/* ── 일자리 상세 ── */

export interface JobDetailItem {
  id: string
  title: string
  content: string
  company: string
  location: string
  region: string
  salary: string
  workHours: string | null
  workDays: string | null
  tags: string[]
  applyUrl: string | null
  /**
   * `JobDetail.jobType` — 스크래퍼가 "고용형태/근무형태" 라벨에서 긁은 **자유 한국어**.
   * JobPosting 구조화 데이터의 `employmentType` 판정에만 쓴다(매핑 실패 시 생략).
   */
  jobType: string | null
  /**
   * `JobDetail.expiresAt` — ISO 8601. **현재 쓰는 코드가 없어 항상 null 이다.**
   * Google 지침상 만료를 모르면 `validThrough` 를 생략하는 것이 맞다 — 지어내지 않는다.
   */
  expiresAt: string | null
  pickPoints: Array<{ point: string; icon: string }>
  viewCount: number
  likeCount: number
  commentCount: number
  isLiked: boolean
  isScrapped: boolean
  createdAt: string
  seoTitle: string | null
  seoDescription: string | null
}

/** 공개 job 데이터만 cross-request 캐시 (userId 미포함 → 모든 방문자 공유) */
export type JobDetailPublicItem = Omit<JobDetailItem, 'isLiked' | 'isScrapped'>

async function _getJobDetailPublic(postId: string): Promise<JobDetailPublicItem | null> {
  const post = await prisma.post.findUnique({
    where: { id: postId, status: 'PUBLISHED', boardType: 'JOB' },
    select: {
      id: true,
      title: true,
      content: true,
      viewCount: true,
      likeCount: true,
      commentCount: true,
      createdAt: true,
      seoTitle: true,
      seoDescription: true,
      jobDetail: {
        select: {
          company: true,
          salary: true,
          workHours: true,
          workDays: true,
          location: true,
          region: true,
          quickTags: true,
          applyUrl: true,
          pickPoints: true,
          // JobPosting 구조화 데이터용 — 화면 렌더에는 쓰지 않는다
          jobType: true,
          expiresAt: true,
        },
      },
    },
  })

  if (!post) return null

  const pickPoints = Array.isArray(post.jobDetail?.pickPoints)
    ? (post.jobDetail.pickPoints as Array<{ point: string; icon: string }>)
    : []

  return {
    id: post.id,
    title: post.title,
    content: post.content,
    company: post.jobDetail?.company ?? '',
    location: post.jobDetail?.location ?? '',
    region: post.jobDetail?.region ?? '',
    salary: post.jobDetail?.salary ?? '',
    workHours: post.jobDetail?.workHours ?? null,
    workDays: post.jobDetail?.workDays ?? null,
    tags: post.jobDetail?.quickTags ?? [],
    applyUrl: post.jobDetail?.applyUrl ?? null,
    jobType: post.jobDetail?.jobType ?? null,
    expiresAt: post.jobDetail?.expiresAt?.toISOString() ?? null,
    pickPoints,
    viewCount: post.viewCount,
    likeCount: post.likeCount,
    commentCount: post.commentCount,
    createdAt: post.createdAt.toISOString(),
    seoTitle: post.seoTitle ?? null,
    seoDescription: post.seoDescription ?? null,
  }
}

/**
 * TTL 300s 는 "아무도 안 건드린 공고"의 상한일 뿐이다.
 * 상태·본문 변경 시 해당 글의 per-id 태그가 즉시 무효화된다(job-cache.ts).
 * 전역 job-detail 태그는 일괄 변경처럼 대상 글을 특정할 수 없을 때 쓴다.
 * getPostDetail 과 동일한 wrapper 패턴 — 외부 호출 시그니처와 반환값은 그대로다.
 */
export function getJobDetailPublic(postId: string): Promise<JobDetailPublicItem | null> {
  return unstable_cache(
    _getJobDetailPublic,
    ['job-detail-public', postId],
    { revalidate: 300, tags: [JOB_DETAIL_TAG, jobDetailCacheTag(postId)] },
  )(postId)
}

export const getJobDetail = cache(async function getJobDetail(
  postId: string,
  userId?: string,
): Promise<JobDetailItem | null> {
  const post = await prisma.post.findUnique({
    where: { id: postId, status: 'PUBLISHED', boardType: 'JOB' },
    select: {
      id: true,
      title: true,
      content: true,
      viewCount: true,
      likeCount: true,
      commentCount: true,
      createdAt: true,
      seoTitle: true,
      seoDescription: true,
      jobDetail: {
        select: {
          company: true,
          salary: true,
          workHours: true,
          workDays: true,
          location: true,
          region: true,
          quickTags: true,
          applyUrl: true,
          pickPoints: true,
          // 타입 계약(JobDetailItem) 유지 — 화면 렌더에는 쓰지 않는다
          jobType: true,
          expiresAt: true,
        },
      },
    },
  })

  if (!post) return null

  // 조회수 증가
  prisma.post.update({
    where: { id: postId },
    data: { viewCount: { increment: 1 } },
  }).catch(() => {})

  let isLiked = false
  let isScrapped = false

  if (userId) {
    const [like, scrap] = await Promise.all([
      prisma.like.findUnique({ where: { userId_postId: { userId, postId } } }),
      prisma.scrap.findUnique({ where: { userId_postId: { userId, postId } } }),
    ])
    isLiked = !!like
    isScrapped = !!scrap
  }

  const pickPoints = Array.isArray(post.jobDetail?.pickPoints)
    ? (post.jobDetail.pickPoints as Array<{ point: string; icon: string }>)
    : []

  return {
    id: post.id,
    title: post.title,
    content: post.content,
    company: post.jobDetail?.company ?? '',
    location: post.jobDetail?.location ?? '',
    region: post.jobDetail?.region ?? '',
    salary: post.jobDetail?.salary ?? '',
    workHours: post.jobDetail?.workHours ?? null,
    workDays: post.jobDetail?.workDays ?? null,
    jobType: post.jobDetail?.jobType ?? null,
    expiresAt: post.jobDetail?.expiresAt?.toISOString() ?? null,
    tags: post.jobDetail?.quickTags ?? [],
    applyUrl: post.jobDetail?.applyUrl ?? null,
    pickPoints,
    viewCount: post.viewCount,
    likeCount: post.likeCount,
    commentCount: post.commentCount,
    isLiked,
    isScrapped,
    createdAt: post.createdAt.toISOString(),
    seoTitle: post.seoTitle ?? null,
    seoDescription: post.seoDescription ?? null,
  }
})
