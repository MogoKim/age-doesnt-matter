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

// 고정 코호트 생존곡선: 분모 = 세그먼트 전체 코호트(같은 사람들 끝까지 추적, 모든 D-N 동일).
// 분자 = 가입 후 N일째(firstDay+N) 이후 재방문. off 클수록 분자가 부분집합 → D1≥D3≥…≥D30 단조 보장.
// 아직 N일 안 지난 회원은 분자에 못 들어감(미달) → 시간 지나며 상승. 그래서 각 D-N은 같은 N명 기준.
function calc(cohorts: Cohort[], nowIdx: number, segment: string): QuadrantRetention {
  const total = cohorts.length
  const acc: Record<number, number> = { 1: 0, 3: 0, 7: 0, 14: 0, 30: 0 }
  for (const c of cohorts) {
    for (const off of [1, 3, 7, 14, 30]) {
      if (c.firstDay + off > nowIdx) continue // 아직 N일 미경과 → 분자 안 됨(분모엔 그대로 포함)
      for (const d of c.active) {
        if (d >= c.firstDay + off) { acc[off]++; break }
      }
    }
  }
  const pct = (n: number) => (total > 0 ? Math.round((n / total) * 1000) / 10 : 0)
  return {
    segment,
    d1: { rate: pct(acc[1]), cohort: total },
    d3: { rate: pct(acc[3]), cohort: total },
    d7: { rate: pct(acc[7]), cohort: total },
    d14: { rate: pct(acc[14]), cohort: total },
    d30: { rate: pct(acc[30]), cohort: total },
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
      note: '회원=가입일 코호트(providerId 순수숫자) / 비회원=첫방문 코호트(sessionId). 고정 코호트 생존곡선 — 분모는 세그먼트 전체(괄호=코호트 명수, 모든 D-N 동일), D-N=가입 후 N일째 이후 재방문. 같은 사람 기준이라 D1≥D3≥…≥D30 단조. ⚠️ 아직 N일 안 지난 회원은 미달로 집계돼 D14·D30이 낮게 시작→시간 지나며 상승. 표본 작으면 참고용. 비회원은 30일 쿠키 한도로 장기 과소측정.',
    }
  },
  ['admin-retention-quadrants-v2'],
  { revalidate: 1800 },
)
