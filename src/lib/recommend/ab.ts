/**
 * 관련글 추천 알고리즘 A/B 버킷 — 50:50 고정 배정(클라이언트 전용).
 *
 * `_anon_sid` 쿠키는 httpOnly라 클라에서 못 읽으므로, localStorage에 1회 생성한 uuid를 해시해 v1/v2로 고정 배정한다.
 * - 같은 브라우저는 항상 같은 arm(localStorage 지속) → 세션 간 일관.
 * - storage 차단(사파리 프라이빗 등) → 'v1'(control) fallback. v2로 새지 않음.
 * - 배정 결과(arm)는 기존 related_recommend_view.algo_version / related_post_click.algoVersion 에 실려 분석된다(신규 필드 0).
 */
const KEY = 'unao_ab_related'

export type RelatedArm = 'v1' | 'v2'

export function getRelatedAbArm(): RelatedArm {
  if (typeof window === 'undefined') return 'v1'
  try {
    const cur = window.localStorage.getItem(KEY)
    if (cur === 'v1' || cur === 'v2') return cur
    const seed =
      (typeof crypto !== 'undefined' && crypto.randomUUID?.()) ||
      `${Date.now()}-${Math.random()}`
    let h = 0
    for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0
    const arm: RelatedArm = Math.abs(h) % 2 === 0 ? 'v1' : 'v2'
    window.localStorage.setItem(KEY, arm)
    return arm
  } catch {
    return 'v1' // storage 차단 → control
  }
}
