import { prisma } from '@/lib/prisma'
import { confidenceLevel, type Confidence } from '@/lib/experiments/stats'

/**
 * 관련글 추천 algo A/B(related_algo_v2) 집계 — read-only.
 *
 * PR #30의 A/B는 registry/assign.ts(전환=sign_up) 모델이 아니라, 기존 이벤트의 algo_version 으로 arm을 구분한다.
 *   - 노출:   related_recommend_view.algo_version   (rec_v2* → B/v2, 그 외 → A/v1)
 *   - 클릭:   related_post_click(position='inline').algoVersion
 *   - 동선:   세션 arm(노출 algo_version) → 그 세션의 page_view(sessionId 조인) → 네이버 next-page/PV
 *
 * 신규 이벤트/필드 0, DB write 0. 배정 로직(ab.ts)·추천 로직(related.ts)과 무관한 순수 집계.
 */

const str = (v: unknown) => (typeof v === 'string' ? v : '')
const prop = (p: unknown, k: string) => (p as Record<string, unknown> | null)?.[k]
const armOf = (ver: string): 'v1' | 'v2' => (ver.startsWith('rec_v2') ? 'v2' : 'v1')

export interface RelatedAlgoArm {
  key: 'v1' | 'v2'
  label: string
  algoVersion: string
  shown: number // 노출(related_recommend_view)
  inlineClicks: number // 인라인 클릭(related_post_click, position=inline)
  ctr: number // % = 클릭/노출
  naverSessions: number // 네이버 유입 + 이 arm 노출 세션
  naverNextPageRate: number // % = 네이버 세션 중 page_view ≥ 2
  naverPvPerSession: number // 네이버 세션 평균 page_view
}

export interface RelatedAlgoView {
  arms: RelatedAlgoArm[]
  ctrConfidence: Confidence
  startFrom?: string
}

// related_algo_v2 실험 시작(rec_v2 최초 배정). 이 시각 전 rec_v1 노출/클릭은 A/B 이전 트래픽이라
// v1 arm 에 섞이면 노출·CTR 을 오염시킨다(예: 30일 롤링 시 5:1 착시) → since 를 실험 시작일로 하한 클램프.
// startFrom 라벨('2026-06-30')과 일치. 실험/추천/배정 로직과 무관한 집계 윈도우 보정.
const EXPERIMENT_START_MS = Date.UTC(2026, 5, 30) // 2026-06-30T00:00:00Z (month 0-based: 5=June)

async function _getRelatedAlgoAbStats(periodDays = 30): Promise<RelatedAlgoView> {
  // 롤링 시작과 실험 시작 중 더 늦은 쪽(= 실험 시작 이전으로 내려가지 않음)
  const since = new Date(Math.max(Date.now() - periodDays * 86400000, EXPERIMENT_START_MS))

  // 내부 세션(/admin·founder) 제외용
  const internalRows = await prisma.eventLog.findMany({
    where: { sessionId: { not: null }, createdAt: { gte: since }, OR: [{ path: { startsWith: '/admin' } }, { botType: 'founder' }] },
    select: { sessionId: true }, distinct: ['sessionId'],
  })
  const internal = new Set(internalRows.map((r) => r.sessionId))

  // 노출 → 세션 arm + arm별 노출 수
  const views = await prisma.eventLog.findMany({
    where: { eventName: 'related_recommend_view', sessionId: { not: null }, createdAt: { gte: since } },
    select: { sessionId: true, properties: true },
  })
  const sessionArm = new Map<string, 'v1' | 'v2'>()
  const shown = { v1: 0, v2: 0 }
  for (const v of views) {
    const sid = v.sessionId!
    if (internal.has(sid)) continue
    const arm = armOf(str(prop(v.properties, 'algo_version')))
    shown[arm]++
    if (!sessionArm.has(sid)) sessionArm.set(sid, arm) // 세션 첫 노출 arm
  }

  // 인라인 클릭 → arm별
  const clicks = await prisma.eventLog.findMany({
    where: { eventName: 'related_post_click', sessionId: { not: null }, createdAt: { gte: since }, properties: { path: ['position'], equals: 'inline' } },
    select: { sessionId: true, properties: true },
  })
  const inlineClicks = { v1: 0, v2: 0 }
  for (const c of clicks) {
    if (internal.has(c.sessionId!)) continue
    inlineClicks[armOf(str(prop(c.properties, 'algoVersion')))]++
  }

  // page_view → 세션별 pv수 + 네이버 여부(첫 referrer/browser_env). arm 세션만 집계.
  const pv = await prisma.eventLog.findMany({
    where: { eventName: 'page_view', isBot: false, sessionId: { not: null }, createdAt: { gte: since } },
    select: { sessionId: true, referrer: true, properties: true, createdAt: true },
    orderBy: { createdAt: 'asc' },
  })
  const sess = new Map<string, { pv: number; naver: boolean }>()
  for (const e of pv) {
    const sid = e.sessionId!
    if (internal.has(sid) || !sessionArm.has(sid)) continue
    let s = sess.get(sid)
    if (!s) {
      const ref = str(e.referrer), be = str(prop(e.properties, 'browser_env'))
      s = { pv: 0, naver: /naver/.test(ref) || be === 'naver-inapp' }
      sess.set(sid, s)
    }
    s.pv++
  }

  const naverAgg = (arm: 'v1' | 'v2') => {
    const ss = [...sessionArm].filter(([sid, a]) => a === arm && sess.get(sid)?.naver).map(([sid]) => sess.get(sid)!)
    const n = ss.length, totalPv = ss.reduce((acc, s) => acc + s.pv, 0), multi = ss.filter((s) => s.pv >= 2).length
    return {
      naverSessions: n,
      naverNextPageRate: n ? Math.round((multi / n) * 1000) / 10 : 0,
      naverPvPerSession: n ? Math.round((totalPv / n) * 100) / 100 : 0,
    }
  }

  const build = (key: 'v1' | 'v2', label: string, algoVersion: string): RelatedAlgoArm => ({
    key, label, algoVersion,
    shown: shown[key],
    inlineClicks: inlineClicks[key],
    ctr: shown[key] > 0 ? Math.round((inlineClicks[key] / shown[key]) * 1000) / 10 : 0,
    ...naverAgg(key),
  })

  const arms = [
    build('v1', 'A · 기존 추천(rec_v1)', 'rec_v1'),
    build('v2', 'B · 새 추천(rec_v2_2026-06-30)', 'rec_v2_2026-06-30'),
  ]
  // CTR 표본 신뢰도(노출=분모, 클릭=분자) — 기존 confidenceLevel 재사용
  const ctrConfidence = confidenceLevel(shown.v1, inlineClicks.v1, shown.v2, inlineClicks.v2)

  return { arms, ctrConfidence, startFrom: '2026-06-30' }
}

export function getRelatedAlgoAbStats(periodDays = 30): Promise<RelatedAlgoView> {
  return _getRelatedAlgoAbStats(periodDays)
}
