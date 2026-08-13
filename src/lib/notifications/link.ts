/**
 * 알림 이동 URL 생성 (순수 — DB/서버 의존 없음, 테스트 대상).
 * my.ts에서 분리: 서버 import(prisma) 없이 단독 로드/테스트 가능하게.
 */

import { BOARD_URL_PREFIX as REGISTRY_BOARD_URL_PREFIX } from '@/lib/board-registry'

/** BoardType → 서비스 URL 접두사 (알림 링크 생성용 — SSoT: board-registry, 순수 모듈이라 안전) */
export const BOARD_URL_PREFIX: Record<string, string> = REGISTRY_BOARD_URL_PREFIX

/**
 * 글 상세 경로 1벌. slug가 있으면 canonical slug 사용(CUID→slug 301/308 왕복 제거),
 * 없으면 CUID fallback. 보드 매핑이 없으면 stories prefix로 안전 fallback.
 * buildNotificationLinkUrl·buildCommentAnchorUrl이 공유한다(경로 규칙 이원화 방지).
 */
function buildPostPath(boardType: string | null, slug: string | null, postId: string): string {
  const prefix = boardType ? BOARD_URL_PREFIX[boardType] : null
  const idPart = slug ?? postId
  return prefix ? `${prefix}/${idPart}` : `/community/stories/${idPart}`
}

/**
 * 우선순위: 저장 linkUrl(공지 등) → postId 기반 글 URL → 알림 목록 fallback.
 * postId 기반일 때 slug가 있으면 canonical slug 사용 → 상세페이지 CUID→slug 301/308 리다이렉트 왕복 제거(알림 클릭 P0).
 * slug 없으면 CUID fallback(기존 동작). 상세페이지 redirect 로직은 그대로 둔다.
 * (JOB은 slug가 없어 항상 CUID → /jobs/{id} 유지, jobs 라우트는 CUID 기반)
 */
export function buildNotificationLinkUrl(input: {
  linkUrl: string | null
  postId: string | null
  boardType: string | null
  slug: string | null
}): string {
  if (input.linkUrl) return input.linkUrl
  if (input.postId) return buildPostPath(input.boardType, input.slug, input.postId)
  return '/my/notifications'
}

/**
 * [C5] 댓글 앵커 URL — 알림 클릭 시 글 상단이 아니라 그 댓글 위치로 바로 이동시킨다.
 * 수신 측은 이미 준비돼 있다: CommentItem이 id="comment-{id}"를 렌더하고,
 * CommentSection이 hash를 보고 스크롤·강조한다(댓글은 클라이언트 로드라 재시도 포함).
 *
 * - 경로 규칙은 buildPostPath 공유 → 알림 목록(buildNotificationLinkUrl)과 항상 같은 글 URL.
 * - commentId·postId가 없으면 **null** 반환 → 호출부가 기존 글 URL fallback을 그대로 쓰게 한다.
 *   (앵커는 부가 기능 — 못 만들면 기존 동작으로 조용히 되돌아간다)
 * - agents의 buildAuthorReplyLinkUrl(봇 답글)과 동일 출력 규격.
 *   agents→src 런타임 import 금지 규칙 때문에 그쪽 복제본은 통합하지 않고 둔다.
 */
export function buildCommentAnchorUrl(input: {
  boardType: string | null
  slug: string | null
  postId: string | null
  commentId: string | null | undefined
}): string | null {
  if (!input.commentId || !input.postId) return null
  return `${buildPostPath(input.boardType, input.slug, input.postId)}#comment-${input.commentId}`
}
