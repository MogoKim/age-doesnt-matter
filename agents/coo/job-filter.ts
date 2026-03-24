/**
 * 일자리 자동화 — Waterfall 필터링 + 쿼터 로직
 *
 * 4단계 Waterfall:
 *   Tier 1: Top-Tier (대기업/공공기관)
 *   Tier 2: Sweet-Spot (사무/안내/경비 등 선호 직무)
 *   Tier 3: Regional (광역시/제주 브랜드 공고)
 *   Tier 4: Safety-Net (나머지)
 *
 * 쿼터:
 *   - 여성 선호 직무: 최소 60%
 *   - 수도권/비수도권: 50:50
 */

import type { RawJob, FilteredJob, FilterConfig, JobTier } from './job-types.js'
import {
  TOP_TIER_KEYWORDS,
  SWEET_SPOT_KEYWORDS,
  FEMALE_FRIENDLY_KEYWORDS,
  METRO_REGIONS,
} from './job-types.js'

const DEFAULT_CONFIG: FilterConfig = {
  batchSize: 5,
  femaleQuota: 0.6,
  metroQuota: 0.5,
}

/** 제목+회사명에서 키워드 매칭 */
function matchesKeywords(job: RawJob, keywords: readonly string[]): boolean {
  const text = `${job.title} ${job.company} ${job.description ?? ''}`.toLowerCase()
  return keywords.some((kw) => text.includes(kw.toLowerCase()))
}

/** Tier 판정 */
function assignTier(job: RawJob): JobTier {
  if (matchesKeywords(job, TOP_TIER_KEYWORDS)) return 1
  if (matchesKeywords(job, SWEET_SPOT_KEYWORDS)) return 2
  // Tier 3: 광역시/제주 + 브랜드가 아닌 일반 공고
  const isRegional = !METRO_REGIONS.includes(job.region)
  if (isRegional && !matchesKeywords(job, TOP_TIER_KEYWORDS)) return 3
  return 4
}

/** 여성 선호 직무 판정 */
function isFemaleFriendly(job: RawJob): boolean {
  return matchesKeywords(job, FEMALE_FRIENDLY_KEYWORDS)
}

/** 수도권 여부 판정 */
function isMetroArea(job: RawJob): boolean {
  return METRO_REGIONS.some((r) => job.region.includes(r))
}

/** RawJob → FilteredJob 변환 */
function enrichJob(job: RawJob): FilteredJob {
  return {
    ...job,
    tier: assignTier(job),
    isFemaleFriendly: isFemaleFriendly(job),
    isMetro: isMetroArea(job),
  }
}

/**
 * Waterfall 필터링 + 쿼터 적용
 *
 * 1. 전체 후보를 Tier 순으로 정렬
 * 2. 여성 쿼터 60% / 수도권 50:50 밸런싱
 * 3. batchSize(4-5)건 선별
 */
export function filterJobs(
  rawJobs: RawJob[],
  config: Partial<FilterConfig> = {},
): FilteredJob[] {
  const cfg = { ...DEFAULT_CONFIG, ...config }

  // 1. 전체 enrichment + Tier 정렬 (Tier 1 우선)
  const enriched = rawJobs.map(enrichJob)
  enriched.sort((a, b) => a.tier - b.tier)

  // 2. 쿼터 계산
  const femaleTarget = Math.ceil(cfg.batchSize * cfg.femaleQuota)
  const metroTarget = Math.ceil(cfg.batchSize * cfg.metroQuota)
  const nonMetroTarget = cfg.batchSize - metroTarget

  // 3. 쿼터별 풀 분리
  const femaleMetro = enriched.filter((j) => j.isFemaleFriendly && j.isMetro)
  const femaleNonMetro = enriched.filter((j) => j.isFemaleFriendly && !j.isMetro)
  const otherMetro = enriched.filter((j) => !j.isFemaleFriendly && j.isMetro)
  const otherNonMetro = enriched.filter((j) => !j.isFemaleFriendly && !j.isMetro)

  const selected: FilteredJob[] = []
  const usedIds = new Set<string>()

  function pick(pool: FilteredJob[], count: number): void {
    for (const job of pool) {
      if (selected.length >= cfg.batchSize) return
      if (count <= 0) return
      if (usedIds.has(job.sourceId)) continue
      selected.push(job)
      usedIds.add(job.sourceId)
      count--
    }
  }

  // 여성 수도권 먼저 채우기
  const fmTarget = Math.min(femaleTarget, metroTarget)
  pick(femaleMetro, fmTarget)

  // 여성 비수도권
  const fnTarget = femaleTarget - selected.filter((j) => j.isFemaleFriendly).length
  pick(femaleNonMetro, fnTarget)

  // 나머지 수도권 채우기
  const remainMetro = metroTarget - selected.filter((j) => j.isMetro).length
  pick(otherMetro, remainMetro)

  // 나머지 비수도권 채우기
  const remainNonMetro = nonMetroTarget - selected.filter((j) => !j.isMetro).length
  pick(otherNonMetro, remainNonMetro)

  // batchSize 미달 시 나머지에서 보충
  if (selected.length < cfg.batchSize) {
    pick(enriched, cfg.batchSize - selected.length)
  }

  return selected
}

/** 필터링 결과 요약 (로그용) */
export function summarizeFilter(results: FilteredJob[]): string {
  const tierCounts = [0, 0, 0, 0, 0]
  let female = 0
  let metro = 0

  for (const job of results) {
    tierCounts[job.tier]++
    if (job.isFemaleFriendly) female++
    if (job.isMetro) metro++
  }

  return [
    `총 ${results.length}건`,
    `Tier: T1=${tierCounts[1]} T2=${tierCounts[2]} T3=${tierCounts[3]} T4=${tierCounts[4]}`,
    `여성직무: ${female}건 (${results.length > 0 ? Math.round((female / results.length) * 100) : 0}%)`,
    `수도권: ${metro}건 / 비수도권: ${results.length - metro}건`,
  ].join(' | ')
}
