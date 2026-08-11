import { describe, expect, it } from 'vitest'
import {
  MENOPAUSE_CURATOR_PERSONA_IDS,
  isMenopauseCuratorPersona,
  matchPersona,
  personaBoardForRouting,
  personaIdsForRoutingBoard,
  personasForRoutingBoard,
} from '../../agents/core/persona-registry'

describe('갱년기톡 curator persona 정책', () => {
  it('MENOPAUSE 라우팅은 STORY 전체가 아니라 전용 allowlist만 사용한다', () => {
    const ids = personaIdsForRoutingBoard('MENOPAUSE')

    expect(ids).toEqual([...MENOPAUSE_CURATOR_PERSONA_IDS])
    expect(ids.length).toBeGreaterThan(0)
    expect(ids).not.toContain('Q') // 강아지집사 — 일반 STORY 일상
    expect(ids).not.toContain('N') // 살림맛집 — 음식/살림
    expect(ids).not.toContain('DO') // 건강검진분석 — 의료 단정 톤 위험
    expect(ids).not.toContain('DP') // 당뇨관리일기 — 질환 관리 톤 위험
  })

  it('allowlist 구성원은 모두 STORY curator persona다', () => {
    const pool = personasForRoutingBoard('MENOPAUSE')

    expect(pool.every(isMenopauseCuratorPersona)).toBe(true)
    expect(pool.map(p => p.id)).toEqual([...MENOPAUSE_CURATOR_PERSONA_IDS])
  })

  it('matchPersona도 MENOPAUSE에서는 allowlist 밖 persona를 고르지 않는다', () => {
    const persona = matchPersona('강아지 키우면서 갱년기 잠을 못 자요', 'HEALTH', personaBoardForRouting('MENOPAUSE'))

    expect(MENOPAUSE_CURATOR_PERSONA_IDS).toContain(persona.id)
    expect(persona.id).not.toBe('Q')
  })

  it('기존 STORY/HUMOR/LIFE2 persona pool은 그대로 유지한다', () => {
    expect(personaIdsForRoutingBoard('STORY')).toContain('Q')
    expect(personaIdsForRoutingBoard('HUMOR')).toContain('H001')
    expect(personaIdsForRoutingBoard('LIFE2')).toContain('AD')
  })
})
