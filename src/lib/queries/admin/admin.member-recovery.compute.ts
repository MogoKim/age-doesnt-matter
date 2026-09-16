/**
 * R8 회원 소생 — **계산 단위**. 기간 경계·비율·방문 구간처럼
 * 오케스트레이션과 무관하게 혼자 검증할 수 있는 것만 둔다.
 *
 * 쿼리 오케스트레이션(`computeMemberRecovery`)에서 떼어낸 이유는 크기가 아니라
 * **검증 가능성**이다. 여기 있는 함수는 DB mock 만으로 기간 경계와 계산 결과를
 * 대조할 수 있다 — 939줄짜리 한 함수 안에서는 불가능했다.
 */
import { prisma } from '@/lib/prisma'
import { getRetentionQuadrants, type QuadrantRetention } from './admin.retention'
import type { ActivationCohort, MemberRetentionView } from './admin.member-recovery.types'

export const DAY = 86400000
export const HOUR = 3600000

/** 실회원 판정 SSoT — 접두어 목록 방식은 7건 어긋난다(facts 2026-09-10 §2). */
export const isRealProviderId = (pid: string | null | undefined) => /^\d+$/.test(pid ?? '')

export const rateOf = (numer: number, denom: number): number | null =>
  denom > 0 ? Math.round((numer / denom) * 1000) / 10 : null

export function median(values: number[]): number | null {
  if (values.length === 0) return null
  const s = [...values].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}

/**
 * 이벤트별 **방문자 → 최초 발생 시각**. `groupBy` 라 DB 에서 집계되므로
 * `page_view` 처럼 행이 많은 이벤트를 전부 끌어오지 않는다.
 *
 * 최초 시각이 필요한 이유: 퍼널은 **순서가 있는** 전환이다.
 * 단순 집합 교집합은 "배너를 본 뒤 눌렀다"와 "누른 뒤 배너를 봤다"를 구분하지 못한다.
 */
/** 방문자별 이벤트 **발생 구간**. `_min`/`_max` 집계라 원본 행을 끌어오지 않는다. */
export interface VisitorSpan {
  first: number
  last: number
}
export type SpanMap = Map<string, VisitorSpan>

export function addSpan(map: SpanMap, id: string, first: number, last: number): void {
  const cur = map.get(id)
  if (!cur) map.set(id, { first, last })
  else {
    if (first < cur.first) cur.first = first
    if (last > cur.last) cur.last = last
  }
}

export async function visitorSpans(where: Record<string, unknown>, internal: Set<string>): Promise<SpanMap> {
  const rows = await prisma.eventLog.groupBy({
    by: ['sessionId'],
    where,
    _min: { createdAt: true },
    _max: { createdAt: true },
  })
  const out: SpanMap = new Map()
  for (const r of rows) {
    if (!r.sessionId) continue
    if (internal.has(r.sessionId)) continue // 창업자·어드민 방문자 제외
    const a = r._min?.createdAt
    const b = r._max?.createdAt
    if (!a || !b) continue
    addSpan(out, r.sessionId, a.getTime(), b.getTime())
  }
  return out
}

/**
 * 앞 단계를 밟은 방문자 중 **그 이후에 다음 단계가 (다시) 있었던** 수.
 *
 * 🔴 최초 시각끼리 비교하면 안 된다. 배너를 한 번 본 뒤 적격이 되고 **또 본** 방문자는
 * `to.first < from.first` 라서 미전환으로 빠진다. 실제로는 전환이다.
 * 그래서 앞 단계의 **최초**와 뒤 단계의 **최종**을 비교한다 —
 * "이전에만 있었다"(`to.last < from.first`)만 제외된다.
 */
export function advancedAfter(from: SpanMap, to: SpanMap): number {
  let n = 0
  for (const [id, a] of from) {
    const b = to.get(id)
    if (b && b.last >= a.first) n++
  }
  return n
}

/** 두 이벤트 계열의 합집합 — 방문자별 구간을 합친다. */
export function unionSpans(...maps: SpanMap[]): SpanMap {
  const out: SpanMap = new Map()
  for (const m of maps) for (const [id, sp] of m) addSpan(out, id, sp.first, sp.last)
  return out
}

/**
 * 2단계 — 가입 코호트가 **24시간 안에** 첫 글/댓글을 썼는가.
 *
 * 🔴 기간 경계가 곧 의미다. `DAY` 를 넘기면 "언젠가는 썼다"가 섞여
 *    첫 참여 실패가 가려진다. 가입 직후 회원은 '안 썼다'가 아니라
 *    '판정할 시간이 없었다' 라서 분모에서 빼고 따로 센다.
 */
export async function computeActivation(
  cohort: { id: string; createdAt: Date }[],
  now: number,
): Promise<ActivationCohort> {
  const cohortIds = cohort.map((u) => u.id)
  const [firstPosts, firstComments] = await Promise.all([
    cohortIds.length
      ? prisma.post.groupBy({ by: ['authorId'], where: { authorId: { in: cohortIds } }, _min: { createdAt: true } })
      : Promise.resolve([] as { authorId: string; _min: { createdAt: Date | null } }[]),
    cohortIds.length
      ? prisma.comment.groupBy({ by: ['authorId'], where: { authorId: { in: cohortIds } }, _min: { createdAt: true } })
      : Promise.resolve([] as { authorId: string | null; _min: { createdAt: Date | null } }[]),
  ])

  const firstPostAt = new Map<string, number>()
  for (const r of firstPosts) if (r._min.createdAt) firstPostAt.set(r.authorId, r._min.createdAt.getTime())
  const firstCommentAt = new Map<string, number>()
  for (const r of firstComments) if (r.authorId && r._min.createdAt) firstCommentAt.set(r.authorId, r._min.createdAt.getTime())

  // 가입 직후는 '아직 안 썼다'가 아니라 '판정할 시간이 없었다'
  const matureCohort = cohort.filter((u) => now - u.createdAt.getTime() >= DAY)
  const hoursToFirst: number[] = []
  let wrotePostWithin24h = 0
  let wroteCommentWithin24h = 0
  let wroteAnyWithin24h = 0
  let wroteAnyLater = 0
  for (const u of matureCohort) {
    const joined = u.createdAt.getTime()
    const p = firstPostAt.get(u.id)
    const c = firstCommentAt.get(u.id)
    // 🔴 D1 기준 — 가입 시각으로부터 24시간 이내만 성공이다.
    //    기간을 열어두면 "언젠가는 썼다"가 섞여 첫 참여 실패가 가려진다.
    if (p != null && p - joined <= DAY) wrotePostWithin24h++
    if (c != null && c - joined <= DAY) wroteCommentWithin24h++
    const first = Math.min(p ?? Infinity, c ?? Infinity)
    if (Number.isFinite(first)) {
      hoursToFirst.push(Math.max(0, (first - joined) / HOUR))
      if (first - joined <= DAY) wroteAnyWithin24h++
      else wroteAnyLater++
    }
  }
  const medianHours = median(hoursToFirst)

  return {
    cohortTotal: cohort.length,
    immature: cohort.length - matureCohort.length,
    matureDenom: matureCohort.length,
    wrotePostWithin24h,
    wroteCommentWithin24h,
    wroteAnyWithin24h,
    wroteAnyLater,
    rate: rateOf(wroteAnyWithin24h, matureCohort.length),
    status: matureCohort.length > 0 ? 'OK' : 'NO_DENOM',
    medianHoursToFirst: medianHours != null ? Math.round(medianHours * 10) / 10 : null,
  }
}

/** 4단계 — 재방문. 기존 리텐션 구현을 재사용하고 채널 합산만 더한다. */
export async function computeRetentionView(): Promise<MemberRetentionView> {
  const retentionData = await getRetentionQuadrants()
  const members = retentionData.members
  const sum = (pick: (q: QuadrantRetention) => { denom: number; returned: number }) => {
    let denom = 0
    let returned = 0
    for (const q of members) {
      denom += pick(q).denom
      returned += pick(q).returned
    }
    return { denom, returned, rate: rateOf(returned, denom) }
  }
  const combined: QuadrantRetention | null = members.length
    ? {
        segment: '전체(채널 합산)',
        d1: sum((q) => q.d1),
        d3: sum((q) => q.d3),
        d7: sum((q) => q.d7),
        d14: sum((q) => q.d14),
        d30: sum((q) => q.d30),
      }
    : null

  return {
    source: 'admin.retention.ts · getRetentionQuadrants()',
    sourceWindowDays: retentionData.windowDays,
    quadrants: members,
    combined,
    note:
      '**신규 실회원(가입 코호트)만** 표시한다. 같은 함수가 돌려주는 비회원 리텐션은 정의(코호트=첫 page_view일)가 달라 이 화면에 섞지 않는다. ' +
      'D-N 분모는 가입 후 N일이 실제로 지난 성숙 코호트뿐이라 위 7·30일 창과 별개로 90일 창을 쓴다 — D7 은 7일이 지나야 판정할 수 있기 때문이다.',
  }
}
