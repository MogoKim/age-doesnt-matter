/**
 * 클라이언트 이벤트 트래킹 유틸
 * Usage: trackEvent('page_view', { path: '/jobs' })
 */
export function trackEvent(
  eventName: string,
  properties?: Record<string, unknown>
) {
  if (typeof window === 'undefined') return

  const payload = {
    eventName,
    path: window.location.pathname,
    referrer: document.referrer || undefined,
    properties,
  }

  // 내부 트래픽 감지 — localStorage.setItem('unao_internal','1') 설정 시 founder로 기록
  // sendBeacon은 커스텀 헤더 불가 → fetch 사용
  if (localStorage.getItem('unao_internal') === '1') {
    fetch('/api/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-bot-type': 'founder' },
      body: JSON.stringify(payload),
      keepalive: true,
    }).catch(() => {})
    return
  }

  // fire-and-forget (beacon API for reliability)
  if (navigator.sendBeacon) {
    navigator.sendBeacon('/api/events', JSON.stringify(payload))
  } else {
    fetch('/api/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      keepalive: true,
    }).catch(() => {})
  }
}
