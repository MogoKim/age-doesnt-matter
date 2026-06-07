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

    const events = await prisma.eventLog.findMany({
      where: {
        isBot: false,
        createdAt: { gte: start },
        NOT: { sessionId: null },
        eventName: { in: [...exposureEvents, ...conversionEvents] },
      },
      select: { sessionId: true, eventName: true, properties: true },
    })

    // 전환 이벤트별 세션 집합
    const convSessions: Record<string, Set<string>> = {}
    for (const ev of conversionEvents) convSessions[ev] = new Set()
    for (const e of events) {
      if (e.sessionId && convSessions[e.eventName]) convSessions[e.eventName]!.add(e.sessionId)
    }

    const states = await loadStates()

    return EXPERIMENTS.map((exp) => {
      // variant별 노출 세션 집합
      const variantSessions: Record<string, Set<string>> = {}
      for (const v of exp.variants) variantSessions[v.key] = new Set()
      for (const e of events) {
        if (e.eventName !== exp.exposureEvent || !e.sessionId) continue
        const props =
          typeof e.properties === 'object' && e.properties !== null
            ? (e.properties as Record<string, unknown>)
            : {}
        const vk = props[exp.variantProperty]
        if (typeof vk === 'string' && variantSessions[vk]) variantSessions[vk]!.add(e.sessionId)
      }
      const convSet = convSessions[exp.conversionEvent] ?? new Set<string>()

      const stats: VariantStat[] = exp.variants.map((v) => {
        const shownSet = variantSessions[v.key]!
        let converted = 0
        for (const sid of shownSet) if (convSet.has(sid)) converted++
        return {
          key: v.key,
          label: v.label,
          shown: shownSet.size,
          converted,
          rate: conversionRate(shownSet.size, converted),
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
