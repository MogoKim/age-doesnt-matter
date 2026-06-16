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
      select: { sessionId: true, userId: true, eventName: true, properties: true, createdAt: true },
    })

    const states = await loadStates()

    return EXPERIMENTS.map((exp) => {
      // 시작 시점 컷: ExperimentState.startedAt ?? registry startsAt 이전 이벤트 제외(과거 데이터 배제).
      const st = states[exp.id]
      const startedMs = st?.startedAt?.getTime() ?? exp.startsAt ?? 0
      // 노출 = sessionId 집합(분모) / 전환 = sign_up properties[variant]의 userId 집합(분자)
      //  → 전환을 userId+properties로 직접 카운트해 인앱→외부 sessionId 단절을 우회.
      const variantSessions: Record<string, Set<string>> = {}
      const variantConv: Record<string, Set<string>> = {}
      for (const v of exp.variants) {
        variantSessions[v.key] = new Set()
        variantConv[v.key] = new Set()
      }
      for (const e of events) {
        if (e.createdAt.getTime() < startedMs) continue // 실험 시작 전 이벤트 제외
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
