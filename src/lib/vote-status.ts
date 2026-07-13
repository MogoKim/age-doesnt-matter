/**
 * 투표 자동 마감 규칙 (크론 없음 — 읽기 시점 계산으로만 닫는다)
 *
 * VoteEvent.date는 KST 그날 자정의 UTC 표현(@db.Date, getKstToday() 경유).
 * 당일 KST 20:00 이후 public 화면/API는 DB status와 무관하게 무조건 CLOSED로 동작한다.
 * 어드민 수동 CLOSED는 20:00 전에도 즉시 반영(OPEN 강제 조기 마감).
 * 어드민이 20:00 이후 OPEN으로 되돌려도 public에는 CLOSED — 정책 고정.
 */
export const VOTE_CLOSE_KST_HOUR = 20

/** date(KST 자정의 UTC 표현) 기준 그날 KST 20:00의 epoch ms — UTC로는 date + 11h */
export function voteCloseAtMs(date: Date): number {
  return date.getTime() + (VOTE_CLOSE_KST_HOUR - 9) * 60 * 60 * 1000
}

export function effectiveVoteStatus(
  status: 'OPEN' | 'CLOSED',
  date: Date,
  now: number = Date.now(),
): 'OPEN' | 'CLOSED' {
  if (status === 'CLOSED') return 'CLOSED'
  return now >= voteCloseAtMs(date) ? 'CLOSED' : 'OPEN'
}
