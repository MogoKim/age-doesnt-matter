import { Pool } from 'pg'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../src/generated/prisma/client'
import { classifyMenopauseCandidate } from '../agents/core/menopause-classifier'

const DAYS = Number.parseInt(process.env.MENOPAUSE_DRY_RUN_DAYS ?? '7', 10)
const SAMPLE_LIMIT = Number.parseInt(process.env.MENOPAUSE_DRY_RUN_SAMPLE_LIMIT ?? '30', 10)

function createPrismaClient() {
  const raw = process.env.DATABASE_URL ?? process.env.DIRECT_URL ?? ''
  if (!raw) throw new Error('DATABASE_URL 또는 DIRECT_URL이 필요합니다.')

  const u = new URL(raw)
  const pool = new Pool({
    host: u.hostname,
    port: Number.parseInt(u.port, 10) || 5432,
    user: decodeURIComponent(u.username),
    password: decodeURIComponent(u.password),
    database: u.pathname.slice(1) || 'postgres',
    ssl: { rejectUnauthorized: false },
    max: 1,
    idleTimeoutMillis: 5000,
    connectionTimeoutMillis: 10000,
  })

  return new PrismaClient({ adapter: new PrismaPg(pool) })
}

const prisma = createPrismaClient()

function increment(map: Map<string, number>, key: string) {
  map.set(key, (map.get(key) ?? 0) + 1)
}

function joinKey(...parts: Array<string | null | undefined>) {
  return parts.map(part => part ?? 'null').join('|')
}

function printMap(title: string, map: Map<string, number>) {
  console.log(`\n## ${title}`)
  for (const [key, count] of [...map.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))) {
    console.log(`${key}\t${count}`)
  }
}

async function main() {
  const now = new Date()
  const since = new Date(now.getTime() - DAYS * 24 * 60 * 60 * 1000)
  const since24h = new Date(now.getTime() - 24 * 60 * 60 * 1000)

  const posts = await prisma.post.findMany({
    where: {
      status: 'PUBLISHED',
      boardType: { in: ['STORY', 'LIFE2', 'HUMOR', 'MENOPAUSE'] },
      createdAt: { gte: since },
    },
    select: {
      title: true,
      content: true,
      boardType: true,
      source: true,
      category: true,
      slug: true,
      createdAt: true,
      commentCount: true,
      likeCount: true,
      viewCount: true,
    },
    orderBy: { createdAt: 'desc' },
    take: 1500,
  })

  const cafePosts = await prisma.cafePost.findMany({
    where: {
      crawledAt: { gte: since },
      usedAt: null,
      isUsable: true,
      commentCrawled: true,
      imageUrls: { isEmpty: true },
      videoUrls: { isEmpty: true },
    },
    select: {
      title: true,
      content: true,
      cafeId: true,
      boardName: true,
      desireCategory: true,
      isPopular: true,
      commentCount: true,
      killerScore: true,
      qualityScore: true,
    },
    orderBy: [{ killerScore: 'desc' }, { crawledAt: 'desc' }],
    take: 1500,
  })

  const publishedSummary = new Map<string, number>()
  const publishedLevels = new Map<string, number>()
  const publishedStrong: Array<{
    title: string
    boardType: string
    source: string
    category: string | null
    newCategory: string
    matchedKeywords: string
    comments: number
    likes: number
    views: number
    slug: string | null
    createdAt: Date
  }> = []
  const publishedMedium: Array<{ title: string; boardType: string; source: string; category: string | null; matchedKeywords: string }> = []
  let publishedWeak = 0

  for (const post of posts) {
    const classification = classifyMenopauseCandidate({ title: post.title, content: post.content })
    increment(publishedSummary, joinKey(post.boardType, post.source, post.category))
    increment(
      publishedLevels,
      joinKey(
        post.boardType,
        post.source,
        classification.level,
        classification.reason,
        classification.shouldRoute ? classification.category : '-',
      ),
    )

    if (classification.shouldRoute && post.boardType !== 'MENOPAUSE') {
      publishedStrong.push({
        title: post.title,
        boardType: post.boardType,
        source: post.source,
        category: post.category,
        newCategory: classification.category,
        matchedKeywords: classification.matchedKeywords.join(','),
        comments: post.commentCount,
        likes: post.likeCount,
        views: post.viewCount,
        slug: post.slug,
        createdAt: post.createdAt,
      })
    } else if (classification.level === 'medium' && post.boardType !== 'MENOPAUSE') {
      publishedMedium.push({
        title: post.title,
        boardType: post.boardType,
        source: post.source,
        category: post.category,
        matchedKeywords: classification.matchedKeywords.join(','),
      })
    } else if (classification.level === 'weak' && post.boardType !== 'MENOPAUSE') {
      publishedWeak += 1
    }
  }

  const cafeLevels = new Map<string, number>()
  const cafeStrong: Array<{
    title: string
    cafeId: string
    boardName: string | null
    desireCategory: string | null
    path: string
    newCategory: string
    matchedKeywords: string
    comments: number
    killerScore: number
    qualityScore: number
  }> = []
  const cafeMedium: Array<{ title: string; cafeId: string; boardName: string | null; desireCategory: string | null; matchedKeywords: string }> = []
  let cafeWeak = 0

  for (const post of cafePosts) {
    const classification = classifyMenopauseCandidate({ title: post.title, content: post.content })
    const path = post.isPopular ? 'popular' : 'main'
    increment(
      cafeLevels,
      joinKey(
        post.cafeId,
        post.desireCategory,
        path,
        classification.level,
        classification.reason,
        classification.shouldRoute ? classification.category : '-',
      ),
    )

    if (classification.shouldRoute) {
      cafeStrong.push({
        title: post.title,
        cafeId: post.cafeId,
        boardName: post.boardName,
        desireCategory: post.desireCategory,
        path,
        newCategory: classification.category,
        matchedKeywords: classification.matchedKeywords.join(','),
        comments: post.commentCount,
        killerScore: post.killerScore,
        qualityScore: post.qualityScore,
      })
    } else if (classification.level === 'medium') {
      cafeMedium.push({
        title: post.title,
        cafeId: post.cafeId,
        boardName: post.boardName,
        desireCategory: post.desireCategory,
        matchedKeywords: classification.matchedKeywords.join(','),
      })
    } else if (classification.level === 'weak') {
      cafeWeak += 1
    }
  }

  const publishedStrong24h = publishedStrong.filter(post => post.createdAt >= since24h).length

  console.log(`DRYRUN_AT=${now.toISOString()}`)
  console.log(`WINDOW_DAYS=${DAYS}`)
  console.log(`PUBLISHED_POSTS=${posts.length}`)
  console.log(`PUBLISHED_STRONG_NON_MENOPAUSE=${publishedStrong.length}`)
  console.log(`PUBLISHED_STRONG_24H=${publishedStrong24h}`)
  console.log(`PUBLISHED_MEDIUM=${publishedMedium.length}`)
  console.log(`PUBLISHED_WEAK=${publishedWeak}`)
  console.log(`CAFE_CANDIDATES=${cafePosts.length}`)
  console.log(`CAFE_STRONG=${cafeStrong.length}`)
  console.log(`CAFE_MEDIUM=${cafeMedium.length}`)
  console.log(`CAFE_WEAK=${cafeWeak}`)

  printMap('published board|source|category', publishedSummary)
  printMap('published classifier board|source|level|reason|category', publishedLevels)
  printMap('cafe classifier cafe|desire|path|level|reason|category', cafeLevels)

  console.log(`\n## Published strong non-MENOPAUSE sample top ${SAMPLE_LIMIT}`)
  for (const post of publishedStrong.slice(0, SAMPLE_LIMIT)) {
    console.log(
      `${post.boardType}\t${post.source}\t${post.category ?? 'null'}\t=>${post.newCategory}\t${post.matchedKeywords}\t💬${post.comments} ❤${post.likes} 👁${post.views}\t${post.title}\t/${post.slug ?? ''}`,
    )
  }

  console.log(`\n## Published medium sample top ${Math.min(SAMPLE_LIMIT, 20)}`)
  for (const post of publishedMedium.slice(0, Math.min(SAMPLE_LIMIT, 20))) {
    console.log(`${post.boardType}\t${post.source}\t${post.category ?? 'null'}\t${post.matchedKeywords}\t${post.title}`)
  }

  console.log(`\n## Cafe strong sample top ${SAMPLE_LIMIT}`)
  for (const post of cafeStrong.slice(0, SAMPLE_LIMIT)) {
    console.log(
      `${post.cafeId}\t${post.boardName ?? 'null'}\t${post.desireCategory ?? 'null'}\t${post.path}\t=>${post.newCategory}\t${post.matchedKeywords}\t💬${post.comments} K${post.killerScore} Q${post.qualityScore}\t${post.title}`,
    )
  }

  console.log(`\n## Cafe medium sample top ${Math.min(SAMPLE_LIMIT, 20)}`)
  for (const post of cafeMedium.slice(0, Math.min(SAMPLE_LIMIT, 20))) {
    console.log(`${post.cafeId}\t${post.boardName ?? 'null'}\t${post.desireCategory ?? 'null'}\t${post.matchedKeywords}\t${post.title}`)
  }
}

main()
  .catch(error => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
