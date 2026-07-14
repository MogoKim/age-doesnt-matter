/**
 * 투표 오픈/마감 규칙 (크론 없음 — 읽기 시점 계산으로만 열고 닫는다)
 *
 * VoteEvent.date는 KST 그날 자정의 UTC 표현(@db.Date, getKstToday() 경유).
 * 기본 오픈 09:00 KST / 마감 20:00 KST.
 *  · 09:00 전: public 화면/API에 노출 안 함(HIDDEN) — 예약 투표가 새벽에 뜨지 않게.
 *  · 09:00~20:00: OPEN
 *  · 20:00 이후: CLOSED (어드민 수동 CLOSED는 20:00 전에도 즉시 반영, 되돌려도 public CLOSED 고정)
 */
export const VOTE_OPEN_KST_HOUR = 9
export const VOTE_CLOSE_KST_HOUR = 20

/** date(KST 자정의 UTC 표현) 기준 그날 KST 09:00의 epoch ms — UTC로는 date + 0h(= date 자체) */
export function voteOpenAtMs(date: Date): number {
  return date.getTime() + (VOTE_OPEN_KST_HOUR - 9) * 60 * 60 * 1000
}

/** date(KST 자정의 UTC 표현) 기준 그날 KST 20:00의 epoch ms — UTC로는 date + 11h */
export function voteCloseAtMs(date: Date): number {
  return date.getTime() + (VOTE_CLOSE_KST_HOUR - 9) * 60 * 60 * 1000
}

/**
 * public 노출/마감 3-state. 09:00 전=HIDDEN(노출 금지), 09:00~20:00=OPEN, 20:00+/수동=CLOSED.
 * public API는 HIDDEN을 vote:null로 감춘다(클라 타입엔 OPEN/CLOSED만 흘림). castVote는 OPEN에서만 허용.
 */
export function voteVisibleStatus(
  status: 'OPEN' | 'CLOSED',
  date: Date,
  now: number = Date.now(),
): 'HIDDEN' | 'OPEN' | 'CLOSED' {
  if (now < voteOpenAtMs(date)) return 'HIDDEN'
  if (status === 'CLOSED' || now >= voteCloseAtMs(date)) return 'CLOSED'
  return 'OPEN'
}

/** 20:00 마감 2-state (하위호환 — payload status용, 09:00 판정은 voteVisibleStatus) */
export function effectiveVoteStatus(
  status: 'OPEN' | 'CLOSED',
  date: Date,
  now: number = Date.now(),
): 'OPEN' | 'CLOSED' {
  if (status === 'CLOSED') return 'CLOSED'
  return now >= voteCloseAtMs(date) ? 'CLOSED' : 'OPEN'
}
