/**
 * 실고객 판별 — **의존성 없는 중립 모듈**.
 *
 * 기준: `providerId` 가 순수 숫자면 진짜 카카오 가입자.
 * 봇(`seed*`·`curator-*`·`bot-*` 등)은 비숫자라 여기서 걸러진다.
 *
 * ── 왜 별도 모듈인가 ────────────────────────────────────────
 *  같은 규칙이 세 곳에 복사돼 있었다 — 알림(`notify.ts`)·인사이트·리텐션.
 *  정본을 어느 한쪽에 두면 방향이 이상해진다:
 *    · 관리자 쿼리에 두면 **알림 모듈이 관리자 쿼리에 의존**하게 된다.
 *    · 알림 모듈에 두면 관리자 쿼리가 푸시 페이로드 타입까지 끌고 온다.
 *  그래서 아무것도 import 하지 않는 중립 위치에 둔다.
 */
export function isRealUser(providerId: string | null | undefined): boolean {
  return !!providerId && /^\d+$/.test(providerId)
}
