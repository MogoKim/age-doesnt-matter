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

/** `/dev` 를 열어도 되는 Vercel 환경 — **명시적 허용 목록**. */
const ALLOWED_VERCEL_ENV = new Set(['preview', 'development'])

/** `/dev` 를 열어도 되는 Node 환경 — `VERCEL_ENV` 를 못 읽을 때만 본다. */
const ALLOWED_NODE_ENV = new Set(['development'])

export interface DevRouteEnv {
  VERCEL_ENV?: string
  NODE_ENV?: string
}

/**
 * 이 환경에서 `/dev` 를 열어도 되는가.
 *
 * ── 환경 행렬 ───────────────────────────────────────────────
 *  | `VERCEL_ENV`        | `NODE_ENV`    | 결과 |
 *  |---------------------|---------------|------|
 *  | `production`        | (무관)        | 차단 |
 *  | `preview`           | (무관)        | 허용 |
 *  | `development`       | (무관)        | 허용 |
 *  | 없음 · 알 수 없는 값 | `development` | 허용 |
 *  | 없음 · 알 수 없는 값 | `production`  | 차단 |
 *  | 없음 · 알 수 없는 값 | 그 외 · 없음  | 차단 |
 *
 * 🔴 **fail-closed 다.** 허용은 **명시적으로 확인된 환경**에서만 한다.
 *    이전 구현은 `VERCEL_ENV !== 'production'` 하나로 판단하는 fail-open 이었다.
 *    그러면 `VERCEL_ENV` 를 못 읽는 production 런타임에서 그대로 열린다 —
 *    막으려던 상황에서 정확히 실패한다. 그래서 모르면 막는다.
 *
 * `VERCEL_ENV` 가 `production` 이면 `NODE_ENV` 를 보지 않는다. Vercel 환경이 곧 정답이고,
 * fallback 은 그 값을 **못 읽을 때**만 쓰는 차선책이다.
 */
export function isDevRouteAllowed(env: DevRouteEnv = process.env): boolean {
  const vercel = env.VERCEL_ENV
  if (vercel === 'production') return false
  if (vercel && ALLOWED_VERCEL_ENV.has(vercel)) return true

  // `VERCEL_ENV` 없음 또는 알 수 없는 값 → NODE_ENV fallback
  return ALLOWED_NODE_ENV.has(env.NODE_ENV ?? '')
}
