import type { BoardType } from '@/generated/prisma/client'

/** BoardType → 화면 표시명 (단일 진실 소스) */
export const BOARD_DISPLAY_NAMES: Record<BoardType, string> = {
  STORY:    '사는이야기',
  HUMOR:    '웃음방',
  LIFE2:    '2막준비',
  JOB:      '일자리',
  MAGAZINE: '매거진',
  WEEKLY:   '수다방',
}

/** string을 안전하게 표시명으로 변환 */
export function getBoardDisplayName(boardType: string): string {
  return BOARD_DISPLAY_NAMES[boardType as BoardType] ?? boardType
}

/** BoardType → 욕망 매핑 (에이전트 참조용) */
export const BOARD_DESIRE_MAP: Partial<Record<BoardType, string[]>> = {
  STORY:    ['RELATION'],
  HUMOR:    ['RELATION'],
  LIFE2:    ['RETIRE', 'MONEY'],
  JOB:      ['MONEY'],
  MAGAZINE: ['HEALTH', 'RETIRE'],
  WEEKLY:   ['RELATION'],
}
