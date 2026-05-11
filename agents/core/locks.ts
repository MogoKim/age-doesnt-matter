import { Redis } from '@upstash/redis'

// Redis 미설정 시 graceful degradation — 락 없이 실행 (설정 후 자동 활성화)
let redis: Redis | null = null
if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
  redis = new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL,
    token: process.env.UPSTASH_REDIS_REST_TOKEN,
  })
} else {
  console.warn('[LOCK] UPSTASH_REDIS 환경변수 미설정 — 분산 락 비활성화 (F-1 Race Condition 방지 불가)')
}

/**
 * 분산 락 — 동일 에이전트 중복 실행 방지 (F-1, F-5 Race Condition 해결)
 *
 * 사용법:
 *   const result = await withLock('coo:comment-activator', 600, async () => {
 *     // 실제 작업
 *   })
 *   if (result === null) console.log('이미 실행 중 — skip')
 *
 * @param key     락 식별자 (예: 'coo:comment-activator')
 * @param ttlSec  최대 락 유지 시간(초) — 작업 예상 시간 × 1.5 권장
 * @param fn      락 획득 후 실행할 함수
 * @returns       fn의 반환값, 또는 null (이미 다른 인스턴스 실행 중)
 */
export async function withLock<T>(
  key: string,
  ttlSec: number,
  fn: () => Promise<T>,
): Promise<T | null> {
  if (!redis) {
    // Redis 미설정 시 락 없이 실행 (graceful degradation)
    return fn()
  }

  const lockKey = `agent-lock:${key}`
  const acquired = await redis.set(lockKey, '1', { nx: true, ex: ttlSec })

  if (!acquired) {
    console.log(`[LOCK] Skip — ${key} 이미 실행 중 (TTL: ${ttlSec}s)`)
    return null
  }

  try {
    return await fn()
  } finally {
    await redis.del(lockKey)
  }
}

/**
 * 락 강제 해제 — 에이전트 비정상 종료 후 수동 복구용
 */
export async function releaseLock(key: string): Promise<void> {
  if (!redis) return
  await redis.del(`agent-lock:${key}`)
  console.log(`[LOCK] 강제 해제: ${key}`)
}
