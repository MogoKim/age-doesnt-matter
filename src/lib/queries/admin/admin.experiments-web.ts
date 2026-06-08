import { prisma } from '@/lib/prisma'
import { unstable_cache } from 'next/cache'
import { EXPERIMENTS } from '@/lib/experiments/registry'
import { confidenceLevel, conversionRate, type Confidence } from '@/lib/experiments/stats'

// 웹 A/B 실험 현황 집계 — EventLog 메모리 집계(insights 패턴, Raw SQL 없음).
// 노출(exposureEvent)의 properties[variantProperty]로 variant별 세션을 모으고,
// 같은 sessionId 의 전환(conversionEvent=sign_up) 유무로 전환율 산출. 봇 제외.

const DAY = 86400000

export interface VariantStat {
  key: string
  label: string
  description: string // 이 variant가 실제 무엇인지(문구/동작)
  shown: number // 노출 세션 수
  converted: number // 노출 후 전환(가입)한 세션 수
  rate: number // 전환율 %
  isWinner: boolean
}

export interface WebExperimentView {
  id: string
  name: string
  purpose: string
  background: string
  hypothesis: string
  howToVerify: string
  owner: string
  variantProperty: string
  exposureEvent: string
  conversionEvent: string
  status: string // DRAFT | ACTIVE | PAUSED | CONCLUDED (DB 없으면 코드 default ACTIVE)
  note: string | null
  conclusion: string | null
  startedAt: string | null
  endedAt: string | null
  variants: VariantStat[]
  confidence: Confidence
}

interface StateRow {
  status: string
  owner: string | null
  note: string | null
  conclusion: string | null
  startedAt: Date | null
  endedAt: Date | null
}

// ExperimentState 테이블 조회 — 마이그레이션 전이면 빈 맵 폴백(페이지 안 깨짐)
async function loadStates(): Promise<Record<string, StateRow>> {
  try {
    const rows = await prisma.experimentState.findMany()
    const map: Record<string, StateRow> = {}
    for (const r of rows) {
      map[r.experimentId] = {
        status: r.status,
        owner: r.owner,
        note: r.note,
        conclusion: r.conclusion,
        startedAt: r.startedAt,
        endedAt: r.endedAt,
      }
    }
    return map
  } catch {
    return {} // 테이블 미생성(마이그 전) → 코드 default 로 폴백
  }
}

const _getWebExperiments = unstable_cache(
  async (periodDays: number): Promise<WebExperimentView[]> => {
    const start = new Date(Date.now() - periodDays * DAY)
    const exposureEvents = [...new Set(EXPERIMENTS.map((e) => e.exposureEvent))]
    const conversionEvents = [...new Set(EXPERIMENTS.map((e) => e.conversionEvent))]

    // sessionId null 제외 안 함 — 전환(sign_up)은 userId 기반이라 sessionId 없어도 필요
    const events = await prisma.eventLog.findMany({
      where: {
        isBot: false,
        createdAt: { gte: start },
        eventName: { in: [...exposureEvents, ...conversionEvents] },
      },
      select: { sessionId: true, userId: true, eventName: true, properties: true },
    })

    const states = await loadStates()

    return EXPERIMENTS.map((exp) => {
      // 노출 = sessionId 집합(분모) / 전환 = sign_up properties[variant]의 userId 집합(분자)
      //  → 전환을 userId+properties로 직접 카운트해 인앱→외부 sessionId 단절을 우회.
      const variantSessions: Record<string, Set<string>> = {}
      const variantConv: Record<string, Set<string>> = {}
      for (const v of exp.variants) {
        variantSessions[v.key] = new Set()
        variantConv[v.key] = new Set()
      }
      for (const e of events) {
        const props =
          typeof e.properties === 'object' && e.properties !== null
            ? (e.properties as Record<string, unknown>)
            : {}
        const vk = props[exp.variantProperty]
        if (typeof vk !== 'string') continue
        if (e.eventName === exp.exposureEvent && e.sessionId && variantSessions[vk]) {
          variantSessions[vk]!.add(e.sessionId)
        } else if (e.eventName === exp.conversionEvent && e.userId && variantConv[vk]) {
          variantConv[vk]!.add(e.userId)
        }
      }

      const stats: VariantStat[] = exp.variants.map((v) => {
        const shown = variantSessions[v.key]!.size
        const converted = variantConv[v.key]!.size
        return {
          key: v.key,
          label: v.label,
          description: v.description,
          shown,
          converted,
          rate: conversionRate(shown, converted),
          isWinner: false,
        }
      })

      // 승자: 전환율 최고 + 상위 2개가 통계적으로 유의할 때만 ★
      const sorted = [...stats].sort((a, b) => b.rate - a.rate)
      const top = sorted[0]
      const second = sorted[1]
      let confidence: Confidence = 'insufficient'
      if (top && second) {
        confidence = confidenceLevel(top.shown, top.converted, second.shown, second.converted)
        if (confidence === 'significant') {
          const w = stats.find((s) => s.key === top.key)
          if (w) w.isWinner = true
        }
      }

      const st = states[exp.id]
      return {
        id: exp.id,
        name: exp.name,
        purpose: exp.purpose,
        background: exp.background,
        hypothesis: exp.hypothesis,
        howToVerify: exp.howToVerify,
        owner: st?.owner ?? exp.owner,
        variantProperty: exp.variantProperty,
        exposureEvent: exp.exposureEvent,
        conversionEvent: exp.conversionEvent,
        status: st?.status ?? 'ACTIVE',
        note: st?.note ?? null,
        conclusion: st?.conclusion ?? null,
        startedAt: st?.startedAt ? st.startedAt.toISOString() : null,
        endedAt: st?.endedAt ? st.endedAt.toISOString() : null,
        variants: stats,
        confidence,
      }
    })
  },
  ['admin-web-ab-v1'],
  { revalidate: 600 },
)

export function getWebExperiments(periodDays = 30): Promise<WebExperimentView[]> {
  return _getWebExperiments(periodDays)
}

// ──────────────────────────────────────────────
// TWA 첫 진입 A/B (F-TWA) Phase 0 — 측정 인프라
// "앱(TWA)으로 가입한 회원이 이후 앱으로 다시 오는가" 현행 베이스라인.
// 게이트 실험(Phase 1) 시작 전, 그룹 없이 TWA 가입자 전체의 재방문/첫활동을 잰다.
// TWA 식별: sign_up / page_view 이벤트의 properties.browser_env === 'twa-android'.
// ──────────────────────────────────────────────
export interface TwaRetention {
  signupCount: number // 기간 내 TWA 가입자 수
  d1ReturnRate: number // 가입 후 48h 내 앱 재방문율(%)
  d7ReturnRate: number // 가입 후 7일 내 앱 재방문율(%)
  firstActionRate: number // 가입자 중 글·댓글 1개+ 비율(%)
}

function isTwa(props: unknown): boolean {
  return typeof props === 'object' && props !== null && (props as Record<string, unknown>).browser_env === 'twa-android'
}

const _getTwaSignupRetention = unstable_cache(
  async (days: number): Promise<TwaRetention> => {
    const start = new Date(Date.now() - days * DAY)

    // 1) TWA 가입자 (sign_up + browser_env=twa-android)
    const signups = await prisma.eventLog.findMany({
      where: { eventName: 'sign_up', userId: { not: null }, isBot: false, createdAt: { gte: start } },
      select: { userId: true, createdAt: true, properties: true },
    })
    const signupAt = new Map<string, Date>() // userId → 최초 가입시각
    for (const s of signups) {
      if (s.userId && isTwa(s.properties) && !signupAt.has(s.userId)) signupAt.set(s.userId, s.createdAt)
    }
    const userIds = [...signupAt.keys()]
    if (userIds.length === 0) return { signupCount: 0, d1ReturnRate: 0, d7ReturnRate: 0, firstActionRate: 0 }

    // 2) 가입자들의 이후 TWA page_view (재방문)
    const views = await prisma.eventLog.findMany({
      where: { eventName: 'page_view', userId: { in: userIds }, isBot: false },
      select: { userId: true, createdAt: true, properties: true },
    })
    const twaViewsByUser = new Map<string, number[]>() // userId → 재방문 시각(ms) 목록
    for (const v of views) {
      if (!v.userId || !isTwa(v.properties)) continue
      ;(twaViewsByUser.get(v.userId) ?? twaViewsByUser.set(v.userId, []).get(v.userId)!).push(v.createdAt.getTime())
    }

    // 3) 첫 활동 (가입자 User의 글/댓글)
    const users = await prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, postCount: true, commentCount: true },
    })
    const activeCount = users.filter((u) => u.postCount > 0 || u.commentCount > 0).length

    // 4) D1/D7 재방문 (가입 1시간 후 ~ 해당 윈도우, rolling)
    let d1 = 0
    let d7 = 0
    for (const [uid, at] of signupAt) {
      const t = at.getTime()
      const vs = (twaViewsByUser.get(uid) ?? []).filter((ms) => ms > t + 3600_000) // 가입 1h 후 이후
      if (vs.some((ms) => ms <= t + 2 * DAY)) d1++ // 48h 내
      if (vs.some((ms) => ms <= t + 7 * DAY)) d7++ // 7일 내
    }

    const pct = (n: number) => (userIds.length ? Math.round((n / userIds.length) * 1000) / 10 : 0)
    return {
      signupCount: userIds.length,
      d1ReturnRate: pct(d1),
      d7ReturnRate: pct(d7),
      firstActionRate: pct(activeCount),
    }
  },
  ['admin-twa-retention-v1'],
  { revalidate: 600 },
)

export function getTwaSignupRetention(days = 90): Promise<TwaRetention> {
  return _getTwaSignupRetention(days)
}

// ──────────────────────────────────────────────
// TWA 게이트 그룹별 재방문 — A(baseline)/B/C 비교 (Phase 1)
// sign_up properties.twa_gate_variant 로 그룹 분리 → 그룹별 가입자 D1/D7 재방문 + 첫 활동.
// ──────────────────────────────────────────────
export interface GateRetentionRow {
  variant: string
  label: string
  signupCount: number
  d1ReturnRate: number
  d7ReturnRate: number
  firstActionRate: number
}

const _getGateRetention = unstable_cache(
  async (days: number): Promise<GateRetentionRow[]> => {
    const exp = EXPERIMENTS.find((e) => e.id === 'twa01_entry_gate')
    if (!exp) return []
    const start = new Date(Date.now() - days * DAY)

    // 그룹별 가입자 (sign_up + twa_gate_variant)
    const signups = await prisma.eventLog.findMany({
      where: { eventName: 'sign_up', userId: { not: null }, isBot: false, createdAt: { gte: start } },
      select: { userId: true, createdAt: true, properties: true },
    })
    const byVariant = new Map<string, Map<string, Date>>() // variant → (userId → 가입시각)
    for (const v of exp.variants) byVariant.set(v.key, new Map())
    for (const s of signups) {
      const g = typeof s.properties === 'object' && s.properties !== null
        ? (s.properties as Record<string, unknown>).twa_gate_variant
        : undefined
      if (s.userId && typeof g === 'string' && byVariant.has(g) && !byVariant.get(g)!.has(s.userId)) {
        byVariant.get(g)!.set(s.userId, s.createdAt)
      }
    }
    const allUserIds = [...byVariant.values()].flatMap((m) => [...m.keys()])
    if (allUserIds.length === 0) {
      return exp.variants.map((v) => ({ variant: v.key, label: v.label, signupCount: 0, d1ReturnRate: 0, d7ReturnRate: 0, firstActionRate: 0 }))
    }

    const [views, users] = await Promise.all([
      prisma.eventLog.findMany({
        where: { eventName: 'page_view', userId: { in: allUserIds }, isBot: false },
        select: { userId: true, createdAt: true, properties: true },
      }),
      prisma.user.findMany({ where: { id: { in: allUserIds } }, select: { id: true, postCount: true, commentCount: true } }),
    ])
    const twaViews = new Map<string, number[]>()
    for (const v of views) {
      if (!v.userId || !isTwa(v.properties)) continue
      const arr = twaViews.get(v.userId) ?? []
      arr.push(v.createdAt.getTime())
      twaViews.set(v.userId, arr)
    }
    const activeSet = new Set(users.filter((u) => u.postCount > 0 || u.commentCount > 0).map((u) => u.id))

    return exp.variants.map((v) => {
      const map = byVariant.get(v.key)!
      let d1 = 0
      let d7 = 0
      let act = 0
      for (const [uid, at] of map) {
        const t = at.getTime()
        const vs = (twaViews.get(uid) ?? []).filter((ms) => ms > t + 3600_000)
        if (vs.some((ms) => ms <= t + 2 * DAY)) d1++
        if (vs.some((ms) => ms <= t + 7 * DAY)) d7++
        if (activeSet.has(uid)) act++
      }
      const n = map.size
      const pct = (x: number) => (n ? Math.round((x / n) * 1000) / 10 : 0)
      return { variant: v.key, label: v.label, signupCount: n, d1ReturnRate: pct(d1), d7ReturnRate: pct(d7), firstActionRate: pct(act) }
    })
  },
  ['admin-gate-retention-v1'],
  { revalidate: 600 },
)

export function getGateRetention(days = 90): Promise<GateRetentionRow[]> {
  return _getGateRetention(days)
}
