/**
 * 봇 UA 패턴 — 단일 소스 (layout.tsx / middleware.ts / events/route.ts 공통 참조)
 *
 * 변경 시 세 파일 모두 자동 반영됨.
 */
export const BOT_UA_PATTERN =
  /googlebot|bingbot|yandex|baidu|facebookexternalhit|twitterbot|^node\b|node-fetch|python-requests|python\/|axios|HeadlessChrome|Playwright|curl|wget/i
