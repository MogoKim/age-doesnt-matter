/**
 * 작성 중인 글의 로컬 임시저장 — 저장·복원·삭제를 여기 한 곳에서만 한다.
 *
 * 비회원이 글을 먼저 쓰고 등록 시점에 가입하는 흐름이 생기면서, 이 값은
 * "자동 임시저장" 이상의 역할을 한다. 로그인하러 나갔다 돌아오는 사이 글이 살아 있어야 한다.
 *
 * 키는 게시판별로 나눈다(예전부터 쓰던 형식 그대로 — 기존 임시저장이 사라지면 안 된다).
 * 게시판이 다르면 별개의 글이라 서로 덮어쓰면 안 되기 때문이다.
 */

export interface WriteDraft {
  board: string
  category: string
  title: string
  content: string
  /** 저장 시각(ms). 여러 게시판에 임시저장이 있을 때 최근 것을 고르는 데 쓴다.
   *  이 필드가 생기기 전에 저장된 글에는 없다 — 그때는 가장 오래된 것으로 본다. */
  savedAt?: number
}

/** 예전부터 쓰던 키 형식 — 바꾸면 기존 임시저장이 통째로 사라진다 */
export function draftKey(boardSlug: string): string {
  return `unae_post_draft_${boardSlug}`
}

/** 내용이 있는 임시저장인지 — 빈 껍데기는 없는 것으로 취급한다 */
function hasBody(d: WriteDraft | null): d is WriteDraft {
  return !!d && !!(d.title || d.content)
}

export function readDraft(boardSlug: string): WriteDraft | null {
  if (!boardSlug) return null
  try {
    const raw = localStorage.getItem(draftKey(boardSlug))
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<WriteDraft>
    const draft: WriteDraft = {
      board: parsed.board || boardSlug,
      category: parsed.category || '',
      title: parsed.title || '',
      content: parsed.content || '',
      savedAt: typeof parsed.savedAt === 'number' ? parsed.savedAt : undefined,
    }
    return hasBody(draft) ? draft : null
  } catch {
    // JSON 깨짐·localStorage 차단(사파리 시크릿) — 임시저장이 없는 것으로 본다
    return null
  }
}

/** 저장 성공 여부를 돌려준다 — 실패를 호출부가 알아야 사용자에게 알릴 수 있다 */
export function saveDraft(draft: WriteDraft, now: number): boolean {
  if (!draft.board) return false
  if (!draft.title && !draft.content) return false
  try {
    localStorage.setItem(draftKey(draft.board), JSON.stringify({ ...draft, savedAt: now }))
    return true
  } catch {
    // 저장공간 초과(QuotaExceededError) 등
    return false
  }
}

export function removeDraft(boardSlug: string): void {
  try {
    localStorage.removeItem(draftKey(boardSlug))
  } catch {
    /* 지우지 못해도 화면 흐름을 막지 않는다 */
  }
}

/**
 * 여러 게시판 중 가장 최근 임시저장을 찾는다.
 *
 * 필요한 이유: 로그인 왕복에서 URL의 ?board=…가 떨어져 나가면 폼이 다른 게시판으로 열린다.
 * 그때 "그 게시판의 임시저장"만 보면 방금 쓴 글을 못 찾아 빈 화면이 된다.
 * 사용자에게 "작성하던 글이 있다"고 알려주기 위한 마지막 안전망이다.
 *
 * 찾기만 하고 적용하지는 않는다 — 게시판을 말없이 바꾸면 엉뚱한 곳에 글이 올라간다.
 */
export function findLatestDraft(boardSlugs: readonly string[]): WriteDraft | null {
  let latest: WriteDraft | null = null
  for (const slug of boardSlugs) {
    const d = readDraft(slug)
    if (!d) continue
    if (!latest || (d.savedAt ?? 0) > (latest.savedAt ?? 0)) latest = d
  }
  return latest
}
