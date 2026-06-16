import { prisma } from '@/lib/prisma'
import { unstable_cache } from 'next/cache'
import { getExperiment } from '@/lib/experiments/registry'
import { confidenceLevel, conversionRate, type Confidence } from '@/lib/experiments/stats'

// 실험 리텐션 집계 — exp1_related_flow 주지표(3화면 도달률·D1·세션 page_view·inline 클릭).
// 노출(exposureEvent)의 sessionId 를 분모로, EventLog page_view 로 3화면/D1, related_post_click(inline) 로 보조.
// 시작 시점 컷: start = max(period start, ExperimentState.startedAt ?? registry startsAt) → 과거 데이터 배제.
// 캐시: tags:['experiment-state'] → 상태 저장 시 revalidateTag 로 즉시 무효화(저장은 정확, 화면도 바로).

const DAY = 86400000
const KST = 9 * 3600000

/** epoch ms → KST 날짜 문자열(YYYY-MM-DD) */
function kstDate(ms: number): string {
  return new Date(ms + KST).toISOString().slice(0, 10)
}

export interface RetentionVariantStat {
  key: string
  exposed: number // 노출 세션(분모)
  reach3: number // 3화면 도달 세션
  reach3Rate: number // %
  explore: number // 노출 이후 추가 탐색 세션(보조)
  exploreRate: number
  d1Denom: number // D1 분모(노출일이 오늘 이전 = 다음날 관찰 가능한 세션)
  d1: number
  d1Rate: number
  avgPageviews: number // 노출일 당일 세션당 page_view 평균(광고 노출 기회 proxy) — 평균이라 신뢰배지 없음
  inlineClicks: number // related_post_click(position='inline') 세션 수(B 보조)
  rendered: number // rendered=true(B && relatedCount>0) 노출 세션
  lowRelated: number // relatedCount<3 세그먼트
}

export interface ExperimentRetentionView {
  experimentId: string
  startFrom: string | null
  variants: RetentionVariantStat[]
  reach3Confidence: Confidence // 비율 지표만 z-test
  d1Confidence: Confidence
}

const _getExperimentRetention = unstable_cache(
  async (experimentId: string, periodDays: number): Promise<ExperimentRetentionView | null> => {
    const exp = getExperiment(experimentId)
    if (!exp) return null

    // 시작 시점 컷
    let startMs = Date.now() - periodDays * DAY
    let state: { startedAt: Date | null } | null = null
    try {
      state = await prisma.experimentState.findUnique({
        where: { experimentId },
        select: { startedAt: true },
      })
    } catch {
      state = null // 테이블 미생성 폴백
    }
    const expStart = state?.startedAt?.getTime() ?? exp.startsAt ?? null
    if (expStart && expStart > startMs) startMs = expStart
    const start = new Date(startMs)

    const events = await prisma.eventLog.findMany({
      where: {
        isBot: false,
        createdAt: { gte: start },
        eventName: { in: [exp.exposureEvent, 'page_view', 'related_post_click'] },
      },
      select: { sessionId: true, eventName: true, properties: true, createdAt: true },
    })

    interface Exposure {
      variant: string
      at: number
      relatedCount: number
      rendered: boolean
    }
    const exposures = new Map<string, Exposure>() // sessionId → 첫 노출
    const pvBySession = new Map<string, number[]>() // sessionId → page_view createdAt[]
    const inlineClickSessions = new Set<string>()

    for (const e of events) {
      if (!e.sessionId) continue
      const props =
        typeof e.properties === 'object' && e.properties !== null
          ? (e.properties as Record<string, unknown>)
          : {}
      if (e.eventName === exp.exposureEvent) {
        const v = props[exp.variantProperty]
        if (typeof v !== 'string' || !exp.variants.some((x) => x.key === v)) continue
        const at = e.createdAt.getTime()
        const prev = exposures.get(e.sessionId)
        if (!prev || at < prev.at) {
          exposures.set(e.sessionId, {
            variant: v,
            at,
            relatedCount: typeof props.relatedCount === 'number' ? props.relatedCount : 0,
            rendered: props.rendered === true,
          })
        }
      } else if (e.eventName === 'page_view') {
        const arr = pvBySession.get(e.sessionId) ?? []
        arr.push(e.createdAt.getTime())
        pvBySession.set(e.sessionId, arr)
      } else if (e.eventName === 'related_post_click' && props.position === 'inline') {
        inlineClickSessions.add(e.sessionId)
      }
    }

    const todayKst = kstDate(Date.now())

    interface Acc extends RetentionVariantStat {
      _pvSum: number
    }
    const acc: Record<string, Acc> = {}
    for (const v of exp.variants) {
      acc[v.key] = {
        key: v.key, exposed: 0, reach3: 0, reach3Rate: 0, explore: 0, exploreRate: 0,
        d1Denom: 0, d1: 0, d1Rate: 0, avgPageviews: 0, inlineClicks: 0, rendered: 0,
        lowRelated: 0, _pvSum: 0,
      }
    }

    for (const [sid, ex] of exposures) {
      const a = acc[ex.variant]
      if (!a) continue
      a.exposed++
      if (ex.rendered) a.rendered++
      if (ex.relatedCount < 3) a.lowRelated++
      const clicked = inlineClickSessions.has(sid)
      if (clicked) a.inlineClicks++

      const pvs = pvBySession.get(sid) ?? []
      const d0 = kstDate(ex.at)
      const sameDayPv = pvs.filter((t) => kstDate(t) === d0).length
      a._pvSum += sameDayPv
      if (sameDayPv >= 3) a.reach3++ // 기본: 노출과 같은 KST 날짜 page_view ≥ 3

      // 보조: 노출 이후 추가 page_view 또는 inline 클릭
      if (pvs.some((t) => t > ex.at) || clicked) a.explore++

      // D1: 노출일이 오늘 이전(코호트 보정) → 다음날 page_view ≥ 1
      if (d0 < todayKst) {
        a.d1Denom++
        const d1Str = kstDate(ex.at + DAY)
        if (pvs.some((t) => kstDate(t) === d1Str)) a.d1++
      }
    }

    const variants: RetentionVariantStat[] = exp.variants.map((v) => {
      const a = acc[v.key]!
      return {
        key: a.key,
        exposed: a.exposed,
        reach3: a.reach3,
        reach3Rate: conversionRate(a.exposed, a.reach3),
        explore: a.explore,
        exploreRate: conversionRate(a.exposed, a.explore),
        d1Denom: a.d1Denom,
        d1: a.d1,
        d1Rate: conversionRate(a.d1Denom, a.d1),
        avgPageviews: a.exposed > 0 ? Math.round((a._pvSum / a.exposed) * 10) / 10 : 0,
        inlineClicks: a.inlineClicks,
        rendered: a.rendered,
        lowRelated: a.lowRelated,
      }
    })

    // 비율 지표만 z-test(상위 2 variant = A/B). 평균 page_view 에는 유의 배지 안 붙임.
    const v0 = variants[0]
    const v1 = variants[1]
    const reach3Confidence: Confidence =
      v0 && v1 ? confidenceLevel(v0.exposed, v0.reach3, v1.exposed, v1.reach3) : 'insufficient'
    const d1Confidence: Confidence =
      v0 && v1 ? confidenceLevel(v0.d1Denom, v0.d1, v1.d1Denom, v1.d1) : 'insufficient'

    return {
      experimentId,
      startFrom: expStart ? new Date(expStart).toISOString() : null,
      variants,
      reach3Confidence,
      d1Confidence,
    }
  },
  ['admin-exp-retention-v1'],
  { revalidate: 60, tags: ['experiment-state'] },
)

export function getExperimentRetention(
  experimentId: string,
  periodDays = 30,
): Promise<ExperimentRetentionView | null> {
  return _getExperimentRetention(experimentId, periodDays)
}
