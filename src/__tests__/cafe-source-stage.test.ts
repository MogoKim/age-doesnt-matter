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

describe('파생 상수 — 현재 상태 (Phase 2-a 승격 후: remon/goondae = core)', () => {
  it('PRODUCTION_CAFE_IDS = wgang, dlxogns01 만 (core 승격 후에도 불변)', () => {
    expect(PRODUCTION_CAFE_IDS.sort()).toEqual(['dlxogns01', 'wgang'])
  })

  it('CURATION_CORE_CAFE_IDS = production + core (killer 후보 경쟁군)', () => {
    expect(CURATION_CORE_CAFE_IDS.sort()).toEqual(['dlxogns01', 'goondae', 'remonterrace', 'wgang'])
  })

  it('PUBLISHABLE_CAFE_IDS = production + core (refs·self-ref 유지)', () => {
    expect(PUBLISHABLE_CAFE_IDS.sort()).toEqual(['dlxogns01', 'goondae', 'remonterrace', 'wgang'])
  })

  it('SECONDARY_CAFE_IDS = remonterrace, goondae 유지 (크롤 전략·연령필터 불변)', () => {
    expect(SECONDARY_CAFE_IDS.sort()).toEqual(['goondae', 'remonterrace'])
  })

  it('SHADOW_CAFE_IDS = 빈 배열', () => {
    expect(SHADOW_CAFE_IDS).toEqual([])
  })

  it('PUBLISHABLE_ONLY_CAFE_IDS = 빈 배열 (core 승격으로 보충 lane 휴면 — 신규 카페 온보딩 경로로 유지)', () => {
    expect(PUBLISHABLE_ONLY_CAFE_IDS).toEqual([])
  })

  it('remon/goondae는 PRODUCTION에 절대 미포함 (trend/성공판정/크롤품질 오염 방지)', () => {
    expect(PRODUCTION_CAFE_IDS).not.toContain('remonterrace')
    expect(PRODUCTION_CAFE_IDS).not.toContain('goondae')
  })
})

describe('sourceStageOfCafe — BotLog refSourceStage 기록용', () => {
  it('production/core/unknown 판정', () => {
    expect(sourceStageOfCafe('wgang')).toBe('production')
    expect(sourceStageOfCafe('dlxogns01')).toBe('production')
    expect(sourceStageOfCafe('remonterrace')).toBe('core')
    expect(sourceStageOfCafe('goondae')).toBe('core')
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
