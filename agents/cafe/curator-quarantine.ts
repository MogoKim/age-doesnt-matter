/**
 * 당일 격리 계산 — 순수 함수 (DB·외부 의존 0, content-curator 전용)
 *
 * DUPLICATE_TITLE(기존 P0-A 격리 승계) + POLITICAL_BLOCK(Phase 0-c 신규)을
 * topic / cafePostId / refCafePostId 3개 키로 집계해 그날 후보·refs 구성에서 제외한다.
 *
 * - BotLog state 재해석만 사용: usedAt 등 CafePost 원본은 건드리지 않는다(DB write 0).
 * - 호출부가 "오늘" BotLog만 넘기므로 다음 날 자동 해제된다.
 * - 과거 로그에는 refCafePostId 필드가 없다 → optional 접근으로 안전 (refIds만 비어 있을 뿐).
 */

export interface QuarantineEntry {
  skipReason?: string | null
  topic?: string
  cafePostId?: string
  refCafePostId?: string
}

export interface QuarantineSets {
  topics: Set<string>
  cafeIds: Set<string>
  refIds: Set<string>
}

export interface DailyQuarantine {
  dup: QuarantineSets
  political: QuarantineSets
}

const REASON_TO_BUCKET: Record<string, keyof DailyQuarantine> = {
  DUPLICATE_TITLE: 'dup',
  POLITICAL_BLOCK: 'political',
}

function emptySets(): QuarantineSets {
  return { topics: new Set(), cafeIds: new Set(), refIds: new Set() }
}

/**
 * @param runs 회차별 topicResults 배열 (오늘 BotLog에서 파싱된 것)
 * @param threshold 키별 발생 횟수 임계 — 기본 1 (DUP_QUARANTINE_THRESHOLD와 동일한 즉시 격리)
 */
export function buildDailyQuarantine(runs: QuarantineEntry[][], threshold = 1): DailyQuarantine {
  const counts: Record<keyof DailyQuarantine, { topics: Map<string, number>; cafeIds: Map<string, number>; refIds: Map<string, number> }> = {
    dup: { topics: new Map(), cafeIds: new Map(), refIds: new Map() },
    political: { topics: new Map(), cafeIds: new Map(), refIds: new Map() },
  }

  for (const run of runs) {
    if (!Array.isArray(run)) continue
    for (const t of run) {
      const bucket = REASON_TO_BUCKET[t?.skipReason ?? '']
      if (!bucket) continue
      const c = counts[bucket]
      if (t.topic) c.topics.set(t.topic, (c.topics.get(t.topic) ?? 0) + 1)
      if (t.cafePostId) c.cafeIds.set(t.cafePostId, (c.cafeIds.get(t.cafePostId) ?? 0) + 1)
      if (t.refCafePostId) c.refIds.set(t.refCafePostId, (c.refIds.get(t.refCafePostId) ?? 0) + 1)
    }
  }

  const toSets = (c: (typeof counts)['dup']): QuarantineSets => ({
    topics: new Set([...c.topics].filter(([, n]) => n >= threshold).map(([k]) => k)),
    cafeIds: new Set([...c.cafeIds].filter(([, n]) => n >= threshold).map(([k]) => k)),
    refIds: new Set([...c.refIds].filter(([, n]) => n >= threshold).map(([k]) => k)),
  })

  return { dup: toSets(counts.dup), political: toSets(counts.political) }
}

/**
 * HAIKU_QUALITY_BLOCKED BotLog logData → 차단된 cafePostId 추출 — 순수 (2026-07-18 재선정 루프 hotfix).
 * 배경: 차단 시 usedAt 미마킹으로 같은 원문이 매 회차 재선정 → 당일 캐시 만료 후 판정 요동 시
 * 발행 우회 2건 실증("학폭"·"유부남"). 한 번 차단된 원문은 후보/refs에서 제외한다.
 * 불량 logData(null·cafePostId 없음·비문자열)는 조용히 무시 — 발행 흐름을 깨지 않는다.
 */
export function extractBlockedRefIds(logDatas: ReadonlyArray<unknown>): Set<string> {
  const ids = new Set<string>()
  for (const d of logDatas) {
    if (typeof d !== 'object' || d === null) continue
    const id = (d as { cafePostId?: unknown }).cafePostId
    if (typeof id === 'string' && id.length > 0) ids.add(id)
  }
  return ids
}
