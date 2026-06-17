import type { CapacitorConfig } from '@capacitor/cli'

/**
 * ⚠️ PoC ONLY — NOT for production app release. (Phase 2-1)
 *
 * iOS Capacitor shell이 우나어 웹을 server.url로 로드해 렌더/감지/광고OFF를 검증하는 용도.
 *  - server.url은 Capacitor 공식상 production intended 아님(개발용 live-reload). iOS 출시엔 App Store 4.2/4.7 리스크 별도 검토 필요.
 *  - 실기기 테스트 URL은 localhost 금지 → iOS 기기에서 접근 가능한 HTTPS(=Vercel Preview 또는 안전한 스테이징/터널)로 교체할 것.
 *    production 도메인 직접 로드 금지(GA4/EventLog 오염 방지).
 *  - bundle id는 com.agenotmatter.app로 시작하되, Apple Developer 사용가능 여부는 외부 확인 필요(이 확인 없이 App Store/TestFlight 통과 보장 아님).
 *  - 2-1 범위: auth/push/딥링크 플러그인 없음. (2-2 이후)
 */
const config: CapacitorConfig = {
  appId: 'com.agenotmatter.app',
  appName: '우리 나이가 어때서',
  // server.url 사용 시 실제로 서빙되진 않으나 Capacitor가 webDir 존재를 요구 → 기존 public 폴더를 placeholder로.
  webDir: 'public',
  server: {
    // TODO(PoC): 본인 Vercel Preview HTTPS(또는 스테이징/터널)로 교체. production 도메인·localhost 금지.
    url: 'https://REPLACE-WITH-VERCEL-PREVIEW.vercel.app',
    cleartext: false,
  },
  ios: {
    contentInset: 'always',
  },
}

export default config
