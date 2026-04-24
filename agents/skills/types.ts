/**
 * Skills 타입 정의 — 검증된 SNS 전략 패턴을 코드화
 *
 * 에이전트가 반복적으로 성공하는 패턴을 감지하면:
 * 1. AdminQueue에 "스킬 등록 제안" 등록
 * 2. 창업자 승인
 * 3. registry.ts에 스킬 추가
 * 4. social-poster가 exploit 모드에서 자동 적용
 */

export interface ProvenSkill {
  /** 스킬 고유 ID (예: 'humor-morning') */
  id: string
  /** 스킬 이름 */
  name: string
  /** 어떤 콘텐츠 유형 */
  contentType: string
  /** 어떤 톤 */
  tone: string
  /** 어떤 시간대 */
  slot?: string
  /** 어떤 포맷 */
  format?: string
  /** 어떤 페르소나 */
  personaId?: string
  /** 홍보 레벨 */
  promotionLevel?: 'PURE' | 'SOFT' | 'DIRECT'
  /** 승률 (%) */
  winRate: number
  /** 어떤 실험에서 검증 */
  source: string
  /** 등록일 */
  registeredAt: string
  /** 활성 여부 */
  active: boolean
}

export interface SkillSuggestion {
  /** 제안된 스킬 */
  skill: Omit<ProvenSkill, 'registeredAt' | 'active'>
  /** 제안 근거 */
  evidence: string
  /** 관련 실험 주차 */
  experimentWeeks: number[]
}
