/**
 * 클라이언트 이벤트 트래킹 유틸
 * Usage: trackEvent('page_view', { path: '/jobs' })
 *
 * 모든 payload에 비회원 기기 식별자 `anon_cid`를 **중앙에서** 동봉한다(F19).
 * 호출부 API는 바뀌지 않는다 — 각 컴포넌트가 식별자를 신경 쓸 필요가 없고,
 * 신경 쓰지 않아도 첫 방문 동시 이벤트가 하나로 묶인다.
 * 기준: `docs/features/F19-anonymous-session-measurement.md`
 */
import { getOrCreateAnonCid } from './anon-cid'

/**
 * localStorage 접근은 시크릿 모드·스토리지 차단 인앱브라우저에서 throw할 수 있다.
 * 계측 때문에 이벤트 전송 자체가 죽으면 안 되므로 항상 격리한다(F19 §9 "실패해도 UI/전송을 막지 않는다").
 */
function readLocalStorage(key: string): string | null {
  try {
    return window.localStorage.getItem(key)
  } catch {
    return null
  }
}

export function trackEvent(
  eventName: string,
  properties?: Record<string, unknown>
) {
  if (typeof window === 'undefined') return

  // 동기 조회 — 네트워크 왕복 없음, 초기 렌더를 막는 await 없음.
  // 스토리지 차단 환경에서는 null → anon_cid 없이 그대로 전송하고 서버가 `_anon_sid`로 fallback 한다.
  const anonCid = getOrCreateAnonCid()

  // ⚠️ 중앙값 우선(덮어쓰기). 호출부가 넘긴 anon_cid는 무시한다.
  //   식별자는 단일 출처여야 한다 — 호출부가 실수로 다른 값을 넣으면 실험 분모·리텐션이 조용히 오염된다.
  const mergedProperties = anonCid
    ? { ...properties, anon_cid: anonCid }
    : properties

  const payload = {
    eventName,
    path: window.location.pathname,
    referrer: document.referrer || undefined,
    properties: mergedProperties,
  }

  // 내부 트래픽 감지 — localStorage.setItem('unao_internal','1') 설정 시 founder로 기록
  // sendBeacon은 커스텀 헤더 불가 → fetch 사용
  if (readLocalStorage('unao_internal') === '1') {
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
    // Blob으로 Content-Type 명시 (text/plain 기본 → 서버 파싱 안정)
    navigator.sendBeacon('/api/events', new Blob([JSON.stringify(payload)], { type: 'application/json' }))
  } else {
    fetch('/api/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      keepalive: true,
    }).catch(() => {})
  }
}
