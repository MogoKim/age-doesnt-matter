/**
 * 봇 UA 패턴 — 단일 소스 (layout.tsx / middleware.ts / events/route.ts 공통 참조)
 *
 * 변경 시 세 파일 모두 자동 반영됨.
 */
export const BOT_UA_PATTERN =
  /googlebot|bingbot|yandex|baidu|facebookexternalhit|meta-externalagent|facebot|twitterbot|^node\b|node-fetch|python-requests|python\/|axios|HeadlessChrome|Playwright|curl|wget/i

/**
 * 데이터센터 봇 IP 패턴 — GA4 스크립트 차단용 (layout.tsx)
 * GA4 내부 트래픽 정의 GTE 접근 불가로 서버 측 차단으로 대체.
 *
 * 대상: Azure US Ashburn(52.186.*), AWS us-east-1 Ashburn(3.80~93.*),
 *       AWS Seoul(3.39.* / 13.124.* / 15.165.* / 15.164.*)
 */
export const BOT_IP_PATTERN =
  /^(52\.186\.|3\.(8[0-9]|9[0-3])\.|3\.39\.|13\.124\.|15\.165\.|15\.164\.)/
