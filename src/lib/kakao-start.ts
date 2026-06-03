export function safeKakaoCallbackUrl(url: string): string {
  return url.startsWith('/') && !url.startsWith('//') ? url : '/'
}

export function kakaoStartUrl(callbackUrl = '/'): string {
  return `/api/login/kakao?callbackUrl=${encodeURIComponent(safeKakaoCallbackUrl(callbackUrl))}`
}

export function startKakaoLogin(callbackUrl = '/'): void {
  window.location.assign(kakaoStartUrl(callbackUrl))
}
