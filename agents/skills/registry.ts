import type { ProvenSkill } from './types.js'

/**
 * Skills Registry — 검증된 SNS 전략 패턴 저장소
 *
 * 8주 실험 후 검증된 우승 패턴들이 여기에 등록됩니다.
 * social-poster가 exploit 모드(70%)에서 이 스킬들을 활용합니다.
 *
 * 등록 프로세스:
 * 1. social-reviewer가 2주 연속 동일 패턴 우승 감지
 * 2. AdminQueue에 "스킬 등록 제안" 등록
 * 3. 창업자 승인 후 여기에 추가
 *
 * 졸업 기준: 우승 공식이 2주 연속 성과 하락 시 active=false
 */

const PROVEN_SKILLS: ProvenSkill[] = [
  // 실험이 진행되면서 검증된 스킬들이 여기에 추가됩니다.
  // 예시 (아직 미검증):
  // {
  //   id: 'humor-morning',
  //   name: '아침 유머',
  //   contentType: 'HUMOR',
  //   tone: 'humorous',
  //   slot: 'morning',
  //   personaId: 'C',
  //   winRate: 72,
  //   source: 'Week 3+7 실험',
  //   registeredAt: '2026-04-21',
  //   active: true,
  // },
]

/** 활성 스킬만 반환 */
export function getActiveSkills(): ProvenSkill[] {
  return PROVEN_SKILLS.filter(s => s.active)
}

/** 특정 조건에 맞는 스킬 찾기 */
export function findSkill(params: {
  contentType?: string
  tone?: string
  slot?: string
  personaId?: string
}): ProvenSkill | undefined {
  return getActiveSkills().find(s =>
    (!params.contentType || s.contentType === params.contentType) &&
    (!params.tone || s.tone === params.tone) &&
    (!params.slot || s.slot === params.slot) &&
    (!params.personaId || s.personaId === params.personaId)
  )
}

/** 랜덤으로 활성 스킬 하나 선택 (exploit 모드용) */
export function pickRandomSkill(): ProvenSkill | undefined {
  const active = getActiveSkills()
  if (active.length === 0) return undefined

  // 승률 기반 가중 랜덤 선택
  const totalWeight = active.reduce((sum, s) => sum + s.winRate, 0)
  let rand = Math.random() * totalWeight

  for (const skill of active) {
    rand -= skill.winRate
    if (rand <= 0) return skill
  }

  return active[0]
}

/** 전체 스킬 목록 (관리용) */
export function getAllSkills(): ProvenSkill[] {
  return [...PROVEN_SKILLS]
}
