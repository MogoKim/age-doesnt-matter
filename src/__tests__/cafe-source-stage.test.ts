import { describe, it, expect } from 'vitest'
import {
  PRODUCTION_CAFE_IDS,
  CURATION_CORE_CAFE_IDS,
  PUBLISHABLE_CAFE_IDS,
  SECONDARY_CAFE_IDS,
  SHADOW_CAFE_IDS,
  PUBLISHABLE_ONLY_CAFE_IDS,
  isProductionCafe,
  isCurationCoreSource,
  isPublishableSource,
  isSecondarySource,
  isShadowSource,
  sourceStageOfCafe,
} from '../../agents/cafe/config'

// Phase 1-a-① 축 분리 → 1-a-② publishable 승격 → Phase 2-a core 승격 (2026-07-10).
// 핵심 가드: core 승격 후에도 remon/goondae는 PRODUCTION_CAFE_IDS(trend/
// CRAWL_EXPECTED 성공판정/크롤품질)에 절대 유입되지 않아야 한다.
// 정책: docs/analysis/content-curate-phase2-core-promotion-design-2026-07-10.md

describe('파생 상수 — 현재 상태 (Phase 2-a 승격 + masanmam core 승격 2026-07-14)', () => {
  it('PRODUCTION_CAFE_IDS = wgang, dlxogns01 만 (승격 후에도 불변)', () => {
    expect(PRODUCTION_CAFE_IDS.sort()).toEqual(['dlxogns01', 'wgang'])
  })

  it('CURATION_CORE_CAFE_IDS = production + core (killer 후보 경쟁군 — masanmam 포함, 2026-07-14 승격)', () => {
    expect(CURATION_CORE_CAFE_IDS.sort()).toEqual(['dlxogns01', 'goondae', 'masanmam', 'remonterrace', 'wgang'])
  })

  it('PUBLISHABLE_CAFE_IDS = production + core + publishable (refs·self-ref — masanmam 포함)', () => {
    expect(PUBLISHABLE_CAFE_IDS.sort()).toEqual(['dlxogns01', 'goondae', 'masanmam', 'remonterrace', 'wgang'])
  })

  it('SECONDARY_CAFE_IDS = remon, goondae, masanmam, yeowooya (크롤 전략·연령필터 적용)', () => {
    expect(SECONDARY_CAFE_IDS.sort()).toEqual(['goondae', 'masanmam', 'remonterrace', 'yeowooya'])
  })

  it('SHADOW_CAFE_IDS = yeowooya (2026-08-14 온보딩 — 발행 금지 관찰 전용)', () => {
    expect(SHADOW_CAFE_IDS).toEqual(['yeowooya'])
  })

  it('PUBLISHABLE_ONLY_CAFE_IDS = 빈 배열 (masanmam core 승격으로 보충 lane 졸업 — 온보딩 경로로 유지)', () => {
    expect(PUBLISHABLE_ONLY_CAFE_IDS).toEqual([])
  })

  it('remon/goondae/masanmam은 PRODUCTION에 절대 미포함 (trend/성공판정/크롤품질 오염 방지)', () => {
    expect(PRODUCTION_CAFE_IDS).not.toContain('remonterrace')
    expect(PRODUCTION_CAFE_IDS).not.toContain('goondae')
    expect(PRODUCTION_CAFE_IDS).not.toContain('masanmam')
  })

  // 여우야는 성형/뷰티 카페라 광고 오염 위험이 있다. 관찰이 끝나기 전까지 어떤 발행 경로에도
  // 들어가면 안 된다 — 이 가드가 깨지면 병원 광고가 고객 화면에 노출될 수 있다.
  it('yeowooya는 발행 경로 전부에서 제외 (shadow — 고객 화면 노출 0)', () => {
    expect(PRODUCTION_CAFE_IDS).not.toContain('yeowooya')
    expect(CURATION_CORE_CAFE_IDS).not.toContain('yeowooya')
    expect(PUBLISHABLE_CAFE_IDS).not.toContain('yeowooya')
    expect(PUBLISHABLE_ONLY_CAFE_IDS).not.toContain('yeowooya')
  })

  it('yeowooya sourceStage 판정 = shadow / isPublishableSource=false', () => {
    expect(sourceStageOfCafe('yeowooya')).toBe('shadow')
    expect(isShadowSource({ sourceStage: 'shadow' })).toBe(true)
    expect(isPublishableSource({ sourceStage: 'shadow' })).toBe(false)
    expect(isCurationCoreSource({ sourceStage: 'shadow' })).toBe(false)
    expect(isProductionCafe({ sourceStage: 'shadow' })).toBe(false)
    expect(isSecondarySource({ sourceStage: 'shadow' })).toBe(true)  // 크롤 전략·연령필터는 적용
  })

  // crawler.ts savePosts의 의료광고 저장 skip은 SHADOW_CAFE_IDS 한정으로 걸려 있다.
  // 기존 5개 카페가 이 목록에 들어가면 저장 동작이 조용히 바뀌므로 고정한다.
  // 2026-08-14 author 기반 차단이 추가되며 이 가드의 중요도가 올라갔다 —
  // 기존 카페에 author 필터가 새로 걸리면 정상 회원 글 저장량이 줄 수 있다.
  it('기존 5개 카페는 SHADOW_CAFE_IDS에 미포함 (의료광고·author skip 미적용 — 저장 동작 불변)', () => {
    for (const id of ['wgang', 'dlxogns01', 'remonterrace', 'goondae', 'masanmam']) {
      expect(SHADOW_CAFE_IDS).not.toContain(id)
    }
  })

  it('SHADOW_CAFE_IDS는 정확히 1개 (yeowooya) — 확대 시 이 테스트가 먼저 깨진다', () => {
    expect(SHADOW_CAFE_IDS).toHaveLength(1)
  })
})

describe('sourceStageOfCafe — BotLog refSourceStage 기록용', () => {
  it('production/core/unknown 판정', () => {
    expect(sourceStageOfCafe('wgang')).toBe('production')
    expect(sourceStageOfCafe('dlxogns01')).toBe('production')
    expect(sourceStageOfCafe('remonterrace')).toBe('core')
    expect(sourceStageOfCafe('goondae')).toBe('core')
    expect(sourceStageOfCafe('masanmam')).toBe('core')
    expect(sourceStageOfCafe('없는카페')).toBe('unknown')
  })
})

describe('predicate — 가상 config 사다리 판정 (production > core > publishable > shadow)', () => {
  const unspecified = {} as { sourceStage?: 'production' | 'core' | 'publishable' | 'shadow' }
  const production = { sourceStage: 'production' as const }
  const core = { sourceStage: 'core' as const }
  const publishable = { sourceStage: 'publishable' as const }
  const shadow = { sourceStage: 'shadow' as const }

  it('미지정 = production 취급 (기존 wgang/dlxogns01 동작 불변)', () => {
    expect(isProductionCafe(unspecified)).toBe(true)
    expect(isCurationCoreSource(unspecified)).toBe(true)
    expect(isPublishableSource(unspecified)).toBe(true)
    expect(isSecondarySource(unspecified)).toBe(false)
    expect(isShadowSource(unspecified)).toBe(false)
  })

  it('명시적 production도 동일', () => {
    expect(isProductionCafe(production)).toBe(true)
    expect(isCurationCoreSource(production)).toBe(true)
    expect(isPublishableSource(production)).toBe(true)
    expect(isSecondarySource(production)).toBe(false)
  })

  it('core: production=false / curationCore=true / publishable=true / secondary=true / shadow=false', () => {
    expect(isProductionCafe(core)).toBe(false)
    expect(isCurationCoreSource(core)).toBe(true)
    expect(isPublishableSource(core)).toBe(true)
    expect(isSecondarySource(core)).toBe(true)
    expect(isShadowSource(core)).toBe(false)
  })

  it('publishable: production=false / curationCore=false / publishable=true / secondary=true / shadow=false', () => {
    expect(isProductionCafe(publishable)).toBe(false)
    expect(isCurationCoreSource(publishable)).toBe(false)
    expect(isPublishableSource(publishable)).toBe(true)
    expect(isSecondarySource(publishable)).toBe(true)
    expect(isShadowSource(publishable)).toBe(false)
  })

  it('shadow: 전부 false, shadow=true', () => {
    expect(isProductionCafe(shadow)).toBe(false)
    expect(isCurationCoreSource(shadow)).toBe(false)
    expect(isPublishableSource(shadow)).toBe(false)
    expect(isSecondarySource(shadow)).toBe(true)
    expect(isShadowSource(shadow)).toBe(true)
  })
})
