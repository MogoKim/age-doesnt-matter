import { prisma } from '@/lib/prisma'
import { unstable_cache } from 'next/cache'
import { getInternalSessionIds } from './internal-sessions'

// 리텐션 4분면 (TWA/웹 × 회원/비회원) D1/D3/D7.
// 회원 = providerId 순수숫자(^\d+$), 채널 = User.signupSource(없으면 UNKNOWN), 코호트 = 가입일.
// 비회원 = userId IS NULL, 채널 = sessionId 첫 referrer, 코호트 = 첫 page_view일.
// D-N = 기준일 + N일 이후 재방문 존재(누적 생존). 분모 = N일 경과할 시간이 있었던 코호트만.

const DAY = 86400000
const isRealUser = (pid: string) => /^\d+$/.test(pid)
const dayIdx = (t: number) => Math.floor((t + 9 * 3600000) / DAY)
const isTwaRef = (ref: string) => ref.startsWith('android-app://')

interface RetentionPoint { denom: number; returned: number; rate: number | null }
export interface QuadrantRetention {
  segment: string
  d1: RetentionPoint
  d3: RetentionPoint
  d7: RetentionPoint
  d14: RetentionPoint
  d30: RetentionPoint
}
export interface RetentionData {
  generatedAt: string
  windowDays: number
  members: QuadrantRetention[]
  guests: QuadrantRetention[]
  note: string
}

type Cohort = { firstDay: number; active: Set<number> }

// 성숙 코호트 생존곡선: 각 D-N의 분모 = firstDay+N일이 경과한(성숙) 코호트만.
// 아직 N일 안 지난 코호트는 '실패'가 아니라 분모에서 제외. 분자 = 그 중 firstDay+N일 이후 재방문.
// denom/returned/rate 각각 반환. KR4(EventLog 비회원 D7)와 동일 정의로 통일.
// ※ 분모가 D-N마다 달라 단조(D1≥…≥D30) 보장은 없음(정의상 의도).
function calc(cohorts: Cohort[], nowIdx: number, segment: string): QuadrantRetention {
  const offs = [1, 3, 7, 14, 30] as const
  const denom: Record<number, number> = { 1: 0, 3: 0, 7: 0, 14: 0, 30: 0 }
  const ret: Record<number, number> = { 1: 0, 3: 0, 7: 0, 14: 0, 30: 0 }
  for (const c of cohorts) {
    for (const off of offs) {
      if (c.firstDay + off > nowIdx) continue // 미성숙 코호트 → 분모 제외(실패 아님)
      denom[off]++
      for (const d of c.active) {
        if (d >= c.firstDay + off) { ret[off]++; break }
      }
    }
  }
  const pt = (off: number): RetentionPoint => ({
    denom: denom[off],
    returned: ret[off],
    rate: denom[off] > 0 ? Math.round((ret[off] / denom[off]) * 1000) / 10 : null,
  })
  return { segment, d1: pt(1), d3: pt(3), d7: pt(7), d14: pt(14), d30: pt(30) }
}

export const getRetentionQuadrants = unstable_cache(
  async (): Promise<RetentionData> => {
    const now = Date.now()
    const nowIdx = dayIdx(now)
    const windowDays = 90
    const since = new Date(now - windowDays * DAY)

    // ── 회원 ──
    const users = await prisma.user.findMany({
      select: { id: true, providerId: true, signupSource: true, createdAt: true, role: true },
    })
    // 창업자(role=ADMIN) 제외 — 매일 들어오는 어드민이 회원 리텐션을 부풀림
    const real = users.filter((u) => isRealUser(u.providerId) && u.role !== 'ADMIN' && u.createdAt >= since)
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

    // ── 비회원 ── (창업자 내부 세션 /admin·founder플래그 제외)
    const internalSids = await getInternalSessionIds(since)
    const guestEvents = await prisma.eventLog.findMany({
      where: { eventName: 'page_view', isBot: false, userId: null, sessionId: { not: null }, createdAt: { gte: since } },
      select: { sessionId: true, referrer: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
    })
    const guestActive = new Map<string, Set<number>>()
    const guestFirstRef = new Map<string, string>()
    for (const e of guestEvents) {
      const sid = e.sessionId!
      if (internalSids.has(sid)) continue
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
      note: '회원=가입일 코호트(providerId 순수숫자, role≠ADMIN) / 비회원=첫방문 코호트(sessionId). 각 D-N은 N일이 경과한(성숙) 코호트만 분모에 포함 — 아직 N일 안 지난 코호트는 실패가 아니라 분모에서 제외. 괄호=해당 D-N의 분모(성숙 코호트 수)로 D-N마다 다를 수 있음. KR4(EventLog 비회원 D7)와 동일 정의. 표본 작으면 참고용. 비회원은 30일 쿠키 한도로 장기 과소측정.',
    }
  },
  ['admin-retention-quadrants-v3'], // v3: 성숙 코호트만 분모(per-Dn denom/returned/rate)로 정의 변경
  { revalidate: 1800 },
)
