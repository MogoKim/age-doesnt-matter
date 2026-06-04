// HTTP read-only probe — 공개 URL의 캐시/상태/응답시간만 측정 (인증·쓰기 없음)
import type { ProbeResult } from './probe.types.js'
import { nowIso } from './probe.types.js'

const TIMEOUT_MS = 5000

/**
 * 공개 페이지 상태/캐시 측정.
 * - 2xx 응답: ok=true (signal: status-200 / cache 상태)
 * - 4xx/5xx: ok=false
 * - 네트워크 실패/타임아웃: ok=null (판정불가)
 *
 * url은 공개 도메인이므로 detail에 그대로 담아도 안전(민감정보 아님).
 */
export async function httpStatus(url: string): Promise<ProbeResult> {
  const start = Date.now()
  try {
    const res = await fetch(url, {
      method: 'GET',
      redirect: 'manual',
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { 'x-bot-type': 'ops-board' }, // GA4/EventLog 오염 방지(자사 사이트 요청 프로토콜)
    })
    const cache = res.headers.get('x-vercel-cache')
    const ms = Date.now() - start
    const ok = res.status >= 200 && res.status < 400
    return {
      kind: 'http',
      ok,
      signal: `status-${res.status}${cache ? `/${cache}` : ''}`,
      detail: { url, status: res.status, cache: cache ?? null, ms },
      checkedAt: nowIso(),
      durationMs: ms,
    }
  } catch (err) {
    const e = err as Error
    const timedOut = e.name === 'TimeoutError' || e.name === 'AbortError'
    return {
      kind: 'http',
      ok: null,
      signal: timedOut ? 'timeout' : 'fetch-error',
      detail: { url },
      checkedAt: nowIso(),
      durationMs: Date.now() - start,
      error: timedOut ? 'http timeout' : 'fetch failed',
    }
  }
}
