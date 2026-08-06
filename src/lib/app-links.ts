import { gtmPlayStoreClick } from '@/lib/gtm'
import { isAndroidExternalBrowser, sanitizeUtmToken } from '@/lib/browser-env'

// Google Play 스토어 (안드로이드 TWA 앱) — 패키지 id는 assetlinks·Play Console과 묶여 있어 불변
const PLAY_STORE_BASE = 'https://play.google.com/store/apps/details?id=com.agenotmatter.app&hl=ko'

/** Play Console 획득 보고서에서 이 서비스의 웹 유도를 한 덩어리로 보기 위한 캠페인명 (불변) */
const PLAY_STORE_CAMPAIGN = 'app_install'
/** 진입점을 특정할 수 없을 때만 쓰는 medium 기본값 */
const DEFAULT_PLACEMENT = 'app_install_cta'

/**
 * Play 스토어 URL + Install Referrer(UTM) 부착.
 *
 * referrer 파라미터는 Google Play 서버가 수집 → **Play Console 획득 보고서**에
 * 출처(utm_source/medium/campaign)별 설치수로 집계된다(앱 SDK·코드 불필요).
 *  - 단, 앱 내부 Install Referrer API 읽기는 우리 TWA(웹 래퍼)에 호출 코드가 없어 동작하지 않음.
 *  - GA4 사용자단위 web→app 연결은 Firebase 미연동이라 불가.
 *  - 웹 측 클릭 추적은 gtmPlayStoreClick()(play_store_click)로 별도 수집.
 *
 * ## medium 하드코딩 정리 (2026-08-06)
 * 예전에는 진입점과 무관하게 `utm_medium=footer`가 고정이었다. footer 진입점은 이미 사라졌는데도
 * PostCTA·홈 FAQ·인라인 배너의 설치가 전부 "footer"로 집계돼, **Play Console에서 진입점을 구분할 수 없었다.**
 * (utm_content는 획득 보고서에서 분해되지 않아 medium이 사실상 유일한 구분자다.)
 * → 이제 **medium이 진입점(placement)** 을 담는다. 진입점별 설치 수를 그대로 볼 수 있다.
 *
 * ⚠️ 시계열 주의: 이 변경 이후 Play Console의 `footer` medium은 더 이상 증가하지 않는다.
 *    이전 데이터와 직접 비교하지 말 것.
 *
 * @param placement 진입점 식별자 (`post_cta` / `home_faq_android` / `inline` 등). medium·content에 함께 실린다.
 * @param options.medium placement와 다른 medium을 써야 할 때만 지정 (예: 실험 arm 분리)
 */
export function buildPlayStoreUrl(placement?: string, options?: { medium?: string }): string {
  const safePlacement = placement ? sanitizeUtmToken(placement) : ''
  const rawMedium = options?.medium ? sanitizeUtmToken(options.medium) : safePlacement
  const medium = rawMedium || DEFAULT_PLACEMENT

  const utm =
    `utm_source=website&utm_medium=${medium}&utm_campaign=${PLAY_STORE_CAMPAIGN}` +
    (safePlacement ? `&utm_content=${safePlacement}` : '')
  return `${PLAY_STORE_BASE}&referrer=${encodeURIComponent(utm)}`
}

// TWA(앱)와 연결된 서비스 도메인 (assetlinks.json 검증 대상)
const APP_HOST = 'age-doesnt-matter.com'

/**
 * referrer 문자열(예: "utm_source=naver&utm_medium=blog&utm_campaign=magazine")을
 * 그대로 받는 Play스토어 URL. 채널별 utm을 직접 제어 → Play Console 획득보고서에 분리 집계.
 */
export function buildPlayStoreUrlRaw(referrer: string): string {
  return referrer
    ? `${PLAY_STORE_BASE}&referrer=${encodeURIComponent(referrer)}`
    : PLAY_STORE_BASE
}

/**
 * referrer 문자열을 그대로 받는 안드로이드 intent URL.
 * 앱 설치 → 앱 / 미설치 → Play스토어(referrer 포함) 폴백.
 */
export function buildAndroidIntentUrlRaw(targetPath: string, referrer: string): string {
  const path = targetPath.startsWith('/') ? targetPath : `/${targetPath}`
  const fallback = encodeURIComponent(buildPlayStoreUrlRaw(referrer))
  return (
    `intent://${APP_HOST}${path}#Intent;scheme=https;` +
    `package=com.agenotmatter.app;S.browser_fallback_url=${fallback};end`
  )
}

/**
 * **Android 외부 브라우저** = Play스토어로 유도하는 환경인지 (런타임).
 *
 * 세그먼트 정의는 `@/lib/browser-env`의 {@link isAndroidExternalBrowser}가 정본이다.
 * Chrome뿐 아니라 **Whale·Samsung Internet 등 안드로이드 일반 브라우저를 모두 포함**하고,
 * 인앱브라우저·WebView·iOS·desktop은 제외한다.
 *
 * ⚠️ TWA·Capacitor·standalone PWA는 UA로 구분할 수 없다. 호출부가 `useAppEnvironment`의
 *    `isTWA`/`isCapacitor`/`isStandalone`으로 **먼저 걸러낸 뒤** 이 함수를 쓴다
 *    (PostCTA·PwaInlineBanner 모두 그렇게 하고 있다).
 *    앱 컨테이너까지 한 번에 판정해야 하면 `isAndroidExternalBrowserEnv`를 직접 쓸 것.
 */
export function isAndroidExternalBrowserEnv(): boolean {
  if (typeof navigator === 'undefined') return false
  return isAndroidExternalBrowser(navigator.userAgent)
}

/**
 * 앱 설치 유도 — 플랫폼 분리:
 * - Android 외부 브라우저: Play스토어(TWA)로 이동 (referrer UTM 포함, medium=진입점)
 * - 그 외(iOS Safari 등): PWA "홈 화면에 추가" 흐름(pwa-prompt 이벤트)
 *   ⚠️ 이 리스너는 `AddToHomeScreen`이 `NEXT_PUBLIC_PWA_INSTALL_ENABLED==='true'`일 때만 등록한다.
 *      플래그가 꺼져 있으면 아무 일도 일어나지 않으므로, 호출부가 CTA 자체를 감춰야 한다(PostCTA 참고).
 * @param placement 진입점 식별자 — GTM `play_store_click.source` + Play referrer medium/content 공용
 */
export function triggerAppInstall(placement: string): void {
  if (isAndroidExternalBrowserEnv()) {
    gtmPlayStoreClick(placement)
    window.location.href = buildPlayStoreUrl(placement)
  } else {
    window.dispatchEvent(new CustomEvent('pwa-prompt', { detail: 'manual' }))
  }
}
