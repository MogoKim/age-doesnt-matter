import { prisma } from '@/lib/prisma'
import { unstable_cache } from 'next/cache'

// 실고객 인사이트 — 봇 제외(실고객 = providerId 순수숫자 ^\d+$) 4대 지표.
// agents/scripts/insights.ts(CLI)와 동일 기준의 서버판. 화면용으로 unstable_cache(30분).
// 단일 봇 제외 기준: 진짜 카카오 유저 = providerId가 순수 숫자. 봇은 curator-*/bot-*/seed*.

const WEEK = 7 * 86400000
const DAY = 86400000
const isRealUser = (pid: string) => /^\d+$/.test(pid)
const pct = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 1000) / 10 : 0)

export interface InsightsData {
  generatedAt: string
  realUserCount: number
  botUserCount: number
  new7d: number
  northStar: {
    current: number
    previous: number
    weekly: { weekLabel: string; active: number }[]
  }
  channels: { channel: string; sessions: number; signups: number; signupRate: number; retentionRate: number }[]
  activation: { total: number; onboarded: number; wrote: number; commented: number; active: number }
}

// UTM 우선 → referrer 보조. utm은 page_view properties(utm_source/utm_medium).
function classifyChannel(ref: string, utmSource: string, utmMedium: string): string {
  // 1) 레퍼럴(카카오 공유) — 띠배너/게시글 공유 URL의 utm_medium=kakao_share
  if (utmMedium === 'kakao_share') return '카카오 레퍼럴'
  // 2) TWA 앱 — google-play utm 또는 android-app referrer
  if (utmSource === 'google-play' || ref.startsWith('android-app://')) return 'TWA 앱'
  // 3) 카카오 로그인 리다이렉트(내부 이동) = 유입 채널 아님 → 직접입력 처리
  if (ref.includes('kauth.kakao') || ref.includes('accounts.kakao')) return '직접입력'
  if (ref.includes('google')) return 'Google'
  if (ref.includes('naver')) return 'Naver'
  if (ref.includes('youtube')) return 'YouTube'
  if (ref.includes('kakao')) return 'Kakao' // 그 외 진짜 카카오 유입(talk 등)
  if (ref.includes('t.co') || ref.includes('twitter') || ref.includes('x.com')) return 'Twitter/X'
  if (ref.includes('instagram')) return 'Instagram'
  if (ref.includes('facebook') || ref.includes('fb.')) return 'Facebook'
  if (ref === '') return '직접입력'
  return '기타'
}

export const getInsights = unstable_cache(
  async (): Promise<InsightsData> => {
    const now = Date.now()
    const start8w = new Date(now - 8 * WEEK)
    const start30 = new Date(now - 30 * DAY)
    const sevenAgo = new Date(now - 7 * DAY)

    const allUsers = await prisma.user.findMany({
      select: { id: true, providerId: true, postCount: true, commentCount: true, isOnboarded: true, createdAt: true },
    })
    const real = allUsers.filter((u) => isRealUser(u.providerId))
    const realIds = real.map((u) => u.id)

    // ── 북극성: 주간 활성 실고객(WAU) — 각 주에 방문/로그인한 실고객 수 ──
    // weekBucket: 0=이번 주(최근 7일) … 7=8주 전. 활동=page_view(userId)/login.
    const weekBucket = (t: number) => Math.floor((now - t) / WEEK)
    const actEvents = realIds.length
      ? await prisma.eventLog.findMany({
          where: {
            userId: { in: realIds },
            eventName: { in: ['page_view', 'login'] },
            createdAt: { gte: start8w },
          },
          select: { userId: true, createdAt: true },
        })
      : []
    const userActiveWeeks = new Map<string, Set<number>>()
    for (const e of actEvents) {
      if (!e.userId) continue
      const b = weekBucket(e.createdAt.getTime())
      if (b < 0 || b > 7) continue
      let set = userActiveWeeks.get(e.userId)
      if (!set) { set = new Set(); userActiveWeeks.set(e.userId, set) }
      set.add(b)
    }

    const weekly: { weekLabel: string; active: number }[] = []
    for (let b = 7; b >= 0; b--) {
      let active = 0
      for (const u of real) if (userActiveWeeks.get(u.id)?.has(b)) active++
      weekly.push({ weekLabel: b === 0 ? '이번 주' : `${b}주 전`, active })
    }
    const current = weekly[weekly.length - 1]?.active ?? 0
    const previous = weekly[weekly.length - 2]?.active ?? 0

    // ── 30일 세션 이벤트 (채널·리텐션) ──
    const events = await prisma.eventLog.findMany({
      where: { isBot: false, createdAt: { gte: start30 }, NOT: { sessionId: null } },
      select: { sessionId: true, eventName: true, referrer: true, properties: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
    })

    const sVisitDays: Record<string, Set<number>> = {}
    for (const e of events) {
      if (e.eventName !== 'page_view') continue
      ;(sVisitDays[e.sessionId!] ??= new Set()).add(Math.floor((e.createdAt.getTime() + 9 * 3600000) / DAY))
    }
    const pvSessions = new Set(events.filter((e) => e.eventName === 'page_view').map((e) => e.sessionId!))
    const loginSessions = new Set(events.filter((e) => e.eventName === 'login').map((e) => e.sessionId!))

    // 채널별 (세션 첫 page_view의 referrer + utm)
    const firstMeta: Record<string, { ref: string; src: string; med: string }> = {}
    for (const e of events) {
      if (e.eventName !== 'page_view') continue
      if (e.sessionId! in firstMeta) continue
      const p = e.properties as Record<string, unknown> | null
      firstMeta[e.sessionId!] = {
        ref: typeof e.referrer === 'string' ? e.referrer : '',
        src: typeof p?.utm_source === 'string' ? p.utm_source : '',
        med: typeof p?.utm_medium === 'string' ? p.utm_medium : '',
      }
    }
    const chanMap: Record<string, { sessions: number; signups: number; multi: number }> = {}
    for (const s of pvSessions) {
      const m = firstMeta[s] ?? { ref: '', src: '', med: '' }
      const c = classifyChannel(m.ref, m.src, m.med)
      const v = (chanMap[c] ??= { sessions: 0, signups: 0, multi: 0 })
      v.sessions++
      if (loginSessions.has(s)) v.signups++
      if ((sVisitDays[s]?.size ?? 0) >= 2) v.multi++
    }
    const channels = Object.entries(chanMap)
      .map(([channel, v]) => ({
        channel,
        sessions: v.sessions,
        signups: v.signups,
        signupRate: pct(v.signups, v.sessions),
        retentionRate: pct(v.multi, v.sessions),
      }))
      .sort((a, b) => b.sessions - a.sessions)

    // ── 활성화 (실고객 User 기반) ──
    const activation = {
      total: real.length,
      onboarded: real.filter((u) => u.isOnboarded).length,
      wrote: real.filter((u) => u.postCount > 0).length,
      commented: real.filter((u) => u.commentCount > 0).length,
      active: real.filter((u) => u.postCount > 0 || u.commentCount > 0).length,
    }

    return {
      generatedAt: new Date(now).toISOString(),
      realUserCount: real.length,
      botUserCount: allUsers.length - real.length,
      new7d: real.filter((u) => u.createdAt >= sevenAgo).length,
      northStar: { current, previous, weekly },
      channels,
      activation,
    }
  },
  ['admin-insights-v1'],
  { revalidate: 1800 },
)
