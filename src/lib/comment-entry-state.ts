/**
 * "지금 사용자가 댓글 입력 앞에 있다"를 한 곳에서 알린다 (PR-C1).
 *
 * 왜 필요한가:
 *   가입 배너는 정독 85%에 뜨는데, 그 지점이 정확히 사용자가 댓글 입력 영역에 닿는 순간이다.
 *   배너는 `fixed inset-0` dim을 함께 깔기 때문에 **댓글 입력이 물리적으로 막힌다.**
 *   글 상세에서는 댓글 입력이 배너보다 우선이므로(창업자 결정), 댓글 입력이 화면에 있는 동안에는
 *   배너 자동 노출을 **미룬다**.
 *
 * 무엇을 바꾸지 않는가:
 *   배너의 문구·CTA·타깃·실험 정의·노출 횟수 정책은 그대로다. **시점만 양보한다.**
 *   이미 떠 있는 배너를 거두지도 않는다 — shown→dismissed 퍼널을 깨지 않기 위해서다.
 *
 * 구현이 전역 모듈인 이유:
 *   댓글 섹션과 배너는 React 트리에서 형제도 부모자식도 아니다(배너는 MainLayout, 댓글은 페이지 안).
 *   Context를 새로 끼우면 레이아웃을 건드려야 해서, 값 하나짜리 구독 모듈로 최소화했다.
 */

let active = false
const listeners = new Set<(value: boolean) => void>()

/** 댓글 입력 영역이 화면에 들어왔는지 여부를 갱신한다. 값이 바뀔 때만 알린다. */
export function setCommentEntryActive(value: boolean): void {
  if (active === value) return
  active = value
  for (const fn of listeners) fn(value)
}

export function isCommentEntryActive(): boolean {
  return active
}

/** 값 변화를 구독한다. 반환값을 호출하면 해제된다. */
export function subscribeCommentEntryActive(fn: (value: boolean) => void): () => void {
  listeners.add(fn)
  return () => { listeners.delete(fn) }
}

/**
 * 페이지 이동·언마운트 시 반드시 호출한다.
 * 안 하면 댓글 있는 글을 보고 나간 뒤 다른 글에서 배너가 영영 안 뜬다.
 */
export function resetCommentEntryActive(): void {
  setCommentEntryActive(false)
}
