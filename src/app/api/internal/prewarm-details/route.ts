import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import type { BoardType } from '@/generated/prisma/client'

const INTERNAL_TOKEN = process.env.INTERNAL_API_TOKEN
const BASE_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://age-doesnt-matter.com'
const COMMUNITY_BOARD_SLUG: Record<'STORY' | 'HUMOR' | 'LIFE2', string> = {
  STORY: 'stories',
  HUMOR: 'humor',
  LIFE2: 'life2',
}

// 목록 페이지 cold MISS 완화 — 상세(detail)에 더해 목록 페이지도 prewarm (jobs 제외)
const LIST_PATHS = [
  '/best',
  '/magazine',
  '/community/stories',
  '/community/humor',
  '/community/life2',
]
// 목록 API cold MISS 완화 — /api/best 기본/명예 응답 prewarm (jobs API 제외)
const API_PATHS = [
  '/api/best?type=hot',
  '/api/best?type=fame',
]

type PrewarmBody = {
  communityLimit?: number
  magazineLimit?: number
  jobsLimit?: number
  dryRun?: boolean
}

function clampLimit(value: unknown, fallback: number, max: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
  return Math.max(0, Math.min(Math.floor(value), max))
}

async function fetchWithTimeout(url: string) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 15_000)
  const startedAt = Date.now()

  try {
    const response = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      signal: controller.signal,
    })
    await response.arrayBuffer()
    return {
      ok: response.ok,
      status: response.status,
      xVercelCache: response.headers.get('x-vercel-cache'),
      ms: Date.now() - startedAt,
    }
  } catch (error) {
    return {
      ok: false,
      status: 0,
      xVercelCache: null,
      ms: Date.now() - startedAt,
      error: error instanceof Error ? error.message : String(error),
    }
  } finally {
    clearTimeout(timeout)
  }
}

export async function POST(req: NextRequest) {
  const token = req.headers.get('x-internal-token')
  if (!INTERNAL_TOKEN || token !== INTERNAL_TOKEN) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json().catch(() => ({})) as PrewarmBody
  const communityLimit = clampLimit(body.communityLimit, 8, 10)
  const magazineLimit = clampLimit(body.magazineLimit, 4, 6)
  const jobsLimit = clampLimit(body.jobsLimit, 4, 6)

  const [communityPosts, magazinePosts, jobPosts] = await Promise.all([
    prisma.post.findMany({
      where: {
        status: 'PUBLISHED',
        boardType: { in: ['STORY', 'HUMOR', 'LIFE2'] as BoardType[] },
      },
      select: { id: true, slug: true, boardType: true },
      orderBy: [{ trendingScore: 'desc' }, { createdAt: 'desc' }],
      take: communityLimit,
    }),
    prisma.post.findMany({
      where: { status: 'PUBLISHED', boardType: 'MAGAZINE' },
      select: { id: true, slug: true },
      orderBy: [{ createdAt: 'desc' }],
      take: magazineLimit,
    }),
    prisma.post.findMany({
      where: { status: 'PUBLISHED', boardType: 'JOB' },
      select: { id: true },
      orderBy: [{ createdAt: 'desc' }],
      take: jobsLimit,
    }),
  ])

  const paths = [
    ...communityPosts.map((post) => {
      const boardSlug = COMMUNITY_BOARD_SLUG[post.boardType as keyof typeof COMMUNITY_BOARD_SLUG]
      return `/community/${boardSlug}/${post.slug ?? post.id}`
    }),
    ...magazinePosts.map((post) => `/magazine/${post.slug ?? post.id}`),
    ...jobPosts.map((post) => `/jobs/${post.id}`),
    // 목록 페이지 + 목록 API prewarm 추가 (jobs 목록/API는 제외)
    ...LIST_PATHS,
    ...API_PATHS,
  ].filter((path, index, arr) => arr.indexOf(path) === index)

  if (body.dryRun) {
    return NextResponse.json({ dryRun: true, count: paths.length, paths })
  }

  const baseUrl = BASE_URL.replace(/\/$/, '')
  const results = []
  for (const path of paths) {
    const result = await fetchWithTimeout(`${baseUrl}${path}`)
    results.push({ path, ...result })
  }

  const failed = results.filter((result) => !result.ok)
  return NextResponse.json({
    count: results.length,
    failed: failed.length,
    results,
  })
}
