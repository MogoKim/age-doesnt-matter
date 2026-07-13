import { describe, expect, it } from 'vitest'
import { effectiveVoteStatus, voteCloseAtMs } from '../lib/vote-status'

/** getKstToday()와 동일 표현 — KST 그날 자정의 UTC Date */
function kstDate(y: number, m: number, d: number): Date {
  return new Date(Date.UTC(y, m - 1, d))
}

describe('투표 자동 마감 규칙 (KST 20:00, 크론 없음)', () => {
  const day = kstDate(2026, 7, 13)

  it('closeAt은 그날 KST 20:00 (= UTC 11:00)', () => {
    expect(voteCloseAtMs(day)).toBe(Date.UTC(2026, 6, 13, 11, 0, 0))
  })

  it('DB OPEN + 19:59:59 KST → OPEN', () => {
    expect(effectiveVoteStatus('OPEN', day, Date.UTC(2026, 6, 13, 10, 59, 59))).toBe('OPEN')
  })

  it('DB OPEN + 20:00:00 KST 정각 → CLOSED (경계 포함)', () => {
    expect(effectiveVoteStatus('OPEN', day, Date.UTC(2026, 6, 13, 11, 0, 0))).toBe('CLOSED')
  })

  it('DB OPEN + 20:00 이후 → CLOSED (어드민이 OPEN 유지해도 public은 CLOSED)', () => {
    expect(effectiveVoteStatus('OPEN', day, Date.UTC(2026, 6, 13, 14, 30, 0))).toBe('CLOSED')
  })

  it('DB OPEN + 어제 투표 → 항상 CLOSED', () => {
    expect(effectiveVoteStatus('OPEN', kstDate(2026, 7, 12), Date.UTC(2026, 6, 13, 1, 0, 0))).toBe('CLOSED')
  })

  it('DB CLOSED → 20:00 전에도 즉시 CLOSED (어드민 조기 마감)', () => {
    expect(effectiveVoteStatus('CLOSED', day, Date.UTC(2026, 6, 13, 2, 0, 0))).toBe('CLOSED')
  })

  it('DB OPEN + 오픈 시각(10:00 KST) → OPEN', () => {
    expect(effectiveVoteStatus('OPEN', day, Date.UTC(2026, 6, 13, 1, 0, 0))).toBe('OPEN')
  })
})
