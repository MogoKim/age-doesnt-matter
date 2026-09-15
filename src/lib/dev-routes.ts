/**
 * `/dev/*` 노출 통제 — **내부 미리보기 화면은 production 에 존재하지 않아야 한다.**
 *
 * ── 🔴 왜 만들었나 ──────────────────────────────────────────
 *  2026-09-15 실측: `/dev/components` · `/dev/qa-report` · `/dev/event-preview` 가
 *  production 에서 **200** 이었다. 디자인 쇼케이스와 QA 리포트가 외부에 그대로 열려 있었다.
 *
 *  이 페이지들에는 `noindex, nofollow` 가 붙어 있었다. 그래서 검색 노출은 막혔지만
 *  **접근은 전혀 막히지 않았다.** `noindex` 는 검색엔진에 대한 요청이지 접근 통제가 아니다.
 *  `robots.txt` 도 같다(애초에 `/dev/` Disallow 도 없었다). 막아야 하는 것은 **서버 응답**이다.
 *
 * ── 어디서 막나 ─────────────────────────────────────────────
 *  `src/middleware.ts` **한 곳**에서 막는다. 페이지마다 가드를 두면 새 `/dev` 라우트가
 *  생길 때마다 새어 나간다. middleware 는 렌더링·데이터 접근 **이전에** 끊는다.
 */

/** `/dev` 하위 전체가 대상이다. */
export const DEV_ROUTE_PREFIX = '/dev'

/**
 * 이 경로가 `/dev` 하위인가.
 *
 * 🔴 `startsWith('/dev')` 로만 보면 `/development` 같은 멀쩡한 경로까지 404 가 된다.
 *    정확히 `/dev` 이거나 `/dev/` 로 시작할 때만 참이다.
 */
export function isDevRoute(pathname: string): boolean {
  return pathname === DEV_ROUTE_PREFIX || pathname.startsWith(`${DEV_ROUTE_PREFIX}/`)
}

/**
 * 이 환경에서 `/dev` 를 열어도 되는가.
 *
 * · Vercel **production** → 차단
 * · Vercel **preview** → 허용 (Preview E2E 가 `/dev/event-preview` 를 쓴다)
 * · **로컬**(`VERCEL_ENV` 없음) → 허용
 *
 * 🔴 **fail-open 이 의도다.** 값을 못 읽거나 모르는 값이면 허용한다.
 *    fail-closed 로 만들면 `VERCEL_ENV` 가 비는 순간 로컬 개발이 통째로 막힌다.
 *    차단해야 하는 대상은 "production 이라고 확인된 경우" 하나뿐이다.
 */
export function isDevRouteAllowed(
  vercelEnv: string | undefined = process.env.VERCEL_ENV,
): boolean {
  return vercelEnv !== 'production'
}
