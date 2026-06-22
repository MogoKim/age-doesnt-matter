'use client'

import { isAppNative } from '@/lib/analytics/app-analytics'

/**
 * 앱(Capacitor 네이티브) 전용 FCM 토큰 등록 — 웹/TWA는 no-op.
 *
 * 웹푸시(subscribe.ts: pushManager.subscribe)는 Android WebView에서 동작 불가 →
 * 앱 사용자는 @capacitor-firebase/messaging로 OS 권한 요청 + FCM token 발급 후 서버 저장.
 * @capacitor-firebase/messaging는 client 전용 → 동적 import로 웹 번들 부담 0.
 *
 * 발송(서버)은 다음 단계(Firebase Admin SDK). 본 모듈은 token 수집까지만 책임.
 *
 * ⚠️ Capacitor 플러그인 프록시를 Promise resolution 값으로 반환하면 안 된다.
 * 프록시는 모든 프로퍼티 접근(then 포함)을 네이티브 호출로 라우팅하므로, Promise가
 * 프록시를 thenable로 보고 proxy.then()을 호출 → "FirebaseMessaging.then() is not
 * implemented on android" throw. 그래서 import한 모듈에서 매번 직접 구조분해해 쓴다.
 * (동일 버그가 app-analytics.ts에도 존재 — 별도 수정 필요)
 */

function getPlatform(): 'android' | 'ios' {
  if (typeof window === 'undefined') return 'android'
  const cap = (window as Window & { Capacitor?: { getPlatform?: () => string } }).Capacitor
  return cap?.getPlatform?.() === 'ios' ? 'ios' : 'android'
}

export type FcmRegisterResult = 'registered' | 'denied' | 'unsupported' | 'error'

async function saveToken(token: string): Promise<boolean> {
  try {
    const res = await fetch('/api/push/fcm-token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, platform: getPlatform() }),
    })
    return res.ok
  } catch {
    return false
  }
}

/**
 * 앱에서 FCM 권한 요청 → token 발급 → 서버 저장.
 * 반환:
 * - 'registered'  : 권한 허용 + 토큰 저장 성공
 * - 'denied'      : OS 권한 거부 (Android 13+ POST_NOTIFICATIONS)
 * - 'unsupported' : 앱(native)이 아님 (웹/TWA)
 * - 'error'       : 권한 허용됐으나 토큰 발급/저장 실패 (재시도 여지)
 */
export async function registerFcmToken(): Promise<FcmRegisterResult> {
  if (!isAppNative()) return 'unsupported'
  try {
    const { FirebaseMessaging } = await import('@capacitor-firebase/messaging')

    let { receive } = await FirebaseMessaging.checkPermissions()
    if (receive === 'prompt' || receive === 'prompt-with-rationale') {
      receive = (await FirebaseMessaging.requestPermissions()).receive
    }
    if (receive !== 'granted') return 'denied'

    const { token } = await FirebaseMessaging.getToken()
    if (!token) return 'error'

    return (await saveToken(token)) ? 'registered' : 'error'
  } catch {
    return 'error'
  }
}

/**
 * 토큰 회전(앱 재설치/시간경과) 대응 — 'tokenReceived' 리스너로 새 토큰 자동 재저장.
 * 반환: 리스너 해제 함수. 웹/TWA는 no-op(() => {}).
 */
export async function listenFcmTokenRefresh(): Promise<() => void> {
  if (!isAppNative()) return () => {}
  try {
    const { FirebaseMessaging } = await import('@capacitor-firebase/messaging')
    const handle = await FirebaseMessaging.addListener('tokenReceived', ({ token }) => {
      if (token) void saveToken(token)
    })
    return () => { void handle.remove() }
  } catch {
    return () => {}
  }
}

/**
 * 로그아웃/알림 끄기 시: 현재 토큰을 서버에서 삭제 + native 토큰 무효화.
 * (호출부에서 로그아웃 핸들러에 연결 — 본 MVP는 함수 제공까지.)
 */
export async function unregisterFcmToken(): Promise<void> {
  if (!isAppNative()) return
  try {
    const { FirebaseMessaging } = await import('@capacitor-firebase/messaging')
    const { token } = await FirebaseMessaging.getToken().catch(() => ({ token: '' }))
    if (token) {
      await fetch('/api/push/fcm-token', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      }).catch(() => {})
    }
    await FirebaseMessaging.deleteToken().catch(() => {})
  } catch {
    /* 실패해도 사용자 흐름 막지 않음 */
  }
}
