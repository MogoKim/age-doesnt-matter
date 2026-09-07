/**
 * 공용 Playwright fixture — `x-bot-type` 을 **first-party 요청에만** 붙인다.
 *
 * 배경: `playwright.config.ts` 의 `use.extraHTTPHeaders` 는 브라우저 컨텍스트가 보내는
 * **모든** 요청에 헤더를 실는다. first-party 여부를 가리지 않으므로 페이지 안의 서드파티
 * 광고 iframe 이 외부 스크립트를 부를 때도 실려 preflight 가 거부됐다.
 *   Access to script at 'static.cloudflareinsights.com/...' from origin
 *   'ads-partners.coupang.com' blocked by CORS: Request header field x-bot-type is not allowed
 * 광고가 실제로 렌더된 실행에서만 재현돼 CI 가 무작위로 실패했다.
 *
 * 지켜야 할 계약(이게 깨지면 지금보다 나쁘다):
 *   - `/api/events` 의 detectBot 이 `isBot=true` 로 기록 → EventLog 오염 방지
 *   - `middleware.ts` 가 `_anon_sid` 쿠키를 발급하지 않음 → 익명 세션 오염 방지
 * 두 지점 모두 `x-bot-type` 헤더를 보므로 **first-party 에서는 반드시 유지**해야 한다.
 * UA 로는 대체할 수 없다 — device descriptor 가 UA 를 실제 Chrome 으로 덮어써
 * `BOT_UA_PATTERN` 에 걸리지 않는다(2026-09-07 실측: 9개 실행조건 중 8개가 "사람" 판정).
 *
 * ⚠️ 모든 spec 은 `@playwright/test` 가 아니라 이 파일에서 test/expect 를 import 한다.
 *    raw import 하면 이 fixture 가 아예 실행되지 않아 헤더가 붙지 않는다.
 *    차단은 ESLint `no-restricted-imports` 와 정적 스캔 테스트가 담당한다
 *    (아래 런타임 검증은 보조 수단일 뿐 우회 방지책이 아니다 — raw import 면 이 코드도 안 돈다).
 */
import { test as base, expect } from '@playwright/test'
import {
  BOT_TYPE_HEADER,
  BOT_TYPE_VALUE,
  buildFirstPartyOrigins,
  isFirstPartyUrl,
} from './first-party-origins'

export {
  BOT_TYPE_HEADER,
  BOT_TYPE_VALUE,
  DEFAULT_FIRST_PARTY_ORIGINS,
  FIRST_PARTY_ENV_KEYS,
  buildFirstPartyOrigins,
  isFirstPartyUrl,
  toOrigin,
} from './first-party-origins'

interface FirstPartyFixtures {
  /** auto fixture — 모든 테스트에 라우트 인터셉터를 설치한다 */
  firstPartyBotHeader: void
}

export const test = base.extend<FirstPartyFixtures>({
  firstPartyBotHeader: [
    async ({ context, baseURL }, use) => {
      const origins = buildFirstPartyOrigins(process.env, baseURL ?? undefined)
      let intercepted = false

      await context.route('**/*', (route) => {
        intercepted = true
        const request = route.request()
        if (!isFirstPartyUrl(request.url(), origins)) {
          // 서드파티 — 헤더를 붙이지 않고 그대로 통과시킨다
          return route.continue()
        }
        // first-party — 기존 헤더를 보존한 채 봇 표식만 추가한다
        return route.continue({
          headers: { ...request.headers(), [BOT_TYPE_HEADER]: BOT_TYPE_VALUE },
        })
      })

      await use()

      // 보조 검증: 페이지 요청이 있었는데 인터셉터를 한 번도 타지 않았다면 배선이 깨진 것이다.
      // (우회 방지책은 아니다 — raw import 한 spec 은 여기까지 오지도 않는다)
      if (!intercepted && context.pages().some((p) => p.url() !== 'about:blank')) {
        throw new Error(
          '[first-party-header] 라우트 인터셉터가 한 번도 실행되지 않았습니다. ' +
            'context.route 배선을 확인하세요.',
        )
      }
    },
    { auto: true },
  ],
})

export { expect }
export type { Page, TestInfo, CDPSession, Locator, BrowserContext, Browser } from '@playwright/test'
