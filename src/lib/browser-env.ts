/**
 * 브라우저 환경 판정 — **순수 함수**(UA 문자열만 받는다. window 접근 없음 → 단위 테스트 가능).
 *
 * ## 왜 따로 두는가
 * 전환 실험의 **분모**가 되는 판정이라 오판하면 데이터 전체가 오염된다.
 * 기존 `detectEnv()`(AddToHomeScreen)는 설치 팝업용 분류라
 *  - `window.innerWidth >= 1024`로 desktop을 걸러서 **창을 줄인 데스크탑이 android-chrome으로 새고**,
 *  - 마지막이 `return 'android-chrome'`인 **catch-all**이라 안드로이드가 아닌 것도 안드로이드로 잡힌다.
 * 그래서 정책 세그먼트 판정은 여기서 **UA에 Android가 있는지 양성 확인**으로 다시 정의한다.
 *
 * ## 정책 세그먼트: "Android 외부 브라우저"
 * "Android Chrome"이 아니라 **Android 외부 브라우저**가 정책 단위다.
 *  - 포함: Chrome / **Whale(네이버 웨일 브라우저)** / Samsung Internet / Firefox 등 안드로이드 일반 브라우저
 *  - 제외: 카카오·네이버앱·Instagram/Facebook·Google앱 **인앱브라우저**, 안드로이드 **WebView**,
 *          iPhone/iPad, desktop, 그리고 (UA로는 못 잡는) TWA·Capacitor·standalone PWA
 *
 * ⚠️ Whale을 이름으로 하드코딩하지 않는다. "Android이고 인앱/WebView가 아니다"라는 조건으로
 *    자연히 포함된다. 브라우저가 하나 늘 때마다 코드를 고치는 구조를 만들지 않기 위함이다.
 * ⚠️ **네이버 웨일 브라우저 ≠ 네이버 앱 인앱브라우저**. 전자는 독립 브라우저(포함),
 *    후자는 `NAVER(inapp` UA를 쓰는 인앱(제외). 둘을 절대 같이 묶지 않는다.
 */

/** 인앱브라우저 종류 — 외부 브라우저 정책에서 전부 제외 대상 */
export type InAppBrowser = 'kakao' | 'naver' | 'meta' | 'google' | 'daum' | null

/**
 * 인앱브라우저 판정.
 * 네이버는 **앱 인앱브라우저만** 잡는다(`NAVER(inapp` / `NaverSearchApp`).
 * 웨일 브라우저는 이 패턴을 쓰지 않으므로 여기서 걸리지 않는다.
 */
export function detectInAppBrowser(ua: string): InAppBrowser {
  if (!ua) return null
  if (/KAKAOTALK/i.test(ua)) return 'kakao'
  if (/NAVER\(inapp|NaverSearchApp/i.test(ua)) return 'naver'
  if (/Instagram|FBAN|FBAV|FB_IAB/i.test(ua)) return 'meta'
  if (/\bGSA\//i.test(ua)) return 'google'
  if (/DaumApps/i.test(ua)) return 'daum'
  return null
}

/** UA에 Android 토큰이 있는가 (desktop·iOS를 양성 조건으로 배제하기 위한 기준) */
export function isAndroidUa(ua: string): boolean {
  return /Android/i.test(ua)
}

/** UA가 iOS 기기인가 */
export function isIosUa(ua: string): boolean {
  return /iPhone|iPad|iPod/i.test(ua)
}

/**
 * 안드로이드 **WebView**인가 — UA 괄호 안 `; wv` 토큰.
 * 앱이 품고 있는 브라우저(Capacitor 셸, 목록에 없는 각종 인앱)를 통째로 제외하기 위한 안전망.
 * TWA는 wv가 붙지 않으므로 여기서는 안 걸린다 → TWA는 런타임 플래그로 따로 제외해야 한다.
 */
export function isAndroidWebView(ua: string): boolean {
  return isAndroidUa(ua) && /;\s*wv[);]/i.test(ua)
}

/**
 * **Android 외부 브라우저**인가 (UA만으로 판정).
 *
 * ⚠️ 이것만으로는 부족하다 — TWA/Capacitor/standalone PWA는 UA가 일반 크롬과 같아
 *    UA로 구분할 수 없다. 런타임 판정에는 반드시 {@link isAndroidExternalBrowserEnv}를 쓸 것.
 */
export function isAndroidExternalBrowser(ua: string): boolean {
  if (!ua) return false
  if (!isAndroidUa(ua)) return false          // desktop(창 크기 무관)·iOS 전부 여기서 탈락
  if (isIosUa(ua)) return false               // 방어: Android·iOS 토큰이 함께 있는 비정상 UA
  if (detectInAppBrowser(ua) !== null) return false
  if (isAndroidWebView(ua)) return false
  return true
}

/** {@link isAndroidExternalBrowserEnv} 입력 — UA로 못 잡는 앱 컨테이너는 호출부가 넘긴다 */
export interface BrowserEnvInput {
  userAgent: string
  /** Play스토어 TWA 앱으로 실행 중 (useAppEnvironment.isTWA) */
  isTWA: boolean
  /** Capacitor 네이티브 셸 (useAppEnvironment.isCapacitor) */
  isCapacitor: boolean
  /** 홈 화면에 추가한 standalone PWA (useAppEnvironment.isStandalone) */
  isStandalone: boolean
}

/**
 * 런타임 **Android 외부 브라우저** 판정 — 실험 세그먼트의 정본.
 * 이미 앱/설치 상태(TWA·Capacitor·standalone)면 "외부 브라우저"가 아니다.
 */
export function isAndroidExternalBrowserEnv(input: BrowserEnvInput): boolean {
  if (input.isTWA || input.isCapacitor || input.isStandalone) return false
  return isAndroidExternalBrowser(input.userAgent)
}

/**
 * Play스토어 referrer(UTM)에 넣을 식별자 정리.
 * referrer는 URL 인코딩되어 Google Play 서버로 가므로, 값이 깨지지 않게 안전 문자만 남긴다.
 * 빈 값이 되면 호출부가 기본값으로 대체한다.
 */
export function sanitizeUtmToken(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9_-]/g, '_').replace(/_{2,}/g, '_').replace(/^_+|_+$/g, '')
}
