// [임시 진단] 안드로이드 로그아웃 후 홈 렌더러 크래시(Aw Snap) 사망지점 특정용.
// sendBeacon은 페이지 unload/크래시 중에도 전송되도록 설계됨 → 크래시 직전 단계 포착.
// 원인 확정·수정 후 제거할 것.
export function debugBeacon(eventName: string, properties?: Record<string, unknown>) {
  if (typeof navigator === 'undefined' || typeof navigator.sendBeacon !== 'function') return
  try {
    const body = JSON.stringify({
      eventName,
      path: typeof location !== 'undefined' ? location.pathname : undefined,
      properties,
    })
    navigator.sendBeacon('/api/events', body)
  } catch {
    /* 진단 실패는 무시 */
  }
}
