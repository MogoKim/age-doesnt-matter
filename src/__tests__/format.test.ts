import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { formatRelativeTime, formatCount } from '@/lib/format'

describe('formatRelativeTime', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-03-20T12:00:00Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('30초 전 → "방금 전"', () => {
    expect(formatRelativeTime('2026-03-20T11:59:30Z')).toBe('방금 전')
  })

  it('5분 전 → "5분 전"', () => {
    expect(formatRelativeTime('2026-03-20T11:55:00Z')).toBe('5분 전')
  })

  it('3시간 전 → "3시간 전"', () => {
    expect(formatRelativeTime('2026-03-20T09:00:00Z')).toBe('3시간 전')
  })

  it('2일 전 → "2일 전"', () => {
    expect(formatRelativeTime('2026-03-18T12:00:00Z')).toBe('2일 전')
  })

  it('8일 전 → 날짜 형식 "YYYY.MM.DD"', () => {
    expect(formatRelativeTime('2026-03-12T12:00:00Z')).toBe('2026.03.12')
  })

  it('경계값: 정확히 60초 → "1분 전"', () => {
    expect(formatRelativeTime('2026-03-20T11:59:00Z')).toBe('1분 전')
  })

  it('경계값: 정확히 24시간 → "1일 전"', () => {
    expect(formatRelativeTime('2026-03-19T12:00:00Z')).toBe('1일 전')
  })

  it('경계값: 정확히 7일 → 날짜 형식', () => {
    expect(formatRelativeTime('2026-03-13T12:00:00Z')).toBe('2026.03.13')
  })
})

describe('formatCount', () => {
  it('1000 미만은 그대로 표시', () => {
    expect(formatCount(0)).toBe('0')
    expect(formatCount(1)).toBe('1')
    expect(formatCount(999)).toBe('999')
  })

  it('1000~9999는 k 단위', () => {
    expect(formatCount(1000)).toBe('1.0k')
    expect(formatCount(1200)).toBe('1.2k')
    expect(formatCount(9999)).toBe('10.0k')
  })

  it('10000 이상은 만 단위', () => {
    expect(formatCount(10000)).toBe('1.0만')
    expect(formatCount(55000)).toBe('5.5만')
    expect(formatCount(100000)).toBe('10.0만')
  })
})
