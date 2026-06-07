/**
 * A/B 신뢰도 판정 — 2-proportion z-test (순수 TS, 의존성 0).
 * 전환율 차이가 통계적으로 유의한지 + 표본이 충분한지 3단계로.
 *
 *  - significant   : 표본 충분 + 95% 유의 → "결론 내려도 됨"
 *  - need_more     : 표본은 있으나 아직 유의하지 않음 → "더 모아야"
 *  - insufficient  : 표본 부족 → "아직 믿지 마라"
 */
export type Confidence = 'significant' | 'need_more' | 'insufficient'

/** variant당 최소 노출 */
export const MIN_SHOWN = 100
/** 두 variant 합계 최소 전환 */
export const MIN_CONVERSION = 10

export function confidenceLevel(
  aShown: number,
  aConv: number,
  bShown: number,
  bConv: number,
): Confidence {
  if (aShown < MIN_SHOWN || bShown < MIN_SHOWN || aConv + bConv < MIN_CONVERSION) {
    return 'insufficient'
  }
  const p1 = aConv / aShown
  const p2 = bConv / bShown
  const pPool = (aConv + bConv) / (aShown + bShown)
  const se = Math.sqrt(pPool * (1 - pPool) * (1 / aShown + 1 / bShown))
  if (se === 0) return 'need_more'
  const z = Math.abs(p1 - p2) / se
  return z >= 1.96 ? 'significant' : 'need_more' // 95% 양측
}

/** 전환율(%) — 표시용 */
export function conversionRate(shown: number, conv: number): number {
  return shown > 0 ? Math.round((conv / shown) * 1000) / 10 : 0
}
