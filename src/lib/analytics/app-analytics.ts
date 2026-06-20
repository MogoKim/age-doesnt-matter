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

/**
 * 앱에서만 Firebase Analytics 이벤트 전송. 웹/TWA는 no-op.
 *
 * `Promise<void>`를 반환한다 — 호출부가 `await`하면 동적 import + native logEvent 완료까지 기다린다.
 * 전환 직후 곧바로 navigate(router.replace 등)하는 경로에서 `await` 없이 호출하면,
 * 동적 import가 끝나기 전에 페이지가 전환돼 이벤트가 **유실**될 수 있다(sign_up/onboarding_complete 사례).
 * navigate 직전 발화는 반드시 `await appLogEvent(...)`로 호출할 것.
 */
export async function appLogEvent(name: string, params?: EventParams): Promise<void> {
  if (!isAppNative()) return
  try {
    const { FirebaseAnalytics } = await import('@capacitor-firebase/analytics')
    await FirebaseAnalytics.logEvent({ name, params })
  } catch { /* 분석 실패가 사용자 흐름을 막지 않는다 */ }
}

/** 앱에서만 user property 설정(앱·웹 구분 등). 웹/TWA는 no-op. */
export function appSetUserProperty(key: string, value: string): void {
  if (!isAppNative()) return
  void import('@capacitor-firebase/analytics')
    .then(({ FirebaseAnalytics }) => FirebaseAnalytics.setUserProperty({ key, value }))
    .catch(() => {})
}
