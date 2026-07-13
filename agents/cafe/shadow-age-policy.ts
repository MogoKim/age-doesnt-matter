/**
 * SECONDARY 소스 연령 정책 — neutral_daily 1차 (2026-07-13)
 *
 * 이전: positive 신호(남편/50대 등) 필수 → 무해한 일상글까지 isUsable=false로 폐기
 *   (실측: 최근 7일 remonterrace unusable 893건 중 790건이 positive 부재 단독 사망)
 * 변경: 창업자 기준 "명확한 부적합이 아니면 발행 가능" — 근거: 창업자 직접 운영
 *   Google Sheet '우나어 커뮤니티 스크래퍼' 발행 505건(음식/집밥·날씨·생활소비·가전·
 *   집안일·일상감정·여행·인간관계 에피소드 다수가 positive 0).
 *
 * 판정 사다리 (위에서 먼저 걸리면 종료):
 *   ① HARD  — 육아 키워드 raw 차단 (AS-IS 유지, EXCLUDE 소거 없이 보수적)
 *   ② TRADE — 지역 거래/홍보/공구/동네 Q&A (AS-IS 유지)
 *   ③ AGE-FIT — 젊은 연령 자기언급·미혼연애·입시 학부모 콤보 (curator 발행 게이트의
 *       findAgeFitViolation을 크롤 단계로 승격 — 단일 진실, EXCLUDE 오탐 소거 내장)
 *   ④ SOFT — 입시·학원 계열 + positive 없음 (AS-IS 유지)
 *   ⑤ 허용 — positive 있으면 'POSITIVE', 없으면 'NEUTRAL_DAILY' (positive는 필수가
 *       아니라 우선순위 신호로 강등. 값은 CafePost.ageSignal에 기록 — 마이그레이션 없음)
 *
 * ⚠️ Haiku gate 도입 전 임시 정책 — NEUTRAL_DAILY 마킹이 이후 AI 게이트의 대상 선정 키.
 * ⚠️ curator 최종 발행 게이트(age-fit/TRADE/political/duplicate/season/PZP)는 무변경 유지.
 */
import { PARENTING_HARD_KEYWORDS, findLocalTradeSignal, findAgeFitViolation } from '../core/age-fit-blocklist.js'

export const SHADOW_AGE_SOFT_REJECT: readonly string[] = ['중학생', '고등학생', '수능', '입시', '내신', '학원', '사춘기 자녀']
export const SHADOW_AGE_POSITIVE: readonly string[] = ['40대 중후반', '50대', '60대', '갱년기', '폐경', '중년', '남편', '시댁', '친정', '성인 자녀', '대학생 자녀', '취업 자녀', '손주', '은퇴', '노후']

export type ShadowAgeClass =
  | { usable: false; reason: string }
  | { usable: true; ageSignal: 'POSITIVE' | 'NEUTRAL_DAILY' }

export function classifyShadowAge(title: string, content: string): ShadowAgeClass {
  const flat = `${title} ${content}`.replace(/\n/g, ' ')

  const hard = PARENTING_HARD_KEYWORDS.find(k => flat.includes(k))
  if (hard) return { usable: false, reason: `HARD:${hard}` }

  const trade = findLocalTradeSignal(title, content)
  if (trade) return { usable: false, reason: trade } // 반환값이 이미 'TRADE:매칭어' 형식

  const violation = findAgeFitViolation(title, content)
  if (violation) return { usable: false, reason: violation }

  const hasPositive = SHADOW_AGE_POSITIVE.some(k => flat.includes(k))
  const soft = SHADOW_AGE_SOFT_REJECT.find(k => flat.includes(k))
  if (soft && !hasPositive) return { usable: false, reason: `SOFT:${soft}(positive 없음)` }

  return { usable: true, ageSignal: hasPositive ? 'POSITIVE' : 'NEUTRAL_DAILY' }
}
