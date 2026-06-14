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
  d1ReturnCount: number // D1 재방문 실제 명수 (표본 작을 때 % 착시 방지용)
  d7ReturnCount: number
  firstActionCount: number
}

function isTwa(props: unknown): boolean {
  return typeof props === 'object' && props !== null && (props as Record<string, unknown>).browser_env === 'twa-android'
}

function asProps(props: unknown): Record<string, unknown> {
  return typeof props === 'object' && props !== null ? (props as Record<string, unknown>) : {}
}

const _getTwaSignupRetention = unstable_cache(
  async (days: number): Promise<TwaRetention> => {
    const start = new Date(Date.now() - days * DAY)
    const ZERO: TwaRetention = { signupCount: 0, d1ReturnRate: 0, d7ReturnRate: 0, firstActionRate: 0, d1ReturnCount: 0, d7ReturnCount: 0, firstActionCount: 0 }

    // 1) 전체 가입자 (browser_env 무관) — TWA 교차판정 위해 먼저 모은다.
    //    sign_up 단건의 browser_env는 카카오 OAuth 복귀 시 referrer 소실로 android-chrome으로 오기록되므로
    //    여기서 좁히지 않고, 게이트 변형·TWA page_view까지 교차해 판정한다(과소집계 방지).
    const signups = await prisma.eventLog.findMany({
      where: { eventName: 'sign_up', userId: { not: null }, isBot: false, createdAt: { gte: start } },
      select: { userId: true, createdAt: true, properties: true },
      orderBy: { createdAt: 'asc' },
    })
    const signupAt = new Map<string, Date>() // userId → 최초 가입시각
    const signupProps = new Map<string, Record<string, unknown>>()
    for (const s of signups) {
      if (s.userId && !signupAt.has(s.userId)) {
        signupAt.set(s.userId, s.createdAt)
        signupProps.set(s.userId, asProps(s.properties))
      }
    }
    const allUserIds = [...signupAt.keys()]
    if (allUserIds.length === 0) return ZERO

    // 2) 전체 가입자의 TWA page_view (교차판정 + 재방문 계산 겸용)
    const views = await prisma.eventLog.findMany({
      where: { eventName: 'page_view', userId: { in: allUserIds }, isBot: false },
      select: { userId: true, createdAt: true, properties: true },
    })
    const twaViewsByUser = new Map<string, number[]>() // userId → TWA 재방문 시각(ms)
    for (const v of views) {
      if (!v.userId || !isTwa(v.properties)) continue
      ;(twaViewsByUser.get(v.userId) ?? twaViewsByUser.set(v.userId, []).get(v.userId)!).push(v.createdAt.getTime())
    }

    // 3) TWA 가입자 교차판정: sign_up이 twa-android  OR  twa_gate_variant 보유(게이트는 TWA에서만 노출)  OR  TWA page_view 존재
    const userIds = allUserIds.filter((u) => {
      const p = signupProps.get(u)!
      return isTwa(p) || typeof p.twa_gate_variant === 'string' || twaViewsByUser.has(u)
    })
    if (userIds.length === 0) return ZERO

    // 4) 첫 활동 (가입자 User의 글/댓글)
    const users = await prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, postCount: true, commentCount: true },
    })
    const activeCount = users.filter((u) => u.postCount > 0 || u.commentCount > 0).length

    // 5) D1/D7 재방문 (가입 1시간 후 ~ 해당 윈도우, rolling)
    let d1 = 0
    let d7 = 0
    for (const uid of userIds) {
      const t = signupAt.get(uid)!.getTime()
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
      d1ReturnCount: d1,
      d7ReturnCount: d7,
      firstActionCount: activeCount,
    }
  },
  ['admin-twa-retention-v2'],
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
  d1ReturnCount: number // 재방문 실제 명수 (표본 작을 때 % 착시 방지)
  d7ReturnCount: number
  firstActionCount: number
  exposure: number // 게이트 노출(twa_gate_view) distinct — "가입자 이전 모수". A(현행)는 노출 이벤트 없어 0
  signupRate: number | null // 노출→가입 전환율(%). 노출 0이면 null(N/A). B/C 분모 모집단 성격 다름 주의
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
      const g = asProps(s.properties).twa_gate_variant
      if (s.userId && typeof g === 'string' && byVariant.has(g) && !byVariant.get(g)!.has(s.userId)) {
        byVariant.get(g)!.set(s.userId, s.createdAt)
      }
    }

    // 노출 분모 (twa_gate_view distinct sessionId per variant) — "가입자 이전 모수"
    //  A(현행)는 게이트를 안 띄워 노출 이벤트가 없으므로 0 (TwaEntryGate.tsx: variant==='A' return).
    const gateViews = await prisma.eventLog.findMany({
      where: { eventName: 'twa_gate_view', isBot: false, createdAt: { gte: start } },
      select: { sessionId: true, userId: true, properties: true },
    })
    const exposureByVariant = new Map<string, Set<string>>()
    for (const v of exp.variants) exposureByVariant.set(v.key, new Set())
    for (const gv of gateViews) {
      const g = asProps(gv.properties).twa_gate_variant
      const id = gv.sessionId ?? gv.userId
      if (typeof g === 'string' && exposureByVariant.has(g) && id) exposureByVariant.get(g)!.add(id)
    }
    const exposureOf = (k: string) => exposureByVariant.get(k)?.size ?? 0
    const rateOf = (conv: number, k: string): number | null => {
      const e = exposureOf(k)
      return e > 0 ? Math.round((conv / e) * 1000) / 10 : null
    }

    const allUserIds = [...byVariant.values()].flatMap((m) => [...m.keys()])
    if (allUserIds.length === 0) {
      return exp.variants.map((v) => ({ variant: v.key, label: v.label, signupCount: 0, d1ReturnRate: 0, d7ReturnRate: 0, firstActionRate: 0, d1ReturnCount: 0, d7ReturnCount: 0, firstActionCount: 0, exposure: exposureOf(v.key), signupRate: rateOf(0, v.key) }))
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
      return { variant: v.key, label: v.label, signupCount: n, d1ReturnRate: pct(d1), d7ReturnRate: pct(d7), firstActionRate: pct(act), d1ReturnCount: d1, d7ReturnCount: d7, firstActionCount: act, exposure: exposureOf(v.key), signupRate: rateOf(n, v.key) }
    })
  },
  ['admin-gate-retention-v2'],
  { revalidate: 600 },
)

export function getGateRetention(days = 90): Promise<GateRetentionRow[]> {
  return _getGateRetention(days)
}

// ──────────────────────────────────────────────
// TWA 게이트 ITT (Intention-To-Treat) — "보여주려 한 대상(배정)" 기준 공정 비교
//   노출은 그룹별 조건이 달라(A 0·B 글3개후·C 즉시) 분모가 불공정 → 최앞단인 "배정"을 분모로 통일.
//   배정 분모 = twa_gate_assigned 이벤트의 distinct sessionId(_anon_sid, 30일 유지로 배정→재방문 연결).
//   측정 정의:
//     · 가입 = sign_up properties.twa_gate_variant + userId distinct (sessionId 단절 우회, v2부터)
//       — 가입은 카카오 OAuth 외부브라우저 왕복으로 _anon_sid가 끊겨 배정 sessionId 매칭이 전부 실패하던
//         버그를 교정. 분모(배정 sessionId)와 분자(가입 userId)는 모집단 단위가 달라 signupRate는 참고용.
//     · 재방문(D1/D3/D7) = 배정 sessionId의 후속 page_view (미가입 배정자 포함, OAuth 미경유라 유효)
//   ⚠️ 배정 이벤트는 도입 시점부터 적재 → 과거 소급 불가. firstAssignedAt 이후만 유효.
// ──────────────────────────────────────────────
export interface GateITTRow {
  variant: string
  label: string
  assignedCount: number // 배정 분모 (distinct sessionId) — "보여주려 한 전원"
  signupCount: number // 배정 후 가입한 세션 수
  signupRate: number | null // 배정→가입 전환율(%)
  d1ReturnCount: number
  d1ReturnRate: number // 배정 후 1일 내 재방문(%)
  d3ReturnCount: number
  d3ReturnRate: number // 배정 후 3일 내 재방문(%)
  d7ReturnCount: number
  d7ReturnRate: number // 배정 후 7일 내 재방문(%)
  // 가입자 리텐션 — userId 기반(sessionId 단절 무관). 분모=가입자(signupCount). "가입한 사람이 다시 왔나" 직접 측정.
  signupD1Count: number
  signupD1Rate: number | null // 가입자 중 가입 후 1일 내 재방문(%). 가입자 0이면 null
  signupD7Count: number
  signupD7Rate: number | null // 가입자 중 가입 후 7일 내 재방문(%)
}

export interface GateITTResult {
  rows: GateITTRow[]
  firstAssignedAt: string | null // 배정 측정 시작 시각(ISO). null이면 아직 배정 데이터 없음
}

const _getGateITT = unstable_cache(
  async (days: number): Promise<GateITTResult> => {
    const exp = EXPERIMENTS.find((e) => e.id === 'twa01_entry_gate')
    const empty = (): GateITTRow[] =>
      (exp?.variants ?? []).map((v) => ({
        variant: v.key, label: v.label, assignedCount: 0, signupCount: 0, signupRate: null,
        d1ReturnCount: 0, d1ReturnRate: 0, d3ReturnCount: 0, d3ReturnRate: 0, d7ReturnCount: 0, d7ReturnRate: 0,
        signupD1Count: 0, signupD1Rate: null, signupD7Count: 0, signupD7Rate: null,
      }))
    if (!exp) return { rows: [], firstAssignedAt: null }
    const start = new Date(Date.now() - days * DAY)

    // 1) 배정 (분모) — variant별 sessionId → 최초 배정시각
    const assigns = await prisma.eventLog.findMany({
      where: { eventName: 'twa_gate_assigned', isBot: false, createdAt: { gte: start }, sessionId: { not: null } },
      select: { sessionId: true, createdAt: true, properties: true },
      orderBy: { createdAt: 'asc' },
    })
    const byVariant = new Map<string, Map<string, Date>>() // variant → (sessionId → 최초 배정시각)
    for (const v of exp.variants) byVariant.set(v.key, new Map())
    let firstAssignedAt: Date | null = null
    for (const a of assigns) {
      const g = asProps(a.properties).twa_gate_variant
      if (a.sessionId && typeof g === 'string' && byVariant.has(g) && !byVariant.get(g)!.has(a.sessionId)) {
        byVariant.get(g)!.set(a.sessionId, a.createdAt)
        if (!firstAssignedAt) firstAssignedAt = a.createdAt
      }
    }
    const allSids = [...byVariant.values()].flatMap((m) => [...m.keys()])
    if (allSids.length === 0) return { rows: empty(), firstAssignedAt: null }

    // 2) 재방문(page_view)은 배정 sessionId 기반 — 미가입 배정자 포함(OAuth 미경유라 유효).
    //    가입(sign_up)은 카카오 OAuth가 외부브라우저를 왕복하며 _anon_sid를 끊어 배정 sessionId로
    //    매칭 불가(실측: 배정 sessionId ∩ sign_up sessionId = 0). → properties.twa_gate_variant + userId
    //    distinct로 그룹별 가입을 센다(_getGateRetention·OnboardingForm L229 동일 우회).
    const [views, signups] = await Promise.all([
      prisma.eventLog.findMany({ where: { eventName: 'page_view', sessionId: { in: allSids }, isBot: false }, select: { sessionId: true, createdAt: true } }),
      prisma.eventLog.findMany({ where: { eventName: 'sign_up', userId: { not: null }, isBot: false, createdAt: { gte: start } }, select: { userId: true, createdAt: true, properties: true }, orderBy: { createdAt: 'asc' } }),
    ])
    const viewsBySid = new Map<string, number[]>()
    for (const v of views) {
      if (!v.sessionId) continue
      const arr = viewsBySid.get(v.sessionId) ?? []
      arr.push(v.createdAt.getTime())
      viewsBySid.set(v.sessionId, arr)
    }
    // variant별 가입 userId → 최초 가입시각(분자 + 가입자 리텐션용).
    //   ⚠️ 재방문 분모=배정 sessionId 수와 모집단 단위가 다름(노출 세션 / 가입 userId) → signupRate는 참고용 근사
    //   (_getWebExperiments L91 동일 트레이드오프).
    const signupByVariant = new Map<string, Map<string, Date>>()
    for (const v of exp.variants) signupByVariant.set(v.key, new Map())
    for (const s of signups) {
      const g = asProps(s.properties).twa_gate_variant
      if (s.userId && typeof g === 'string' && signupByVariant.has(g) && !signupByVariant.get(g)!.has(s.userId)) {
        signupByVariant.get(g)!.set(s.userId, s.createdAt)
      }
    }
    // 가입자 리텐션 — userId 기반 재방문(page_view). 가입은 OAuth로 sessionId가 끊겨 배정 세션 재방문에서
    //   누락되므로, "가입한 사람이 다시 왔나"는 userId로 직접 추적해야 정확("고장난 숫자 옆 진짜 숫자").
    const allSupUids = [...signupByVariant.values()].flatMap((m) => [...m.keys()])
    const supViews = allSupUids.length
      ? await prisma.eventLog.findMany({ where: { eventName: 'page_view', userId: { in: allSupUids }, isBot: false }, select: { userId: true, createdAt: true } })
      : []
    const supViewsByUid = new Map<string, number[]>()
    for (const v of supViews) {
      if (!v.userId) continue
      const arr = supViewsByUid.get(v.userId) ?? []
      arr.push(v.createdAt.getTime())
      supViewsByUid.set(v.userId, arr)
    }

    const rows: GateITTRow[] = exp.variants.map((v) => {
      const map = byVariant.get(v.key)!
      const n = map.size
      let d1 = 0, d3 = 0, d7 = 0
      for (const [sid, at] of map) {
        const t = at.getTime()
        const vs = (viewsBySid.get(sid) ?? []).filter((ms) => ms > t + 3600_000) // 배정 1h 후 재방문만
        if (vs.some((ms) => ms <= t + 1 * DAY)) d1++
        if (vs.some((ms) => ms <= t + 3 * DAY)) d3++
        if (vs.some((ms) => ms <= t + 7 * DAY)) d7++
      }
      // 가입자 리텐션 (userId 기반) — 가입 1h 후 ~ D1/D7 내 재방문. 분모 = 가입자 수.
      const supMap = signupByVariant.get(v.key)!
      const su = supMap.size // 가입 = variant별 가입 userId distinct(properties 기준)
      let sd1 = 0, sd7 = 0
      for (const [uid, at] of supMap) {
        const st = at.getTime()
        const vs = (supViewsByUid.get(uid) ?? []).filter((ms) => ms > st + 3600_000) // 가입 1h 후 재방문만
        if (vs.some((ms) => ms <= st + 1 * DAY)) sd1++
        if (vs.some((ms) => ms <= st + 7 * DAY)) sd7++
      }
      const pct = (x: number) => (n ? Math.round((x / n) * 1000) / 10 : 0)
      const supPct = (x: number) => (su ? Math.round((x / su) * 1000) / 10 : null)
      return {
        variant: v.key, label: v.label, assignedCount: n,
        signupCount: su, signupRate: n ? pct(su) : null,
        d1ReturnCount: d1, d1ReturnRate: pct(d1),
        d3ReturnCount: d3, d3ReturnRate: pct(d3),
        d7ReturnCount: d7, d7ReturnRate: pct(d7),
        signupD1Count: sd1, signupD1Rate: supPct(sd1),
        signupD7Count: sd7, signupD7Rate: supPct(sd7),
      }
    })
    return { rows, firstAssignedAt: firstAssignedAt ? firstAssignedAt.toISOString() : null }
  },
  ['admin-gate-itt-v3'],
  { revalidate: 600 },
)

export function getGateITT(days = 90): Promise<GateITTResult> {
  return _getGateITT(days)
}
