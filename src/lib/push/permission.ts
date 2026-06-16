'use client'

// localStorage 키
// push_granted: '1'           → 허용됨, 영구 비표시
// push_denied_count: number   → 1=1일 대기, 2+=30일 대기
// push_denied_at: ISO string  → 마지막 거부 시각

export function canAskPushPermission(): boolean {
  if (typeof window === 'undefined') return false
  if (!('Notification' in window)) return false
  if (Notification.permission === 'granted') return false  // 이미 허용
  if (Notification.permission === 'denied') return false   // 브라우저 레벨 영구 거부
  if (localStorage.getItem('push_granted')) return false   // 앱 레벨 허용

  const deniedAt = localStorage.getItem('push_denied_at')
  if (!deniedAt) return true  // 한 번도 안 물어봄

  const count = parseInt(localStorage.getItem('push_denied_count') ?? '1')
  // 점증 쿨다운: 1회=1일 / 2회=7일 / 3회+=14일 (과거 30일 일괄 → 재요청 기회 확대)
  const waitMs = count >= 3 ? 14 * 86400_000
    : count === 2 ? 7 * 86400_000
    : 86400_000
  return Date.now() - new Date(deniedAt).getTime() >= waitMs
}

export function recordDenied(): void {
  const count = parseInt(localStorage.getItem('push_denied_count') ?? '0') + 1
  localStorage.setItem('push_denied_count', String(count))
  localStorage.setItem('push_denied_at', new Date().toISOString())
}

export function recordGranted(): void {
  localStorage.setItem('push_granted', '1')
  localStorage.removeItem('push_denied_count')
  localStorage.removeItem('push_denied_at')
}
