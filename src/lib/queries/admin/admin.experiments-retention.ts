import { prisma } from '@/lib/prisma'
import { unstable_cache } from 'next/cache'
import { getExperiment } from '@/lib/experiments/registry'
import { confidenceLevel, conversionRate, type Confidence } from '@/lib/experiments/stats'

// 실험 리텐션 집계 — exp1_related_flow 주지표(3화면 도달률·D1~D7·세션 page_view·inline 클릭).
// 노출(exposureEvent)의 sessionId 를 분모로, EventLog page_view 로 3화면/Dn, related_post_click(inline) 로 보조.
// 시작 시점 컷: start = max(period start, ExperimentState.startedAt ?? registry startsAt) → 과거 데이터 배제.
// 캐시: tags:['experiment-state'] → 상태 저장 시 revalidateTag 로 즉시 무효화.

const DAY = 86400000
const KST = 9 * 3600000
/** Dn 최대 관찰일 */
const MAX_DAY = 7

/** epoch ms → KST 날짜 문자열(YYYY-MM-DD). 사전순 비교 = 날짜 비교. */
function kstDate(ms: number): string {
  return new Date(ms + KST).toISOString().slice(0, 10)
}

export interface RetentionDayStat {
  day: number // 1..7
  denom: number // 성숙 코호트 분모(노출일+n일 KST < 오늘 → 관찰 완료한 세션만)
  returned: number // 노출일+n일에 page_view ≥ 1
  rate: number // %
}

export interface RetentionVariantStat {
  key: string
  exposed: number // 노출 세션(분모)
  reach3: number // 3화면 도달 세션
  reach3Rate: number // %
  explore: number // 노출 이후 추가 탐색 세션(보조)
  exploreRate: number
  retentionDays: RetentionDayStat[] // D1..D7 (코호트 성숙 기준)
  avgPageviews: number // 노출일 당일 세션당 page_view 평균(광고 노출 기회 proxy) — 평균이라 신뢰배지 없음
  inlineClicks: number // related_post_click(position='inline') 세션 수(B 보조)
  rendered: number // rendered=true(B && relatedCount>0) 노출 세션
  lowRelated: number // relatedCount<3 세그먼트
}

export interface ExperimentRetentionView {
  experimentId: string
  startFrom: string | null
  todayKst: string
  variants: RetentionVariantStat[]
  reach3Confidence: Confidence // 비율 지표만 z-test
  d1Confidence: Confidence // D1(day=1) 기준 — D2~D7 은 참고 지표(배지 미부여)
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

    interface Acc extends Omit<RetentionVariantStat, 'retentionDays'> {
      _pvSum: number
      _retDenom: number[] // index 1..7
      _retReturned: number[]
    }
    const acc: Record<string, Acc> = {}
    for (const v of exp.variants) {
      acc[v.key] = {
        key: v.key, exposed: 0, reach3: 0, reach3Rate: 0, explore: 0, exploreRate: 0,
        avgPageviews: 0, inlineClicks: 0, rendered: 0, lowRelated: 0,
        _pvSum: 0,
        _retDenom: Array(MAX_DAY + 1).fill(0),
        _retReturned: Array(MAX_DAY + 1).fill(0),
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

      // Dn(1..7): 코호트 성숙 기준 — 노출일+n일(KST)이 오늘보다 이전(관찰 완료)일 때만 분모 포함.
      // targetDate >= todayKst(오늘/미래)면 아직 관찰 중 → 부분일 데이터라 제외.
      for (let n = 1; n <= MAX_DAY; n++) {
        const targetDate = kstDate(ex.at + n * DAY)
        if (targetDate < todayKst) {
          a._retDenom[n]!++
          if (pvs.some((t) => kstDate(t) === targetDate)) a._retReturned[n]!++
        }
      }
    }

    const variants: RetentionVariantStat[] = exp.variants.map((v) => {
      const a = acc[v.key]!
      const retentionDays: RetentionDayStat[] = []
      for (let n = 1; n <= MAX_DAY; n++) {
        retentionDays.push({
          day: n,
          denom: a._retDenom[n]!,
          returned: a._retReturned[n]!,
          rate: conversionRate(a._retDenom[n]!, a._retReturned[n]!),
        })
      }
      return {
        key: a.key,
        exposed: a.exposed,
        reach3: a.reach3,
        reach3Rate: conversionRate(a.exposed, a.reach3),
        explore: a.explore,
        exploreRate: conversionRate(a.exposed, a.explore),
        retentionDays,
        avgPageviews: a.exposed > 0 ? Math.round((a._pvSum / a.exposed) * 10) / 10 : 0,
        inlineClicks: a.inlineClicks,
        rendered: a.rendered,
        lowRelated: a.lowRelated,
      }
    })

    // 비율 지표만 z-test(상위 2 variant = A/B). 평균 page_view 에는 유의 배지 안 붙임.
    // D1(day=1)만 confidence 산출. D2~D7 은 표본 부족 가능성이 커 참고 지표로 표시(배지 미부여).
    const v0 = variants[0]
    const v1 = variants[1]
    const d1a = v0?.retentionDays.find((d) => d.day === 1)
    const d1b = v1?.retentionDays.find((d) => d.day === 1)
    const reach3Confidence: Confidence =
      v0 && v1 ? confidenceLevel(v0.exposed, v0.reach3, v1.exposed, v1.reach3) : 'insufficient'
    const d1Confidence: Confidence =
      d1a && d1b ? confidenceLevel(d1a.denom, d1a.returned, d1b.denom, d1b.returned) : 'insufficient'

    return {
      experimentId,
      startFrom: expStart ? new Date(expStart).toISOString() : null,
      todayKst,
      variants,
      reach3Confidence,
      d1Confidence,
    }
  },
  ['admin-exp-retention-v2'],
  { revalidate: 60, tags: ['experiment-state'] },
)

export function getExperimentRetention(
  experimentId: string,
  periodDays = 30,
): Promise<ExperimentRetentionView | null> {
  return _getExperimentRetention(experimentId, periodDays)
}
