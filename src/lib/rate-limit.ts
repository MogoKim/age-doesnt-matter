/**
 * 간단한 인메모리 Rate Limiter (Edge Runtime 호환)
 * 프로덕션에서는 Redis 기반으로 교체 권장
 */

interface RateLimitEntry {
  count: number
  resetAt: number
}

const cache = new Map<string, RateLimitEntry>()

// 5분마다 만료된 항목 정리
setInterval(() => {
  const now = Date.now()
  for (const [key, entry] of cache) {
    if (entry.resetAt < now) cache.delete(key)
  }
}, 5 * 60 * 1000)

interface RateLimitOptions {
  /** 윈도우 시간 (ms) */
  windowMs?: number
  /** 윈도우 내 최대 요청 수 */
  max?: number
}

interface RateLimitResult {
  success: boolean
  remaining: number
  resetAt: number
}

export function rateLimit(
  key: string,
  options?: RateLimitOptions,
): RateLimitResult {
  const windowMs = options?.windowMs ?? 60_000 // 기본 1분
  const max = options?.max ?? 60 // 기본 60회/분

  const now = Date.now()
  const entry = cache.get(key)

  if (!entry || entry.resetAt < now) {
    const resetAt = now + windowMs
    cache.set(key, { count: 1, resetAt })
    return { success: true, remaining: max - 1, resetAt }
  }

  entry.count++

  if (entry.count > max) {
    return { success: false, remaining: 0, resetAt: entry.resetAt }
  }

  return { success: true, remaining: max - entry.count, resetAt: entry.resetAt }
}

/* ── checkRateLimit: 새로운 간결한 API ── */

export interface RateLimitConfig {
  /** 허용 횟수 */
  limit: number
  /** 시간 윈도우 (밀리초) */
  windowMs: number
}

export function checkRateLimit(key: string, config: RateLimitConfig): { allowed: boolean; remainingMs: number } {
  const now = Date.now()
  const entry = cache.get(key)

  if (!entry || entry.resetAt < now) {
    cache.set(key, { count: 1, resetAt: now + config.windowMs })
    return { allowed: true, remainingMs: 0 }
  }

  entry.count++
  if (entry.count > config.limit) {
    return { allowed: false, remainingMs: entry.resetAt - now }
  }

  return { allowed: true, remainingMs: 0 }
}
