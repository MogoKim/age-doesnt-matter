// 일자별 공식 운영지표 스냅샷 수집 → DailyKpiSnapshot upsert.
//
// 단일 진실의 원천 = EventLog 내부 DB. GA4/CDO D7은 수집중단(stale)이라 공식 지표에서 제외.
// 집계 표준(admin dashboard 전 지표와 통일):
//   - 실고객 = providerId 순수숫자(^\d+$) AND role != ADMIN
//   - 봇 제외 = EventLog.isBot = false
//   - 내부 제외 = path '/admin' OR botType 'founder' 세션 + role=ADMIN user
//   - 날짜 = KST(UTC+9)
//
// 사용:
//   npx tsx agents/scripts/collect-dashboard-snapshot.ts                 # 오늘(KST) upsert
//   npx tsx agents/scripts/collect-dashboard-snapshot.ts --date=2026-06-29
//   npx tsx agents/scripts/collect-dashboard-snapshot.ts --date=2026-06-29 --dry-run   # 계산만(쓰기 X)
//
// LOCAL ONLY 아님 — GHA cron 연결은 후속(현재 수동/백필용). Raw SQL 미사용(Prisma만).
import { config } from 'dotenv'
import type { PrismaClient } from '../../src/generated/prisma/client'
config({ path: '.env.local' }) // 로컬 실행용. GHA는 secrets로 env 주입되어 .env.local 없어도 무방.

// dotenv가 먼저 적용되도록 DB 모듈은 동적 import (core/db는 로드시 process.env.DATABASE_URL 사용)
const { prisma, disconnect } = (await import('../core/db.js')) as unknown as {
  prisma: PrismaClient
  disconnect: () => Promise<void>
}

const DAY = 86_400_000
const isReal = (pid?: string | null): boolean => !!pid && /^\d+$/.test(pid)
const kstDayIdx = (t: number) => Math.floor((t + 9 * 3_600_000) / DAY)
const pct = (n: number, d: number): number | null => (d > 0 ? Math.round((n / d) * 1000) / 10 : null)

// KST 날짜 문자열(YYYY-MM-DD) → 그 날 00:00~24:00 KST 경계(UTC Date)
function kstDayBounds(dateStr: string): { start: Date; end: Date } {
  const start = new Date(`${dateStr}T00:00:00+09:00`)
  const end = new Date(start.getTime() + DAY)
  return { start, end }
}
function todayKstStr(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date())
}

// admin.insights.ts classifyChannel와 동일 규칙(통일).
function classifyChannel(ref: string, src: string, med: string): string {
  if (med === 'kakao_share') return '카카오 레퍼럴'
  if (src === 'threads') return 'Threads'
  if (src === 'instagram' && med === 'social') return 'Instagram'
  if (src === 'facebook' && med === 'social') return 'Facebook'
  if (src === 'naver' && med === 'blog') return '네이버 블로그'
  if (src === 'google-play' || ref.startsWith('android-app://')) return 'TWA 앱'
  if (ref.includes('kauth.kakao') || ref.includes('accounts.kakao')) return '직접입력'
  if (ref.includes('google')) return 'Google'
  if (ref.includes('naver')) return 'Naver'
  if (ref.includes('youtube')) return 'YouTube'
  if (ref.includes('kakao')) return 'Kakao'
  if (ref.includes('t.co') || ref.includes('twitter') || ref.includes('x.com')) return 'Twitter/X'
  if (ref.includes('instagram')) return 'Instagram'
  if (ref.includes('facebook') || ref.includes('fb.')) return 'Facebook'
  if (ref === '') return '직접입력'
  return '기타'
}

const str = (v: unknown) => (typeof v === 'string' ? v : '')

// 내부 세션(/admin·founder) id 집합 — 기간 since~until
async function getInternalSessionIds(since: Date, until: Date): Promise<Set<string>> {
  const rows = await prisma.eventLog.findMany({
    where: {
      sessionId: { not: null },
      createdAt: { gte: since, lt: until },
      OR: [{ path: { startsWith: '/admin' } }, { botType: 'founder' }],
    },
    select: { sessionId: true },
    distinct: ['sessionId'],
  })
  return new Set(rows.map((r: { sessionId: string | null }) => r.sessionId).filter((s: string | null): s is string => !!s))
}

// EventLog 비회원 D-N 재방문율 — 성숙 코호트만 분모(아직 N일 안 지난 코호트는 분모 제외, 실패 아님)
async function computeGuestRetention(asOfEnd: Date, windowDays = 60) {
  const nowIdx = kstDayIdx(asOfEnd.getTime() - 1)
  const since = new Date(asOfEnd.getTime() - windowDays * DAY)
  const internal = await getInternalSessionIds(since, asOfEnd)
  const events = await prisma.eventLog.findMany({
    where: { eventName: 'page_view', isBot: false, userId: null, sessionId: { not: null }, createdAt: { gte: since, lt: asOfEnd } },
    select: { sessionId: true, createdAt: true },
    orderBy: { createdAt: 'asc' },
  })
  const active = new Map<string, Set<number>>()
  for (const e of events as { sessionId: string; createdAt: Date }[]) {
    if (internal.has(e.sessionId)) continue
    let s = active.get(e.sessionId)
    if (!s) { s = new Set(); active.set(e.sessionId, s) }
    s.add(kstDayIdx(e.createdAt.getTime()))
  }
  const offs = [1, 3, 7, 14, 30] as const
  const denom: Record<number, number> = { 1: 0, 3: 0, 7: 0, 14: 0, 30: 0 }
  const ret: Record<number, number> = { 1: 0, 3: 0, 7: 0, 14: 0, 30: 0 }
  let immatureExcluded = 0
  for (const days of active.values()) {
    let firstDay = Infinity
    for (const d of days) if (d < firstDay) firstDay = d
    for (const off of offs) {
      if (firstDay + off > nowIdx) { if (off === 7) immatureExcluded++; continue }
      denom[off]++
      for (const d of days) { if (d >= firstDay + off) { ret[off]++; break } }
    }
  }
  const pt = (off: number) => ({ denom: denom[off], returned: ret[off], rate: pct(ret[off], denom[off]) })
  return { retention: { d1: pt(1), d3: pt(3), d7: pt(7), d14: pt(14), d30: pt(30) }, guestSessions: active.size, immatureExcluded }
}

async function collect(dateStr: string) {
  const { start, end } = kstDayBounds(dateStr)
  const win30 = new Date(end.getTime() - 30 * DAY)
  const win7 = new Date(end.getTime() - 7 * DAY)

  // 내부 세션(그 날) + admin user
  const [internalSids, adminUsers] = await Promise.all([
    getInternalSessionIds(start, end),
    prisma.user.findMany({ where: { role: 'ADMIN' }, select: { id: true } }),
  ])
  const adminIds = new Set(adminUsers.map((u: { id: string }) => u.id))

  // 그 날 page_view (봇 제외) — 회원/비회원/봇세션 분리
  const pvRows = await prisma.eventLog.findMany({
    where: { eventName: 'page_view', isBot: false, createdAt: { gte: start, lt: end } },
    select: { sessionId: true, userId: true },
  })
  const rows = pvRows.filter((r: { sessionId: string | null }) => !(r.sessionId && internalSids.has(r.sessionId)))
  const uids = [...new Set(rows.filter((r) => r.userId).map((r) => r.userId as string))]
  const userRows = uids.length
    ? await prisma.user.findMany({ where: { id: { in: uids } }, select: { id: true, providerId: true } })
    : []
  const realUserSet = new Set(
    (userRows as { id: string; providerId: string | null }[])
      .filter((u) => isReal(u.providerId) && !adminIds.has(u.id))
      .map((u) => u.id),
  )
  const memberSessions = new Set<string>()
  const botSessions = new Set<string>()
  let memberPv = 0
  let guestPv = 0
  for (const r of rows as { sessionId: string | null; userId: string | null }[]) {
    if (r.userId && realUserSet.has(r.userId)) {
      memberPv++
      if (r.sessionId) memberSessions.add(r.sessionId)
    } else if (r.userId) {
      if (r.sessionId) botSessions.add(r.sessionId)
    } else {
      guestPv++
    }
  }
  const guestSessions = new Set<string>()
  for (const r of rows as { sessionId: string | null; userId: string | null }[]) {
    if (r.sessionId && !memberSessions.has(r.sessionId) && !botSessions.has(r.sessionId)) guestSessions.add(r.sessionId)
  }
  const memberUv = memberSessions.size
  const guestUv = guestSessions.size
  const uv = memberUv + guestUv
  const pv = memberPv + guestPv

  // 신규가입(실고객) · 글 · 댓글
  const [newUsersRaw, userPosts, cmtsRaw] = await Promise.all([
    prisma.user.findMany({ where: { createdAt: { gte: start, lt: end } }, select: { providerId: true } }),
    prisma.post.count({ where: { createdAt: { gte: start, lt: end }, status: 'PUBLISHED', source: 'USER' } }),
    prisma.comment.findMany({
      where: { createdAt: { gte: start, lt: end }, status: 'ACTIVE' },
      select: { author: { select: { providerId: true } } },
    }),
  ])
  const newSignups = (newUsersRaw as { providerId: string | null }[]).filter((u) => isReal(u.providerId)).length
  const userComments = (cmtsRaw as { author: { providerId: string | null } | null }[]).filter((c) => isReal(c.author?.providerId)).length
  const conversionRate = pct(newSignups, uv)

  // 실고객 누적(그 날 종료 시점) — ACTIVE, role!=ADMIN, providerId 숫자
  const allActive = await prisma.user.findMany({
    where: { status: 'ACTIVE', createdAt: { lt: end } },
    select: { providerId: true, role: true },
  })
  const realCustomers = (allActive as { providerId: string | null; role: string }[]).filter((u) => isReal(u.providerId) && u.role !== 'ADMIN').length

  // WAU — 그 날 종료 기준 최근 7일 활성 실고객
  const realUsersForWau = await prisma.user.findMany({
    where: { status: 'ACTIVE', role: { not: 'ADMIN' } },
    select: { id: true, providerId: true },
  })
  const wauRealIds = (realUsersForWau as { id: string; providerId: string | null }[]).filter((u) => isReal(u.providerId)).map((u) => u.id)
  const wauEvents = wauRealIds.length
    ? await prisma.eventLog.findMany({
        where: { userId: { in: wauRealIds }, eventName: { in: ['page_view', 'login'] }, createdAt: { gte: win7, lt: end } },
        select: { userId: true },
      })
    : []
  const wau = new Set((wauEvents as { userId: string | null }[]).map((e) => e.userId).filter(Boolean)).size

  // 채널 breakdown (30일/30일 기간 일치)
  const internal30 = await getInternalSessionIds(win30, end)
  const ev30 = await prisma.eventLog.findMany({
    where: { eventName: 'page_view', isBot: false, sessionId: { not: null }, createdAt: { gte: win30, lt: end } },
    select: { sessionId: true, referrer: true, properties: true, createdAt: true },
    orderBy: { createdAt: 'asc' },
  })
  const firstMeta: Record<string, { ref: string; src: string; med: string }> = {}
  const sess = new Set<string>()
  for (const e of ev30 as { sessionId: string; referrer: string | null; properties: Record<string, unknown> | null }[]) {
    if (internal30.has(e.sessionId)) continue
    sess.add(e.sessionId)
    if (e.sessionId in firstMeta) continue
    firstMeta[e.sessionId] = { ref: str(e.referrer), src: str(e.properties?.utm_source), med: str(e.properties?.utm_medium) }
  }
  const chanSessions: Record<string, number> = {}
  for (const s of sess) {
    const m = firstMeta[s] ?? { ref: '', src: '', med: '' }
    const c = classifyChannel(m.ref, m.src, m.med)
    chanSessions[c] = (chanSessions[c] ?? 0) + 1
  }
  // 30일 가입자 first-touch 귀속
  const signups30dUsers = await prisma.user.findMany({
    where: { createdAt: { gte: win30, lt: end } },
    select: { id: true, providerId: true },
  })
  const real30Ids = (signups30dUsers as { id: string; providerId: string | null }[]).filter((u) => isReal(u.providerId)).map((u) => u.id)
  const ftPv = real30Ids.length
    ? await prisma.eventLog.findMany({
        where: { userId: { in: real30Ids }, eventName: 'page_view' },
        select: { userId: true, referrer: true, properties: true, createdAt: true },
        orderBy: { createdAt: 'asc' },
      })
    : []
  const chanSignups: Record<string, number> = {}
  const seenFt = new Set<string>()
  for (const e of ftPv as { userId: string | null; referrer: string | null; properties: Record<string, unknown> | null }[]) {
    if (!e.userId || seenFt.has(e.userId)) continue
    seenFt.add(e.userId)
    const c = classifyChannel(str(e.referrer), str(e.properties?.utm_source), str(e.properties?.utm_medium))
    chanSignups[c] = (chanSignups[c] ?? 0) + 1
  }
  const channels = [...new Set([...Object.keys(chanSessions), ...Object.keys(chanSignups)])]
    .map((channel) => {
      const sessions = chanSessions[channel] ?? 0
      const signups30d = chanSignups[channel] ?? 0
      return { channel, sessions, signups30d, signupRate: pct(signups30d, sessions) }
    })
    .sort((a, b) => b.sessions - a.sessions)

  // 리텐션(비회원 EventLog, 성숙 코호트)
  const { retention, immatureExcluded } = await computeGuestRetention(end)

  const dataQuality = {
    ga4: 'stale' as const,
    source: 'eventlog',
    eventLogPageViews: pvRows.length,
    internalSessionsExcluded: internalSids.size,
    botSessionsExcluded: botSessions.size,
    immatureCohortsExcludedD7: immatureExcluded,
    // realCustomers 공식 기준 = ACTIVE 실고객(providerId 숫자 & role!=ADMIN). BANNED/WITHDRAWN 제외.
    // (insights realUserCount는 상태무관 누적이라 더 큼 — 의도된 다른 정의)
    realCustomersBasis: 'ACTIVE' as const,
    asOf: dateStr,
  }

  return {
    date: dateStr,
    uv, pv, memberUv, guestUv, memberPv, guestPv,
    newSignups, conversionRate,
    userPosts, userComments,
    wau, realCustomers,
    channels, retention, dataQuality,
  }
}

async function main() {
  const args = process.argv.slice(2)
  const dryRun = args.includes('--dry-run')
  const dateArg = args.find((a) => a.startsWith('--date='))?.split('=')[1]
  const dateStr = dateArg ?? todayKstStr()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    console.error(`[snapshot] 잘못된 --date 형식: "${dateStr}" (YYYY-MM-DD 필요)`)
    process.exit(1)
  }

  console.log(`[snapshot] 집계 시작 date=${dateStr} dryRun=${dryRun}`)
  const snap = await collect(dateStr)
  console.log(
    `[snapshot] ${snap.date} | UV ${snap.uv}(회${snap.memberUv}/비${snap.guestUv}) PV ${snap.pv} | ` +
    `가입 ${snap.newSignups} 전환 ${snap.conversionRate ?? '–'}% | 글 ${snap.userPosts} 댓 ${snap.userComments} | ` +
    `WAU ${snap.wau} 실고객 ${snap.realCustomers} | D1 ${snap.retention.d1.rate ?? '–'}%(분모${snap.retention.d1.denom}) ` +
    `D7 ${snap.retention.d7.rate ?? '–'}%(분모${snap.retention.d7.denom})`,
  )
  console.log(`[snapshot] 채널 ${snap.channels.length}개:`, snap.channels.slice(0, 5).map((c) => `${c.channel}(s${c.sessions}/가${c.signups30d})`).join(', '))

  if (dryRun) {
    console.log('[snapshot] --dry-run — DB 쓰기 생략')
    return
  }

  const { date, ...rest } = snap
  await prisma.dailyKpiSnapshot.upsert({
    where: { date },
    create: { date, ...rest },
    update: { ...rest },
  })
  console.log(`[snapshot] upsert 완료: ${date}`)
}

main()
  .then(() => disconnect())
  .then(() => process.exit(0))
  .catch(async (e) => {
    console.error('[snapshot] 실패:', e)
    await disconnect().catch(() => {})
    process.exit(1)
  })
