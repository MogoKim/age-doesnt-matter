/**
 * first-party origin 판정 — 순수 로직.
 *
 * `@playwright/test` 를 import 하지 않는다. 그래야 단위 테스트가 Playwright 런타임을
 * 끌어들이지 않고(= 브라우저·webServer 부작용 없이) 이 로직만 검증할 수 있다.
 * fixture(first-party-header.ts)가 이 파일을 쓴다.
 */

export const BOT_TYPE_HEADER = 'x-bot-type'
export const BOT_TYPE_VALUE = 'e2e-test'

/** 환경변수와 무관하게 항상 first-party 로 취급하는 origin */
export const DEFAULT_FIRST_PARTY_ORIGINS = [
  'http://localhost:3000',
  'https://age-doesnt-matter.com',
  'https://www.age-doesnt-matter.com',
] as const

/** 프로젝트별 baseURL 을 공급하는 환경변수 (playwright.config.ts 의 use.baseURL 출처) */
export const FIRST_PARTY_ENV_KEYS = ['E2E_BASE_URL', 'QA_AUDIT_URL', 'QA_EVENT_URL'] as const

/**
 * URL 문자열을 origin 으로 정규화한다.
 *
 * 잘못된 값은 **조용히 무시하지 않고** 명확히 실패시킨다.
 * 오타 하나로 헤더가 통째로 빠지면 EventLog 와 익명 세션이 오염되는데,
 * 그건 조용히 넘어가서는 안 되는 사고다.
 */
export function toOrigin(value: string, source: string): string {
  try {
    return new URL(value).origin
  } catch {
    throw new Error(
      `[first-party-header] ${source} 값이 유효한 URL 이 아닙니다: ${JSON.stringify(value)}`,
    )
  }
}

/** 허용 origin 집합 = 기본 3개 + 설정된 환경변수 + 현재 프로젝트 baseURL */
export function buildFirstPartyOrigins(
  env: Record<string, string | undefined> = process.env,
  baseURL?: string,
): Set<string> {
  const origins = new Set<string>(
    DEFAULT_FIRST_PARTY_ORIGINS.map((u) => toOrigin(u, 'DEFAULT_FIRST_PARTY_ORIGINS')),
  )
  for (const key of FIRST_PARTY_ENV_KEYS) {
    const raw = env[key]
    if (raw === undefined || raw === '') continue
    origins.add(toOrigin(raw, key))
  }
  if (baseURL) origins.add(toOrigin(baseURL, 'project baseURL'))
  return origins
}

/**
 * 요청 URL 이 first-party 인가.
 * origin 문자열 완전일치이므로 `age-doesnt-matter.com.evil.example` 같은 접미사 공격이 통하지 않는다.
 * 파싱 불가한 URL(data:, about:, blob:)은 서드파티로 본다(fail-closed).
 */
export function isFirstPartyUrl(url: string, origins: Set<string>): boolean {
  try {
    return origins.has(new URL(url).origin)
  } catch {
    return false
  }
}
