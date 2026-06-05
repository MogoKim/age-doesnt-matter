import { detectEnv } from '@/components/common/AddToHomeScreen'
import { gtmPlayStoreClick } from '@/lib/gtm'

// Google Play 스토어 (안드로이드 TWA 앱)
export const PLAY_STORE_URL = 'https://play.google.com/store/apps/details?id=com.agenotmatter.app&hl=ko'

/** 안드로이드(Chrome/Samsung Internet) = Play스토어로 유도하는 환경인지 */
export function isAndroidInstallEnv(): boolean {
  const env = detectEnv()
  return env === 'android-chrome' || env === 'other'
}

/**
 * 앱 설치 유도 — 플랫폼 분리:
 * - 안드로이드: Play스토어(TWA)로 이동
 * - iOS Safari 등: 기존 PWA "홈 화면에 추가" 흐름(pwa-prompt) 유지
 * @param source GTM 추적용 진입점 식별자
 */
export function triggerAppInstall(source: string): void {
  if (isAndroidInstallEnv()) {
    gtmPlayStoreClick(source)
    window.location.href = PLAY_STORE_URL
  } else {
    window.dispatchEvent(new CustomEvent('pwa-prompt', { detail: 'manual' }))
  }
}
