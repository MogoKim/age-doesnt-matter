import { prisma } from '@/lib/prisma'
import { unstable_cache } from 'next/cache'

// 리텐션 4분면 (TWA/웹 × 회원/비회원) D1/D3/D7.
// 회원 = providerId 순수숫자(^\d+$), 채널 = User.signupSource(없으면 UNKNOWN), 코호트 = 가입일.
// 비회원 = userId IS NULL, 채널 = sessionId 첫 referrer, 코호트 = 첫 page_view일.
// D-N = 기준일 + N일 이후 재방문 존재(누적 생존). 분모 = N일 경과할 시간이 있었던 코호트만.

const DAY = 86400000
const isRealUser = (pid: string) => /^\d+$/.test(pid)
const dayIdx = (t: number) => Math.floor((t + 9 * 3600000) / DAY)
const isTwaRef = (ref: string) => ref.startsWith('android-app://')

export interface QuadrantRetention {
  segment: string
  d1: { rate: number; cohort: number }
  d3: { rate: number; cohort: number }
  d7: { rate: number; cohort: number }
  d14: { rate: number; cohort: number }
  d30: { rate: number; cohort: number }
}
export interface RetentionData {
  generatedAt: string
  windowDays: number
  members: QuadrantRetention[]
  guests: QuadrantRetention[]
  note: string
}

type Cohort = { firstDay: number; active: Set<number> }

function calc(cohorts: Cohort[], nowIdx: number, segment: string): QuadrantRetention {
  const acc: Record<number, { n: number; d: number }> = {
    1: { n: 0, d: 0 }, 3: { n: 0, d: 0 }, 7: { n: 0, d: 0 }, 14: { n: 0, d: 0 }, 30: { n: 0, d: 0 },
  }
  for (const c of cohorts) {
    for (const off of [1, 3, 7, 14, 30]) {
      if (c.firstDay + off > nowIdx) continue // 아직 N일 경과 안 됨 → 분모 제외
      acc[off].d++
      for (const d of c.active) {
        if (d >= c.firstDay + off) { acc[off].n++; break }
      }
    }
  }
  const pct = (x: { n: number; d: number }) => (x.d > 0 ? Math.round((x.n / x.d) * 1000) / 10 : 0)
  return {
    segment,
    d1: { rate: pct(acc[1]), cohort: acc[1].d },
    d3: { rate: pct(acc[3]), cohort: acc[3].d },
    d7: { rate: pct(acc[7]), cohort: acc[7].d },
    d14: { rate: pct(acc[14]), cohort: acc[14].d },
    d30: { rate: pct(acc[30]), cohort: acc[30].d },
  }
}

export const getRetentionQuadrants = unstable_cache(
  async (): Promise<RetentionData> => {
    const now = Date.now()
    const nowIdx = dayIdx(now)
    const windowDays = 90
    const since = new Date(now - windowDays * DAY)

    // ── 회원 ──
    const users = await prisma.user.findMany({
      select: { id: true, providerId: true, signupSource: true, createdAt: true },
    })
    const real = users.filter((u) => isRealUser(u.providerId) && u.createdAt >= since)
    const realIds = real.map((u) => u.id)
    const memberEvents = realIds.length
      ? await prisma.eventLog.findMany({
          where: { userId: { in: realIds }, eventName: { in: ['page_view', 'login'] }, createdAt: { gte: since } },
          select: { userId: true, createdAt: true },
        })
      : []
    const memberActive = new Map<string, Set<number>>()
    for (const e of memberEvents) {
      if (!e.userId) continue
      let s = memberActive.get(e.userId)
      if (!s) { s = new Set(); memberActive.set(e.userId, s) }
      s.add(dayIdx(e.createdAt.getTime()))
    }
    const memberBuckets: Record<string, Cohort[]> = { TWA: [], WEB: [], UNKNOWN: [] }
    for (const u of real) {
      const key = u.signupSource === 'TWA' ? 'TWA' : u.signupSource === 'WEB' ? 'WEB' : 'UNKNOWN'
      memberBuckets[key].push({ firstDay: dayIdx(u.createdAt.getTime()), active: memberActive.get(u.id) ?? new Set() })
    }
    const members = [
      calc(memberBuckets.TWA, nowIdx, 'TWA 회원'),
      calc(memberBuckets.WEB, nowIdx, '웹 회원'),
      calc(memberBuckets.UNKNOWN, nowIdx, '회원(채널미상)'),
    ]

    // ── 비회원 ──
    const guestEvents = await prisma.eventLog.findMany({
      where: { eventName: 'page_view', isBot: false, userId: null, sessionId: { not: null }, createdAt: { gte: since } },
      select: { sessionId: true, referrer: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
    })
    const guestActive = new Map<string, Set<number>>()
    const guestFirstRef = new Map<string, string>()
    for (const e of guestEvents) {
      const sid = e.sessionId!
      let s = guestActive.get(sid)
      if (!s) { s = new Set(); guestActive.set(sid, s) }
      s.add(dayIdx(e.createdAt.getTime()))
      if (!guestFirstRef.has(sid)) guestFirstRef.set(sid, typeof e.referrer === 'string' ? e.referrer : '')
    }
    const guestBuckets: Record<string, Cohort[]> = { TWA: [], WEB: [] }
    for (const [sid, active] of guestActive) {
      const key = isTwaRef(guestFirstRef.get(sid) ?? '') ? 'TWA' : 'WEB'
      let firstDay = Infinity
      for (const d of active) if (d < firstDay) firstDay = d
      guestBuckets[key].push({ firstDay, active })
    }
    const guests = [
      calc(guestBuckets.TWA, nowIdx, 'TWA 비회원'),
      calc(guestBuckets.WEB, nowIdx, '웹 비회원'),
    ]

    return {
      generatedAt: new Date(now).toISOString(),
      windowDays,
      members,
      guests,
      note: '회원=가입일 코호트(providerId 순수숫자) / 비회원=첫방문 코호트(sessionId). D-N=기준일+N일 이후 재방문(누적). 분모는 N일 경과 코호트만. 채널미상=login 기록 없는 가입자(5/15 이전 등). ⚠️ 비회원 D14·D30은 30일 쿠키 한도로 과소측정(쿠키 만료 후 같은 방문자 식별 불가).',
    }
  },
  ['admin-retention-quadrants-v1'],
  { revalidate: 1800 },
)
