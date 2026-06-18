import type { CapacitorConfig } from '@capacitor/cli'

/**
 * ⚠️ PoC ONLY — NOT for production app release. (Phase 2-1)
 *
 * iOS Capacitor shell이 우나어 웹을 server.url로 로드해 렌더/감지/광고OFF를 검증하는 용도.
 *  - server.url은 Capacitor 공식상 production intended 아님(개발용 live-reload).
 *  - 검증용 URL = poc 브랜치 Vercel Preview(배포본). PoC 코드(isCapacitor/광고OFF) + DB 환경 정상.
 *  - production 도메인(age-doesnt-matter.com) 직접 로드 금지: PoC 코드 미포함 + GA4/EventLog 오염.
 *  - 이 설정은 App Store/TestFlight/production 배포용이 아니다. main merge·production 배포 금지.
 *  - 2-1 범위: auth/push/딥링크 플러그인 없음. (2-2 이후)
 */
const config: CapacitorConfig = {
  appId: 'com.agenotmatter.app',
  appName: '우리 나이가 어때서',
  webDir: 'public',
  server: {
    // production 정식 빌드: 실서비스 도메인 로드. (Day2 검증은 Preview URL로 진행, main merge로 production에 코드 반영됨)
    url: 'https://age-doesnt-matter.com',
    cleartext: false,
  },
  ios: {
    contentInset: 'always',
  },
}

export default config