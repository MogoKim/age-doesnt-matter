/**
 * DB 연결 포화/단절 에러 감지 — Supabase Supavisor(6543) "max client connections 200" 등.
 *
 * .github/workflows/agents-cafe-wave.yml 의 grep 기준과 동일하게 유지:
 *   EMAXCONN | max client connections | Connection terminated due to connection timeout |
 *   Connection terminated unexpectedly
 *
 * 용도: 에이전트/스크립트가 연결 에러를 일반 에러와 구분해 가시화(BotLog/Slack)하기 위함.
 */
const CONNECTION_ERROR_PATTERN =
  /EMAXCONN|max client connections|Connection terminated due to connection timeout|Connection terminated unexpectedly|too many connections|Timed out fetching a new connection/i

export function isConnectionError(err: unknown): boolean {
  if (!err) return false
  const msg =
    err instanceof Error
      ? `${err.message} ${('code' in err ? String((err as { code?: unknown }).code) : '')}`
      : String(err)
  return CONNECTION_ERROR_PATTERN.test(msg)
}
