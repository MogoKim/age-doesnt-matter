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
