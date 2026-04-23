/**
 * Rate Limiter — 인메모리 (개발/폴백) + Upstash Redis (프로덕션 분산)
 *
 * UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN 환경변수가 설정된 경우
 * Upstash 슬라이딩 윈도우 알고리즘을 사용. 미설정 시 in-memory 폴백.
 *
 * @upstash 패키지는 dynamic import로만 로드 (테스트/미설정 환경에서 로드 안 함)
 */

// 타입 전용 import — 런타임에 erasure, 모듈 로드 없음
import type { Ratelimit } from '@upstash/ratelimit'

// ── 인메모리 구현 (기존 — 폴백 및 직접 rateLimit() 호출용) ──────────────

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

// ── Upstash 분산 Rate Limiter ────────────────────────────────────────────

const isUpstashConfigured = !!(
  process.env.UPSTASH_REDIS_REST_URL &&
  process.env.UPSTASH_REDIS_REST_TOKEN
)

// limit:windowMs 조합별 Ratelimit 인스턴스 캐싱
const upstashInstances = new Map<string, Ratelimit>()

// dynamic import — 환경변수가 설정된 경우에만 실제 패키지 로드
async function getUpstashInstance(max: number, windowMs: number): Promise<Ratelimit | null> {
  if (!isUpstashConfigured) return null
  const cacheKey = `${max}:${windowMs}`
  if (!upstashInstances.has(cacheKey)) {
    const [{ Ratelimit: RatelimitClass }, { Redis }] = await Promise.all([
      import('@upstash/ratelimit'),
      import('@upstash/redis'),
    ])
    const windowSec = Math.floor(windowMs / 1000)
    upstashInstances.set(
      cacheKey,
      new RatelimitClass({
        redis: Redis.fromEnv(),
        limiter: RatelimitClass.slidingWindow(max, `${windowSec}s`),
        prefix: 'unao:rl',
        analytics: false, // Free 플랜 스토리지 소모 방지
      }),
    )
  }
  return upstashInstances.get(cacheKey)!
}

/**
 * 분산 Rate Limit 체크 (Upstash Redis 우선, 장애 시 in-memory 폴백)
 * checkApiRateLimit() 내부에서만 사용.
 */
export async function rateLimitDistributed(
  key: string,
  options?: RateLimitOptions,
): Promise<RateLimitResult> {
  const max = options?.max ?? 60
  const windowMs = options?.windowMs ?? 60_000

  const instance = await getUpstashInstance(max, windowMs)
  if (instance) {
    try {
      // 300ms timeout: 지연 시 in-memory 폴백 (에러 + 타임아웃 모두 대응)
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('upstash-timeout')), 300),
      )
      const { success, remaining, reset } = await Promise.race([
        instance.limit(key),
        timeoutPromise,
      ])
      // Upstash reset은 Unix 초 단위 → ms 변환
      return { success, remaining, resetAt: reset * 1000 }
    } catch {
      // Upstash 장애/지연 시 in-memory 폴백 (서비스 중단 방지)
      return rateLimit(key, options)
    }
  }

  // Upstash 미설정 → in-memory 폴백
  return rateLimit(key, options)
}
