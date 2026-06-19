/**
 * 앱(Capacitor 네이티브) 전용 Firebase Analytics 전송.
 *
 * - **앱(isNativePlatform)에서만** `@capacitor-firebase/analytics`로 GA4 **Android app stream**(481670969)에 logEvent.
 * - **웹/TWA에서는 no-op** — 기존 `gtag`(GA4 web stream) 경로를 그대로 쓴다(호출부에서 분기).
 *   → 앱에서 gtag 동시 호출 금지(web stream 오염 방지). first_open/app_open은 native SDK 자동.
 * - @capacitor-firebase/analytics는 client 전용 → 동적 import로 웹 번들 부담 0.
 */

type EventParams = Record<string, string | number | boolean>

/** Capacitor 네이티브 앱 여부 (window.Capacitor.isNativePlatform). 웹/TWA=false. */
export function isAppNative(): boolean {
  if (typeof window === 'undefined') return false
  const cap = (window as Window & { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor
  return !!cap?.isNativePlatform?.()
}

/** 앱에서만 Firebase Analytics 이벤트 전송. 웹/TWA는 no-op. */
export function appLogEvent(name: string, params?: EventParams): void {
  if (!isAppNative()) return
  void import('@capacitor-firebase/analytics')
    .then(({ FirebaseAnalytics }) => FirebaseAnalytics.logEvent({ name, params }))
    .catch(() => { /* 분석 실패가 사용자 흐름을 막지 않는다 */ })
}

/** 앱에서만 user property 설정(앱·웹 구분 등). 웹/TWA는 no-op. */
export function appSetUserProperty(key: string, value: string): void {
  if (!isAppNative()) return
  void import('@capacitor-firebase/analytics')
    .then(({ FirebaseAnalytics }) => FirebaseAnalytics.setUserProperty({ key, value }))
    .catch(() => {})
}
