/**
 * 대댓글 체인 정의 — 페르소나 간 자연스러운 대화 유도
 * comment-activator와 reply-chain-driver 에이전트가 사용
 */

export interface ReplyChain {
  /** 대화를 시작하는 페르소나 */
  trigger: string
  /** 순서대로 답글을 다는 페르소나 */
  responders: string[]
  /** 대화 주제/맥락 */
  topic: string
  /** 최대 대화 깊이 */
  maxDepth: number
}

/**
 * 정의된 대화 체인
 * trigger가 글이나 댓글을 올리면, responders가 순서대로 대댓글
 */
export const REPLY_CHAINS: ReplyChain[] = [
  // ── P5 간병 공감 체인 ──
  { trigger: 'AJ', responders: ['AK', 'E'], topic: '간병', maxDepth: 3 },
  { trigger: 'AK', responders: ['AJ', 'AQ'], topic: '부모돌봄', maxDepth: 3 },

  // ── P2 건강 불안 → 안심 체인 ──
  { trigger: 'AM', responders: ['AN', 'H'], topic: '건강걱정', maxDepth: 3 },
  { trigger: 'AN', responders: ['AM', 'AG'], topic: '영양제', maxDepth: 2 },

  // ── P3 유머 리액션 체인 ──
  { trigger: 'AO', responders: ['AP', 'C'], topic: '유머', maxDepth: 2 },
  { trigger: 'AF', responders: ['C', 'AP', 'AO'], topic: '아재개그', maxDepth: 3 },

  // ── P1 느슨한 연결 체인 ──
  { trigger: 'AQ', responders: ['E', 'AV'], topic: '일상공감', maxDepth: 2 },
  { trigger: 'AV', responders: ['AQ', 'J'], topic: '혼밥', maxDepth: 2 },
  { trigger: 'AW', responders: ['AQ', 'P'], topic: '취미', maxDepth: 2 },
  { trigger: 'AR', responders: ['B', 'Y'], topic: '세상이야기', maxDepth: 2 },

  // ── P4 일자리 정보 체인 ──
  { trigger: 'AS', responders: ['D', 'AT'], topic: '일자리', maxDepth: 2 },
  { trigger: 'AT', responders: ['AS', 'T'], topic: '자격증', maxDepth: 2 },

  // ── 실험적: 초건강 체인 ──
  { trigger: 'AL', responders: ['AU', 'H'], topic: '운동', maxDepth: 2 },
  { trigger: 'AU', responders: ['AL', 'M'], topic: '마라톤', maxDepth: 2 },

  // ── 기존 페르소나 크로스 체인 ──
  { trigger: 'V', responders: ['W', 'E'], topic: '불만공감', maxDepth: 2 },
  { trigger: 'S', responders: ['G', 'AI'], topic: '지역생활', maxDepth: 2 },
  { trigger: 'AX', responders: ['AO', 'L'], topic: '모임', maxDepth: 2 },
]

/** 특정 페르소나가 trigger인 체인 찾기 */
export function getChainsForTrigger(personaId: string): ReplyChain[] {
  return REPLY_CHAINS.filter(c => c.trigger === personaId)
}

/** 특정 페르소나가 responder인 체인 찾기 */
export function getChainsForResponder(personaId: string): ReplyChain[] {
  return REPLY_CHAINS.filter(c => c.responders.includes(personaId))
}
