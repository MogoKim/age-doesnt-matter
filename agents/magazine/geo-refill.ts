/**
 * geo_seed 상시 큐 self-refill 선택기 — 순수 함수 (DB·외부 의존 0)
 *
 * [D-mag(a) 2026-07-10] trend-analyzer의 magazineTopics 의존 제거 선행 작업.
 * magazine-generator가 실행 시 오늘 geo_seed가 없으면 longtail-keywords(main 자산 ~81개)에서
 * 다음 주제 1개를 골라 오늘자 geo_seed를 자동 생성한다 — 별도 크론/배치 없음(실행 자체가 트리거).
 * 설계: docs/analysis/content-curate-dmag-geoseed-design-2026-07-10.md
 */

import type { LongtailKeyword } from './longtail-keywords.js'

export interface GeoRefillPick {
  keyword: string
  category: string
  intent: string
  pillar?: string
}

/**
 * 다음 geo_seed 주제 선택.
 * - 카테고리 순환: dayIndex(날짜 기반)로 시작 카테고리를 돌려 편중 방지
 * - 중복 회피: ① 과거 geo_seed 제목(exact) ② 최근 발행 매거진 제목에 키워드가 포함된 경우
 * - 소진 시 null → 호출부는 기존 폴백 체계로 자연 강등 (Slack 스팸 없음)
 */
export function pickNextGeoTopic(
  keywordsByCategory: Record<string, LongtailKeyword[]>,
  usedGeoTitles: Set<string>,
  recentMagazineTitles: string[],
  dayIndex: number,
): GeoRefillPick | null {
  const categories = Object.keys(keywordsByCategory)
  if (categories.length === 0) return null

  const start = ((dayIndex % categories.length) + categories.length) % categories.length
  for (let i = 0; i < categories.length; i++) {
    const category = categories[(start + i) % categories.length]
    for (const kw of keywordsByCategory[category] ?? []) {
      if (!kw?.keyword) continue
      if (usedGeoTitles.has(kw.keyword)) continue
      if (recentMagazineTitles.some(t => t.includes(kw.keyword))) continue
      return { keyword: kw.keyword, category, intent: kw.intent, pillar: kw.pillar }
    }
  }
  return null
}
