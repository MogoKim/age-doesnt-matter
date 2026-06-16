/**
 * gtag 초기화 — 지연 로드로 이전됨.
 *
 * 이전: gtag-init inline 스크립트(afterInteractive)가 hydration 직후 dataLayer/gtag/config 실행
 *   → gtag/js(GA4 66KB) + Ads(55KB)가 전 페이지 초기 메인스레드/네트워크 점유.
 * 변경: dataLayer/gtag stub/config + 외부 gtag/js 삽입 전부를 GtagLoader(Client)가
 *   3개 트리거(첫 상호작용/idle/4초 백스톱) 중 먼저 오는 시점에 1회 실행.
 *   → GTMScript는 더 이상 head에 아무것도 주입하지 않는다(배치 유지용 no-op).
 *
 * 이벤트 유실 방어: gtm.ts _eventQueue가 로드 전 이벤트 보존 → onload markGtagReady() 플러시.
 *   전환(sign_up)은 waitForGtagReady()→window.__unaoEnsureGtag로 로드 능동 시작.
 */
export function GTMScript() {
  return null
}

export function GTMNoScript() {
  return null
}
