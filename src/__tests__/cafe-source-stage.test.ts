import { describe, it, expect } from 'vitest'
import {
  PRODUCTION_CAFE_IDS,
  PUBLISHABLE_CAFE_IDS,
  SECONDARY_CAFE_IDS,
  SHADOW_CAFE_IDS,
  isProductionCafe,
  isPublishableSource,
  isSecondarySource,
  isShadowSource,
  sourceStageOfCafe,
} from '../../agents/cafe/config'

// Phase 1-a-① 축 분리 + Phase 1-a-② remon/goondae publishable 승격 (2026-07-09).
// 핵심 가드: 승격 후에도 remon/goondae는 PRODUCTION_CAFE_IDS(trend/killer/
// CRAWL_EXPECTED 성공판정)에 절대 유입되지 않아야 한다.
// 정책: docs/analysis/content-curate-source-policy-phase1a-2026-07-09.md

describe('파생 상수 — 현재 상태 (Phase 1-a-② 승격 후: remon/goondae = publishable)', () => {
  it('PRODUCTION_CAFE_IDS = wgang, dlxogns01 만 (승격 후에도 불변)', () => {
    expect(PRODUCTION_CAFE_IDS.sort()).toEqual(['dlxogns01', 'wgang'])
  })

  it('PUBLISHABLE_CAFE_IDS = production + remon/goondae (발행 refs 확대)', () => {
    expect(PUBLISHABLE_CAFE_IDS.sort()).toEqual(['dlxogns01', 'goondae', 'remonterrace', 'wgang'])
  })

  it('SECONDARY_CAFE_IDS = remonterrace, goondae 유지 (크롤 전략 불변)', () => {
    expect(SECONDARY_CAFE_IDS.sort()).toEqual(['goondae', 'remonterrace'])
  })

  it('SHADOW_CAFE_IDS = 빈 배열 (발행 금지 소스 현재 없음)', () => {
    expect(SHADOW_CAFE_IDS).toEqual([])
  })

  it('remon/goondae는 PRODUCTION에 절대 미포함 (trend/killer/성공판정 오염 방지)', () => {
    expect(PRODUCTION_CAFE_IDS).not.toContain('remonterrace')
    expect(PRODUCTION_CAFE_IDS).not.toContain('goondae')
  })
})

describe('sourceStageOfCafe — BotLog refSourceStage 기록용', () => {
  it('production/publishable/unknown 판정', () => {
    expect(sourceStageOfCafe('wgang')).toBe('production')
    expect(sourceStageOfCafe('dlxogns01')).toBe('production')
    expect(sourceStageOfCafe('remonterrace')).toBe('publishable')
    expect(sourceStageOfCafe('goondae')).toBe('publishable')
    expect(sourceStageOfCafe('없는카페')).toBe('unknown')
  })
})

describe('predicate — 가상 config 4단계 판정', () => {
  const unspecified = {} as { sourceStage?: 'production' | 'publishable' | 'shadow' }
  const production = { sourceStage: 'production' as const }
  const publishable = { sourceStage: 'publishable' as const }
  const shadow = { sourceStage: 'shadow' as const }

  it('미지정 = production 취급 (기존 wgang/dlxogns01 동작 불변)', () => {
    expect(isProductionCafe(unspecified)).toBe(true)
    expect(isPublishableSource(unspecified)).toBe(true)
    expect(isSecondarySource(unspecified)).toBe(false)
    expect(isShadowSource(unspecified)).toBe(false)
  })

  it('명시적 production도 동일', () => {
    expect(isProductionCafe(production)).toBe(true)
    expect(isPublishableSource(production)).toBe(true)
    expect(isSecondarySource(production)).toBe(false)
  })

  it('publishable: production=false / publishable=true / secondary=true / shadow=false', () => {
    expect(isProductionCafe(publishable)).toBe(false)
    expect(isPublishableSource(publishable)).toBe(true)
    expect(isSecondarySource(publishable)).toBe(true)
    expect(isShadowSource(publishable)).toBe(false)
  })

  it('shadow: production=false / publishable=false / secondary=true / shadow=true', () => {
    expect(isProductionCafe(shadow)).toBe(false)
    expect(isPublishableSource(shadow)).toBe(false)
    expect(isSecondarySource(shadow)).toBe(true)
    expect(isShadowSource(shadow)).toBe(true)
  })
})
