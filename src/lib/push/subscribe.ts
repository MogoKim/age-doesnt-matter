'use client'

export type PushSubscribeResult = 'granted' | 'denied' | 'unsupported' | 'error'

// VAPID public key (URL-safe Base64) → Uint8Array
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = window.atob(base64)
  return Uint8Array.from([...rawData].map((char) => char.charCodeAt(0)))
}

/**
 * OS 푸시 구독 생성: 권한요청 → ServiceWorker → pushManager.subscribe → 서버 저장.
 * 자동 토스트(PushPermissionToast)와 설정 '알림 받기' 버튼이 공유한다.
 *
 * 반환:
 * - 'granted'     : 권한 허용 + 구독 저장 성공 (= 실제 구독 완료)
 * - 'denied'      : 사용자가 OS 권한을 거부
 * - 'unsupported' : 이 브라우저가 웹푸시 미지원
 * - 'error'       : 권한은 허용됐으나 구독/저장 실패 (재시도 여지)
 *
 * 쿨다운·트래킹 등 후처리는 호출부 책임(여기선 순수 구독만).
 */
export async function subscribeToPush(): Promise<PushSubscribeResult> {
  try {
    if (
      typeof window === 'undefined' ||
      !('Notification' in window) ||
      !('serviceWorker' in navigator) ||
      !('PushManager' in window)
    ) {
      return 'unsupported'
    }

    const permission = await Notification.requestPermission()
    if (permission !== 'granted') return 'denied'

    const reg = await navigator.serviceWorker.ready
    const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
    if (!vapidKey) return 'error'

    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidKey) as BufferSource,
    })

    // 구독 저장 — 라우트가 성공 시 마케팅 동의(marketingOptIn+Agreement)도 함께 기록(원자적).
    const res = await fetch('/api/push/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(sub.toJSON()),
    })
    if (!res.ok) return 'error'

    return 'granted'
  } catch {
    return 'error'
  }
}
