/**
 * 이번 세션에서 본 글 ID 관리 (sessionStorage) — 관련글 추천에서 "방금/이미 본 글" 제외용.
 *
 * 클라이언트 전용. 서버는 사용자 세션 히스토리를 모르므로(SSR·캐시 오염 방지) 클라에서 관리한다.
 * storage 불가(사파리 프라이빗·차단) 시 전부 no-op + 빈 배열 fallback → 추천은 현행대로 동작(안전).
 */
const KEY = 'unao_viewed_posts'
const MAX = 50

/** 이번 세션에서 본 postId 목록(최신순 아님, 존재 여부만 사용). 실패 시 [] */
export function getViewedIds(): string[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.sessionStorage.getItem(KEY)
    if (!raw) return []
    const arr = JSON.parse(raw)
    return Array.isArray(arr) ? arr.filter((x): x is string => typeof x === 'string') : []
  } catch {
    return []
  }
}

/** 현재 글을 본 목록에 추가(FIFO, 최대 MAX). 중복은 뒤로 갱신. 실패 시 no-op */
export function pushViewed(postId: string): void {
  if (typeof window === 'undefined' || !postId) return
  try {
    const cur = getViewedIds().filter((id) => id !== postId)
    cur.push(postId)
    const trimmed = cur.length > MAX ? cur.slice(cur.length - MAX) : cur
    window.sessionStorage.setItem(KEY, JSON.stringify(trimmed))
  } catch {
    // storage 불가 — 무시(추천은 빈 viewed 로 현행 동작)
  }
}
