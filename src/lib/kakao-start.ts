import { appLogEvent } from '@/lib/analytics/app-analytics'

export function safeKakaoCallbackUrl(url: string): string {
  return url.startsWith('/') && !url.startsWith('//') ? url : '/'
}

export function kakaoStartUrl(callbackUrl = '/'): string {
  return `/api/login/kakao?callbackUrl=${encodeURIComponent(safeKakaoCallbackUrl(callbackUrl))}`
}

export function startKakaoLogin(callbackUrl = '/'): void {
  // 앱(Capacitor): 시스템 브라우저로 app-login/start 열기 → handoff 토큰으로 WebView 세션 발급.
  //   웹/TWA(window.Capacitor 부재)는 기존 동작 그대로(회귀 0).
  const cap = (window as Window & { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor
  if (cap?.isNativePlatform?.()) {
    // 앱: 카카오 로그인 시도(login_start)를 GA4 app stream에 기록. 웹은 gtag 경로(호출부) 유지.
    appLogEvent('login_start', { method: 'kakao' })
    const safe = safeKakaoCallbackUrl(callbackUrl)
    const url = `${window.location.origin}/api/app-login/start?cb=${encodeURIComponent(safe)}`
    void import('@capacitor/browser').then(({ Browser }) => Browser.open({ url }))
    return
  }
  window.location.assign(kakaoStartUrl(callbackUrl))
}
