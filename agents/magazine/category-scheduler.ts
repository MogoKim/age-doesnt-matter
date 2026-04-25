/**
 * 요일별 카테고리 순환 스케줄러
 * 트렌드 기반 주제가 없을 때 카테고리 자동 결정
 */

import { DESIRE_TOPIC_HINTS } from './prompt.js'

/** 요일별 카테고리 (0=일, 1=월, ..., 6=토) */
const CATEGORY_ROTATION: Record<number, string> = {
  1: '건강',      // 월요일 — 주초 건강 정보
  2: '재테크',    // 화요일 — 실용 금융 정보
  3: '은퇴준비',  // 수요일 — 인생 2막 준비
  4: '요리',      // 목요일 — 생활 밀착 콘텐츠
  5: '여행',      // 금요일 — 주말 준비
  6: '생활',      // 토요일 — 주말 생활 팁
  0: '관계',      // 일요일 — 감성·공감 주제 (Opus 심층)
}

/** 오늘 요일 기준 카테고리 반환 */
export function getTodayCategory(date: Date = new Date()): string {
  const kst = new Date(date.getTime() + 9 * 60 * 60 * 1000)
  const day = kst.getDay()
  return CATEGORY_ROTATION[day] ?? '생활'
}

/** 카테고리에서 fallback 주제 하나 선택 */
export function getFallbackTopic(category: string): string {
  const desireMap: Record<string, string> = {
    '건강': 'HEALTH',
    '재테크': 'MONEY',
    '은퇴준비': 'RETIRE',
    '일자리': 'JOB',
    '관계': 'RELATION',
    '취미': 'HOBBY',
    '집꾸미기': 'HOME',
    '패션': 'FASHION',
    '요리': 'COOKING',
    '여행': 'TRAVEL',
    '생활': 'RELATION',
  }

  const desire = desireMap[category] ?? 'HEALTH'
  const hints = DESIRE_TOPIC_HINTS[desire] ?? DESIRE_TOPIC_HINTS['HEALTH']
  return hints[Math.floor(Math.random() * hints.length)]
}
