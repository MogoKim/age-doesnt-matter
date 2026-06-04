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
