/**
 * 웹(런타임) DB 연결오류 재시도 유틸 — EMAXCONN(Supavisor lobby 200 순간 포화) 방어.
 *
 * 배경: wave 봇들이 5분마다 우르르 돌며 6543 풀러 client lobby(200)를 순간 점유 →
 * 그 찰나에 카카오 로그인/온보딩이 부딪히면 "max client connections" 즉시 거절(jwt_exception) →
 * 신규 가입자가 user_숫자 상태로 잔존. wave는 0초 작업이라 1~2초면 슬롯이 비므로 짧은 재시도로 구제 가능.
 *
 * 패턴은 agents/core/connection-error.ts와 동일하게 유지(에이전트→src import 금지 규칙 때문에 복제).
 * 연결오류가 '아닌' 에러는 재시도 없이 즉시 throw → 기존 인증 동작 불변(회귀 표면 최소화).
 */

// agents/core/connection-error.ts:10 의 CONNECTION_ERROR_PATTERN과 동일하게 유지할 것.
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

interface RetryOptions {
  /** 추가 재시도 횟수(최초 시도 제외). 기본 2 → 최대 3회 시도. */
  retries?: number
  /** 백오프 기준(ms). 기본 200 → 200, 400 + jitter. */
  baseDelayMs?: number
}

/**
 * 연결오류일 때만 jitter 지수 백오프로 재시도. 그 외 에러는 즉시 throw.
 * EMAXCONN은 즉시거절형(hang 없음)이라 각 시도가 빠르게 끝나 serverless 타임아웃 위험이 낮다.
 * jitter로 동시 재시도(retry storm) 동기화를 방지한다.
 */
export async function retryOnConnError<T>(fn: () => Promise<T>, opts: RetryOptions = {}): Promise<T> {
  const retries = opts.retries ?? 2
  const baseDelayMs = opts.baseDelayMs ?? 200
  let lastErr: unknown
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn()
    } catch (err) {
      lastErr = err
      if (!isConnectionError(err) || attempt === retries) throw err
      const delay = baseDelayMs * 2 ** attempt + Math.random() * baseDelayMs
      await new Promise((resolve) => setTimeout(resolve, delay))
    }
  }
  throw lastErr
}
