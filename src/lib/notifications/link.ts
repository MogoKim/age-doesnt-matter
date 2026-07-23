/**
 * 알림 이동 URL 생성 (순수 — DB/서버 의존 없음, 테스트 대상).
 * my.ts에서 분리: 서버 import(prisma) 없이 단독 로드/테스트 가능하게.
 */

/** BoardType → 서비스 URL 접두사 (알림 링크 생성용) */
export const BOARD_URL_PREFIX: Record<string, string> = {
  STORY: '/community/stories',
  HUMOR: '/community/humor',
  LIFE2: '/community/life2',
  WEEKLY: '/community/weekly',
  MAGAZINE: '/magazine',
  JOB: '/jobs',
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
  if (input.postId) {
    const prefix = input.boardType ? BOARD_URL_PREFIX[input.boardType] : null
    const idPart = input.slug ?? input.postId
    return prefix ? `${prefix}/${idPart}` : `/community/stories/${idPart}`
  }
  return '/my/notifications'
}
