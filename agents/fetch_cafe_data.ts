/* eslint-disable @typescript-eslint/no-explicit-any */
import { Pool } from 'pg'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../src/generated/prisma/client'
import { config } from 'dotenv'
import { resolve } from 'path'

config({ path: resolve(process.cwd(), '.env.local') })

const raw = process.env.DIRECT_URL ?? process.env.DATABASE_URL ?? ''
const u = new URL(raw)
const pool = new Pool({
  host: u.hostname,
  port: parseInt(u.port, 10) || 5432,
  user: decodeURIComponent(u.username),
  password: decodeURIComponent(u.password),
  database: u.pathname.slice(1) || 'postgres',
  ssl: undefined,
  max: 3,
})
const adapter = new PrismaPg(pool)
const prisma = new PrismaClient({ adapter } as any)

async function main() {
  const total = await (prisma as any).cafePost.count()
  const byCafe = await (prisma as any).cafePost.groupBy({
    by: ['cafeId', 'cafeName'],
    _count: { id: true },
    _avg: { viewCount: true, commentCount: true, likeCount: true }
  })
  const byCategory = await (prisma as any).cafePost.groupBy({
    by: ['boardCategory'],
    _count: { id: true },
    orderBy: { _count: { id: 'desc' } }
  })
  const dateRange = await (prisma as any).cafePost.aggregate({
    _min: { postedAt: true },
    _max: { postedAt: true }
  })
  const topByView = await (prisma as any).cafePost.findMany({
    orderBy: { viewCount: 'desc' },
    take: 30,
    select: { title: true, cafeId: true, boardCategory: true, boardName: true, viewCount: true, commentCount: true, likeCount: true }
  })
  const topByComment = await (prisma as any).cafePost.findMany({
    orderBy: { commentCount: 'desc' },
    take: 30,
    select: { title: true, cafeId: true, boardCategory: true, boardName: true, viewCount: true, commentCount: true, likeCount: true }
  })
  const allPosts = await (prisma as any).cafePost.findMany({
    select: { topics: true, title: true, boardCategory: true }
  })
  const topicCount: Record<string, number> = {}
  for (const p of allPosts) {
    for (const t of (p.topics || [])) topicCount[t] = (topicCount[t] || 0) + 1
  }
  const topTopics = Object.entries(topicCount).sort((a, b) => b[1] - a[1]).slice(0, 40)
  const recentTitles = await (prisma as any).cafePost.findMany({
    orderBy: { crawledAt: 'desc' },
    take: 100,
    select: { title: true, cafeId: true, boardCategory: true, viewCount: true, commentCount: true }
  })

  console.log(JSON.stringify({ total, byCafe, byCategory, dateRange, topByView, topByComment, topTopics, recentTitles }, null, 2))
  await (prisma as any).$disconnect()
  await pool.end()
}

main().catch(e => { console.error(e); process.exit(1) })
