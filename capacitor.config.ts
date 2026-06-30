import type { CapacitorConfig } from '@capacitor/cli'

/**
 * Capacitor shell이 우나어 웹을 server.url로 로드한다. (Android는 Play 배포 트랙 운영 — vc20)
 *
 *  - server.url은 Capacitor 공식상 production intended 아님(개발용 live-reload)이나,
 *    우나어 웹은 Next.js SSR이라 정적 번들(next export) 불가 → production 도메인 로드를
 *    의도적으로 선택했다(리스크 관리 동의). 상세: docs/android-capacitor-policy-2026-06-21.html §3.
 *  - Android: production 도메인(age-doesnt-matter.com) 로드 = 정식 운영 빌드.
 *  - iOS: App Store 4.2/4.7 리뷰 리스크 별도 트랙(server.url 방식 심사 영향 가능).
 *  - auth/push/딥링크 등 추가 플러그인은 단계적으로 확장.
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