#!/usr/bin/env tsx
/**
 * North Star 측정 — 주간 재방문 참여 유저 수 (read-only)
 *
 * 실행: npx tsx scripts/measure-north-star.ts
 *
 * ## 정의 (docs/constitution/NORTH_STAR.md v5.0 §12)
 *   최근 7일 안에 **서로 다른 KST 날짜 2일 이상 방문**했고,
 *   **글 또는 댓글을 1회 이상** 남긴 **고유 로그인 사용자 수**.
 *
 * ## 왜 이 지표인가
 *   봇은 재방문하지 않고, 봇 글은 이 숫자를 올리지 못한다.
 *   "다시 왔다"(리텐션) + "말했다"(참여)를 한 숫자로 본다.
 *   DAU·PV·SEO 클릭은 봇 발행과 검색 유입만으로도 오르므로 North Star가 아니다.
 *
 * ## 이 스크립트는 가드가 아니라 계측 도구다
 *   숫자가 낮다고 fail 처리하지 않는다. 측정 자체가 실패했을 때만 exit 1.
 *   임계값을 걸면 매번 빨간불이 뜨고, 그러면 아무도 보지 않게 된다.
 *
 * DB write 없음 · Raw SQL 없음 · 운영 파이프라인 무접점.
 */
import dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../src/generated/prisma/client'

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) })

const DAY_MS = 86_400_000
const KST_OFFSET_MS = 9 * 3_600_000
/** 재방문 판정 기준 — 7일·28일 모두 동일하게 적용한다(정의를 하나로 유지) */
const MIN_DISTINCT_DAYS = 2
/** 봇 계정 식별 규칙. Comment에는 source 필드가 없어 이 규칙이 유일한 방어선이다 */
const BOT_EMAIL_SUFFIX = '@unao.bot'

interface WindowResult {
  days: number
  northStar: number
  participants: number
  revisitors: number
  postAuthors: number
  commentAuthorsRaw: number
  commentAuthorsExBot: number
  loggedInVisitors: number
  eventTotal: number
  eventWithUserId: number
}

/** UTC Date → KST 기준 YYYY-MM-DD. Raw SQL(AT TIME ZONE)을 쓸 수 없어 앱에서 변환한다 */
function kstDateKey(d: Date): string {
  return new Date(d.getTime() + KST_OFFSET_MS).toISOString().slice(0, 10)
}

async function measure(days: number, botIds: Set<string>): Promise<WindowResult> {
  const since = new Date(Date.now() - days * DAY_MS)

  // ── 참여: 글 (source=USER 로 봇·시트 글을 구조적으로 제외) ────────────────
  const postGroups = await prisma.post.groupBy({
    by: ['authorId'],
    where: { createdAt: { gte: since }, source: 'USER' },
  })
  const postAuthorIds = new Set(
    postGroups.map((g) => g.authorId).filter((id): id is string => !!id && !botIds.has(id)),
  )

  // ── 참여: 댓글 (Comment에 source가 없어 봇은 계정 목록으로만 걸러진다) ──────
  const commentGroups = await prisma.comment.groupBy({
    by: ['authorId'],
    where: { createdAt: { gte: since }, authorId: { not: null } },
  })
  const commentAuthorsRaw = commentGroups.length
  const commentAuthorIds = new Set(
    commentGroups.map((g) => g.authorId).filter((id): id is string => !!id && !botIds.has(id)),
  )

  const participants = new Set([...postAuthorIds, ...commentAuthorIds])

  // ── 재방문: EventLog에서 사용자별 서로 다른 KST 날짜 수 ───────────────────
  const eventTotal = await prisma.eventLog.count({
    where: { createdAt: { gte: since }, isBot: false },
  })
  const visits = await prisma.eventLog.findMany({
    where: { createdAt: { gte: since }, isBot: false, userId: { not: null } },
    select: { userId: true, createdAt: true },
  })

  const daysByUser = new Map<string, Set<string>>()
  for (const v of visits) {
    if (!v.userId) continue
    let set = daysByUser.get(v.userId)
    if (!set) { set = new Set(); daysByUser.set(v.userId, set) }
    set.add(kstDateKey(v.createdAt))
  }
  const revisitors = new Set(
    [...daysByUser].filter(([, d]) => d.size >= MIN_DISTINCT_DAYS).map(([u]) => u),
  )

  const northStar = [...participants].filter((id) => revisitors.has(id)).length

  return {
    days,
    northStar,
    participants: participants.size,
    revisitors: revisitors.size,
    postAuthors: postAuthorIds.size,
    commentAuthorsRaw,
    commentAuthorsExBot: commentAuthorIds.size,
    loggedInVisitors: daysByUser.size,
    eventTotal,
    eventWithUserId: visits.length,
  }
}

function printWindow(r: WindowResult, label: string): void {
  const pct = r.eventTotal > 0 ? (r.eventWithUserId / r.eventTotal) * 100 : 0
  console.log(`\n[${r.days}일 분해] ${label}`)
  console.log(`  참여 유저          ${String(r.participants).padStart(5)}명   (글 ∪ 댓글, 봇 제외)`)
  console.log(`    ├ 글 작성        ${String(r.postAuthors).padStart(5)}명   (source=USER)`)
  console.log(`    └ 댓글 작성      ${String(r.commentAuthorsExBot).padStart(5)}명   (봇 제외 전 ${r.commentAuthorsRaw}명)`)
  console.log(`  재방문 유저        ${String(r.revisitors).padStart(5)}명   (로그인 방문 ${r.loggedInVisitors}명 중 ${MIN_DISTINCT_DAYS}일 이상)`)
  console.log(`  ★ 교집합          ${String(r.northStar).padStart(5)}명   ← North Star`)
  console.log(`  EventLog           ${r.eventTotal.toLocaleString()}건 중 userId 보유 ${r.eventWithUserId.toLocaleString()}건 (${pct.toFixed(1)}%)`)
}

async function main(): Promise<void> {
  const now = new Date()
  console.log('North Star — 주간 재방문 참여 유저 수 (read-only)')
  console.log(`기준: 최근 N일 안에 서로 다른 KST 날짜 ${MIN_DISTINCT_DAYS}일 이상 방문 + 글/댓글 1회 이상`)
  console.log(`측정: ${new Date(now.getTime() + KST_OFFSET_MS).toISOString().replace('T', ' ').slice(0, 16)} KST`)

  const bots = await prisma.user.findMany({
    where: { email: { endsWith: BOT_EMAIL_SUFFIX } },
    select: { id: true },
  })
  const botIds = new Set(bots.map((b) => b.id))

  const w7 = await measure(7, botIds)
  const w28 = await measure(28, botIds)

  console.log('\n' + '━'.repeat(56))
  console.log(`  ★ North Star (7일)    ${String(w7.northStar).padStart(5)}명   ← 공식 지표`)
  console.log(`    North Star (28일)   ${String(w28.northStar).padStart(5)}명   ← 추세 참고용`)
  console.log('━'.repeat(56))

  printWindow(w7, '공식')
  printWindow(w28, '추세 참고')

  console.log(`\n[봇 제외] 봇 계정 ${bots.length}명 (email ${BOT_EMAIL_SUFFIX})`)

  console.log('\n[해석 주의]')
  console.log('  · 7일과 28일을 직접 비교하지 말 것 — 28일은 "2일 이상" 조건이 느슨해져')
  console.log('    사람 수가 비례 이상으로 늘어난다. 각각의 시계열로만 본다.')
  console.log('  · 28일은 공식 목표가 아니라 추세 판단용이다. 7일 표본이 작을 때')
  console.log('    노이즈와 실제 악화를 구분하기 위해 함께 본다.')

  console.log('\n[측정 한계 — 숫자만 보고 판단하지 말 것]')
  console.log('  1. Comment에 source 필드가 없다. 봇 댓글은 email 규칙으로만 걸러지므로,')
  console.log('     그 규칙을 벗어난 봇 계정이 생기면 조용히 집계에 섞인다.')
  console.log('  2. 비회원 댓글(guestNickname)은 authorId가 null이라 제외된다.')
  console.log('  3. 재방문 판정은 EventLog 적재에 의존한다. 로그인 사용자 페이지뷰가')
  console.log('     누락되면 참여했는데 재방문으로 잡히지 않는다.')
  console.log('  4. KST 날짜 경계는 앱에서 +9h 변환으로 처리한다(Raw SQL 미사용).')

  await prisma.$disconnect()
}

main().catch(async (e) => {
  console.error('\n❌ 측정 실패:', e instanceof Error ? e.message : e)
  await prisma.$disconnect().catch(() => {})
  process.exit(1)
})
