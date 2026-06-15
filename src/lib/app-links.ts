import { detectEnv } from '@/components/common/AddToHomeScreen'
import { gtmPlayStoreClick } from '@/lib/gtm'

// Google Play 스토어 (안드로이드 TWA 앱)
const PLAY_STORE_BASE = 'https://play.google.com/store/apps/details?id=com.agenotmatter.app&hl=ko'

/** @deprecated referrer 추적을 위해 buildPlayStoreUrl(utmContent) 사용 권장. (호환 위해 유지) */
export const PLAY_STORE_URL = PLAY_STORE_BASE

/**
 * Play 스토어 URL + Install Referrer(UTM) 부착.
 *
 * referrer 파라미터는 Google Play 서버가 수집 → **Play Console 획득 보고서**에
 * 출처(utm_source/medium/campaign)별 설치수로 집계된다(앱 SDK·코드 불필요).
 *  - 단, 앱 내부 Install Referrer API 읽기는 우리 TWA(웹 래퍼)에 호출 코드가 없어 동작하지 않음.
 *  - GA4 사용자단위 web→app 연결은 Firebase 미연동이라 불가.
 *  - 웹 측 클릭 추적은 gtmPlayStoreClick()(play_store_click)로 별도 수집.
 *
 * @param utmContent 채널 식별자(web_android / web_desktop 등). 생략 시 캠페인만 부착.
 */
export function buildPlayStoreUrl(utmContent?: string): string {
  const utm =
    'utm_source=website&utm_medium=footer&utm_campaign=app_install' +
    (utmContent ? `&utm_content=${utmContent}` : '')
  return `${PLAY_STORE_BASE}&referrer=${encodeURIComponent(utm)}`
}

// TWA(앱)와 연결된 서비스 도메인 (assetlinks.json 검증 대상)
const APP_HOST = 'age-doesnt-matter.com'

/**
 * 안드로이드 intent:// URL 생성 — "앱 있으면 앱, 없으면 Play스토어".
 *
 * 카카오톡 등 인앱 브라우저에서 버튼 링크를 열어도 동작하도록 intent 스킴 사용:
 *  - 앱 설치 시: TWA가 해당 https 경로를 핸들링 → 앱으로 열림
 *  - 앱 미설치 시: `browser_fallback_url`(Play스토어, referrer UTM 포함)로 자동 이동
 *
 * @param targetPath 앱/웹에서 열 내부 경로 (기본 '/'). '/'로 시작하지 않으면 보정.
 * @param utmContent Play스토어 referrer 식별자 (기본 'welcome_msg')
 */
export function buildAndroidIntentUrl(targetPath = '/', utmContent = 'welcome_msg'): string {
  const path = targetPath.startsWith('/') ? targetPath : `/${targetPath}`
  const fallback = encodeURIComponent(buildPlayStoreUrl(utmContent))
  return (
    `intent://${APP_HOST}${path}#Intent;scheme=https;` +
    `package=com.agenotmatter.app;S.browser_fallback_url=${fallback};end`
  )
}

/** 안드로이드(Chrome/Samsung Internet) = Play스토어로 유도하는 환경인지 */
export function isAndroidInstallEnv(): boolean {
  const env = detectEnv()
  return env === 'android-chrome' || env === 'other'
}

/**
 * 앱 설치 유도 — 플랫폼 분리:
 * - 안드로이드: Play스토어(TWA)로 이동 (referrer UTM 포함)
 * - iOS Safari 등: 기존 PWA "홈 화면에 추가" 흐름(pwa-prompt) 유지
 * @param source GTM 추적용 진입점 식별자 (referrer utm_content로도 사용)
 */
export function triggerAppInstall(source: string): void {
  if (isAndroidInstallEnv()) {
    gtmPlayStoreClick(source)
    window.location.href = buildPlayStoreUrl(source)
  } else {
    window.dispatchEvent(new CustomEvent('pwa-prompt', { detail: 'manual' }))
  }
}
