/**
 * ops-daily-report.ts — read-only daily operations summary
 *
 * Usage:
 *   cd agents && npx tsx --env-file=../.env.local scripts/ops-daily-report.ts
 *   cd agents && npx tsx --env-file=../.env.local scripts/ops-daily-report.ts --days 2
 *
 * DISPATCH ONLY — founder/operator runs this manually when checking daily ops.
 * This script is read-only: it only queries BotLog, CafePost, and Post.
 */

import { prisma, disconnect } from '../core/db.js'

type BotStatus = 'SUCCESS' | 'PARTIAL' | 'FAILED' | 'PENDING' | 'SKIP'
type PostSource = 'USER' | 'BOT' | 'ADMIN' | 'SHEET'

interface BotLogRow {
  id: string
  botType: string
  status: BotStatus
  action: string | null
  details: string | null
  collectedCount: number
  filteredCount: number
  publishedCount: number
  reviewPendingCount: number
  itemCount: number
  executionTimeMs: number
  executedAt: Date
}

interface CafePostRow {
  cafeId: string
  cafeName: string
  boardName: string | null
  isUsable: boolean
  usedAt: Date | null
}

interface PostRow {
  source: PostSource
  sourceSite: string | null
  boardType: string
  status: string
}

interface OpsPrisma {
  botLog: {
    findMany(args: {
      where: {
        executedAt: { gte: Date }
        status?: { in: BotStatus[] }
      }
      orderBy: { executedAt: 'desc' }
      select: Record<keyof BotLogRow, true>
    }): Promise<BotLogRow[]>
  }
  cafePost: {
    findMany(args: {
      where: { crawledAt: { gte: Date } }
      select: Record<keyof CafePostRow, true>
    }): Promise<CafePostRow[]>
  }
  post: {
    findMany(args: {
      where: { createdAt: { gte: Date } }
      select: Record<keyof PostRow, true>
    }): Promise<PostRow[]>
  }
}

const db = prisma as unknown as OpsPrisma

function parseDays(): number {
  const idx = process.argv.indexOf('--days')
  const raw = idx >= 0 ? process.argv[idx + 1] : undefined
  const parsed = raw ? Number.parseInt(raw, 10) : 1
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1
}

function sinceFromDays(days: number): Date {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000)
}

function kst(date: Date): string {
  return new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date)
}

function truncate(value: string | null, max = 90): string {
  if (!value) return '-'
  const normalized = value.replace(/\s+/g, ' ').trim()
  return normalized.length > max ? `${normalized.slice(0, max - 1)}…` : normalized
}

function increment(map: Map<string, number>, key: string, by = 1) {
  map.set(key, (map.get(key) ?? 0) + by)
}

function toRows(map: Map<string, number>, limit = 12): Array<[string, number]> {
  return [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit)
}

function table(headers: string[], rows: string[][]): string {
  if (rows.length === 0) return '_없음_'
  const sep = headers.map(() => '---')
  return [
    `| ${headers.join(' | ')} |`,
    `| ${sep.join(' | ')} |`,
    ...rows.map(row => `| ${row.join(' | ')} |`),
  ].join('\n')
}

async function main() {
  const days = parseDays()
  const since = sinceFromDays(days)

  const [problemLogs, recentLogs, cafePosts, posts] = await Promise.all([
    db.botLog.findMany({
      where: {
        executedAt: { gte: since },
        status: { in: ['FAILED', 'PARTIAL', 'SKIP'] },
      },
      orderBy: { executedAt: 'desc' },
      select: {
        id: true,
        botType: true,
        status: true,
        action: true,
        details: true,
        collectedCount: true,
        filteredCount: true,
        publishedCount: true,
        reviewPendingCount: true,
        itemCount: true,
        executionTimeMs: true,
        executedAt: true,
      },
    }),
    db.botLog.findMany({
      where: { executedAt: { gte: since } },
      orderBy: { executedAt: 'desc' },
      select: {
        id: true,
        botType: true,
        status: true,
        action: true,
        details: true,
        collectedCount: true,
        filteredCount: true,
        publishedCount: true,
        reviewPendingCount: true,
        itemCount: true,
        executionTimeMs: true,
        executedAt: true,
      },
    }),
    db.cafePost.findMany({
      where: { crawledAt: { gte: since } },
      select: {
        cafeId: true,
        cafeName: true,
        boardName: true,
        isUsable: true,
        usedAt: true,
      },
    }),
    db.post.findMany({
      where: { createdAt: { gte: since } },
      select: {
        source: true,
        sourceSite: true,
        boardType: true,
        status: true,
      },
    }),
  ])

  const logStatus = new Map<string, number>()
  const logActions = new Map<string, number>()
  for (const log of recentLogs) {
    increment(logStatus, log.status)
    increment(logActions, `${log.botType}:${log.action ?? '-'}`)
  }

  const cafeBySource = new Map<string, number>()
  const cafeUsableBySource = new Map<string, number>()
  const cafeUsedBySource = new Map<string, number>()
  const cafeByBoard = new Map<string, number>()
  for (const row of cafePosts) {
    const source = `${row.cafeId} (${row.cafeName})`
    increment(cafeBySource, source)
    if (row.isUsable) increment(cafeUsableBySource, source)
    if (row.usedAt) increment(cafeUsedBySource, source)
    increment(cafeByBoard, `${row.cafeId}:${row.boardName ?? 'unknown'}`)
  }

  const postsBySource = new Map<string, number>()
  const postsByBoard = new Map<string, number>()
  for (const post of posts) {
    increment(postsBySource, `${post.source}${post.sourceSite ? `:${post.sourceSite}` : ''}`)
    increment(postsByBoard, `${post.boardType}:${post.status}`)
  }

  const failedCount = problemLogs.filter(log => log.status === 'FAILED').length
  const partialCount = problemLogs.filter(log => log.status === 'PARTIAL').length
  const skipCount = problemLogs.filter(log => log.status === 'SKIP').length

  console.log(`# 운영 리포트 v1 (${days}일)`)
  console.log('')
  console.log(`- 기준: ${kst(since)} KST 이후`)
  console.log(`- BotLog 문제: FAILED ${failedCount} / PARTIAL ${partialCount} / SKIP ${skipCount}`)
  console.log(`- CafePost 수집: ${cafePosts.length}건`)
  console.log(`- 신규 Post: ${posts.length}건`)
  console.log('')

  console.log('## 1. 문제 BotLog')
  console.log(table(
    ['시각(KST)', '상태', 'bot', 'action', 'items', 'ms', 'details'],
    problemLogs.slice(0, 20).map(log => [
      kst(log.executedAt),
      log.status,
      log.botType,
      log.action ?? '-',
      String(log.itemCount || log.publishedCount || log.collectedCount || 0),
      String(log.executionTimeMs),
      truncate(log.details),
    ]),
  ))
  console.log('')

  console.log('## 2. BotLog 상태 요약')
  console.log(table(
    ['상태', '건수'],
    toRows(logStatus).map(([key, count]) => [key, String(count)]),
  ))
  console.log('')

  console.log('## 3. 최근 실행 action 상위')
  console.log(table(
    ['action', '건수'],
    toRows(logActions, 15).map(([key, count]) => [key, String(count)]),
  ))
  console.log('')

  console.log('## 4. CafePost source별 수집/사용')
  console.log(table(
    ['source', '수집', 'usable', 'used'],
    toRows(cafeBySource).map(([source, count]) => [
      source,
      String(count),
      String(cafeUsableBySource.get(source) ?? 0),
      String(cafeUsedBySource.get(source) ?? 0),
    ]),
  ))
  console.log('')

  console.log('## 5. CafePost boardName 상위')
  console.log(table(
    ['board', '건수'],
    toRows(cafeByBoard, 15).map(([key, count]) => [key, String(count)]),
  ))
  console.log('')

  console.log('## 6. 신규 Post source/board')
  console.log(table(
    ['source', '건수'],
    toRows(postsBySource).map(([key, count]) => [key, String(count)]),
  ))
  console.log('')
  console.log(table(
    ['board:status', '건수'],
    toRows(postsByBoard).map(([key, count]) => [key, String(count)]),
  ))
}

main()
  .catch(error => {
    console.error('[ops-daily-report] failed')
    console.error(error)
    process.exitCode = 1
  })
  .finally(async () => {
    await disconnect()
  })
