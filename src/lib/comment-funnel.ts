/**
 * 댓글 작성 퍼널 계측 (PR-C3)
 *
 * 왜 필요한가: 지금 댓글 관련 이벤트는 성공 시점의 `comment_create` 하나뿐이라
 * "왜 댓글을 안 쓰는가"를 데이터로 답할 수 없다. 진입·포커스·입력시작·신원단계·제출시도·실패가
 * 전부 미계측이라 하단 고정 입력창(PR-C1) 같은 화면 개편의 효과도 판정할 수 없다.
 * 이 파일은 **성공 이전 단계의 공백만** 메운다.
 *
 * 성공 이벤트는 새로 만들지 않는다:
 *   기존 `comment_create`가 이미 성공 시점에서만 발화하고, 30일 실측에서 DB 사람 댓글 건수와
 *   정확히 일치했다(112 = 112). 여기에 `comment_submit_succeeded`를 더하면 성공 정의가 둘이 되어
 *   집계가 갈린다. 퍼널 조인은 `post_id` + `comment_target` + `anon_cid`(중앙 부착)로 가능하다.
 *
 * 기준 산출물: scratchpad/comment-ux-benchmark-tobe-2026-08-11/pr-plan.md (PR-C3)
 */

/** 이벤트 이름 단일 출처. rate limit 면제 목록(api/events/route.ts)과 반드시 같이 움직인다. */
export const COMMENT_FUNNEL_EVENTS = {
  inputView: 'comment_input_view',
  inputFocus: 'comment_input_focus',
  textStarted: 'comment_text_started',
  identityStarted: 'comment_identity_started',
  submitAttempted: 'comment_submit_attempted',
  submitFailed: 'comment_submit_failed',
  signupPromptShown: 'comment_signup_prompt_shown',
  signupPromptClicked: 'comment_signup_prompt_clicked',
} as const

export type CommentFunnelEvent =
  (typeof COMMENT_FUNNEL_EVENTS)[keyof typeof COMMENT_FUNNEL_EVENTS]

/**
 * 실패 사유. **원문 에러 메시지를 넣지 않는다** — 서버 문구가 바뀌면 집계가 깨지고,
 * 사용자 입력이 섞여 들어올 위험도 있다. 고정 코드로만 남긴다.
 */
export type CommentSubmitErrorCode =
  /** Turnstile 토큰을 제한 시간 안에 받지 못함 (비회원 전용) */
  | 'turnstile_unavailable'
  /** 서버 액션이 error를 반환 (금칙어·권한·검증 실패 등) */
  | 'server_rejected'
  /** 예외 발생 (네트워크·런타임) */
  | 'unexpected'

/** 계측 표면. C1에서 하단 고정 입력이 생기면 'bottom_bar'가 추가된다. */
export type CommentInputMode = 'inline'

export interface CommentFunnelContext {
  postId: string
  /** 있으면 답글, 없으면 최상위 댓글 */
  parentId?: string
  userState: 'guest' | 'member'
}

/**
 * 이벤트에 덧붙일 수 있는 값의 **닫힌 집합**.
 * 타입을 좁혀 둔 이유: 호출부가 실수로 댓글 내용·닉네임·비밀번호·토큰을 넘기지 못하게 하기 위해서다.
 * 새 필드가 필요하면 여기 추가하면서 민감정보인지 한 번 더 검토하게 된다.
 */
export interface CommentFunnelExtra {
  errorCode?: CommentSubmitErrorCode
}

/**
 * `/community/{boardSlug}/{postId}` 에서 boardSlug만 뽑는다.
 * prop drilling 없이 계측 차원을 얻기 위한 것 — 컴포넌트 시그니처를 건드리지 않는다.
 * 형태가 다르면 null (이벤트는 그대로 보내고 차원만 비운다).
 */
export function boardSlugFromPath(pathname: string | null | undefined): string | null {
  if (!pathname) return null
  const segments = pathname.split('/').filter(Boolean)
  if (segments[0] !== 'community' || segments.length < 2) return null
  const slug = segments[1]
  return /^[a-z0-9-]{1,40}$/.test(slug) ? slug : null
}

/**
 * 모든 댓글 퍼널 이벤트가 공유하는 properties.
 *
 * 여기에 없는 것들:
 * - `anon_cid` / `path` / `referrer` — `trackEvent`가 중앙에서 붙인다(F19). 중복 금지.
 * - device/browser — 서버가 User-Agent를 EventLog에 저장한다. 중복 금지.
 * - 댓글 내용·닉네임·비밀번호·Turnstile 토큰 — **절대 넣지 않는다.**
 */
export function commentFunnelProperties(
  ctx: CommentFunnelContext,
  extra?: CommentFunnelExtra
): Record<string, unknown> {
  const properties: Record<string, unknown> = {
    surface: 'post_detail_comment',
    input_mode: 'inline' satisfies CommentInputMode,
    post_id: ctx.postId,
    board_slug: boardSlugFromPath(
      typeof window === 'undefined' ? null : window.location.pathname
    ),
    user_state: ctx.userState,
    comment_target: ctx.parentId ? 'reply' : 'root',
  }
  // 최상위 댓글에는 키 자체를 넣지 않는다 — null과 "부모 없음"을 구분할 필요가 없다.
  if (ctx.parentId) properties.parent_comment_id = ctx.parentId
  if (extra?.errorCode) properties.error_code = extra.errorCode
  return properties
}
