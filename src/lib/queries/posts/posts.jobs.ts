import { cache } from 'react'
import { unstable_cache } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { postSelect, buildTextSearch, SearchField } from './posts.base'

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
export const getLatestJobs = unstable_cache(
  _getLatestJobs,
  ['latest-jobs'],
  { revalidate: 60 },
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
  { revalidate: 120, tags: ['jobs-list'] },
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

export const getJobDetailPublic = unstable_cache(
  async (postId: string): Promise<JobDetailPublicItem | null> => {
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
      pickPoints,
      viewCount: post.viewCount,
      likeCount: post.likeCount,
      commentCount: post.commentCount,
      createdAt: post.createdAt.toISOString(),
      seoTitle: post.seoTitle ?? null,
      seoDescription: post.seoDescription ?? null,
    }
  },
  ['job-detail-public'],
  { revalidate: 300 },
)

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
