import { describe, it, expect, beforeEach, vi } from 'vitest'
import { rateLimit } from '@/lib/rate-limit'

beforeEach(() => {
  // timer mock으로 캐시 정리 방지
  vi.useFakeTimers()
})

describe('rateLimit', () => {
  it('첫 번째 요청은 항상 성공', () => {
    const result = rateLimit('test-first', { max: 5, windowMs: 60000 })
    expect(result.success).toBe(true)
    expect(result.remaining).toBe(4)
  })

  it('max 초과 시 실패', () => {
    const key = 'test-exceed'
    const options = { max: 3, windowMs: 60000 }

    rateLimit(key, options) // 1
    rateLimit(key, options) // 2
    rateLimit(key, options) // 3
    const result = rateLimit(key, options) // 4 — 초과
    expect(result.success).toBe(false)
    expect(result.remaining).toBe(0)
  })

  it('윈도우 시간 경과 후 리셋', () => {
    const key = 'test-reset'
    const options = { max: 2, windowMs: 1000 }

    rateLimit(key, options) // 1
    rateLimit(key, options) // 2
    const blocked = rateLimit(key, options) // 3 — 초과
    expect(blocked.success).toBe(false)

    // 윈도우 시간 경과
    vi.advanceTimersByTime(1001)

    const after = rateLimit(key, options)
    expect(after.success).toBe(true)
    expect(after.remaining).toBe(1)
  })

  it('다른 키는 독립적으로 카운트', () => {
    const options = { max: 1, windowMs: 60000 }

    rateLimit('key-a', options) // key-a: 1
    const a = rateLimit('key-a', options) // key-a: 2 — 초과
    const b = rateLimit('key-b', options) // key-b: 1 — 정상

    expect(a.success).toBe(false)
    expect(b.success).toBe(true)
  })

  it('기본값: 60회/분', () => {
    const result = rateLimit('test-default')
    expect(result.remaining).toBe(59) // 60 - 1
  })
})
