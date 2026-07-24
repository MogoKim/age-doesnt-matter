/**
 * 커뮤니티 상세 정본(canonical) URL 해석 (순수 — DB/서버 의존 없음, 테스트 대상. PR-M0)
 *
 * 배경: 상세 라우트가 URL의 boardSlug와 post.boardType 불일치를 검사하지 않아,
 * 글을 다른 보드로 이동하면(예: STORY→MENOPAUSE, 어드민 글이동 포함) 옛 URL과 새 URL이
 * 동시에 200으로 렌더되고 canonical이 갈라지는 중복 콘텐츠 문제가 있었다.
 *
 * 규칙(우선순위를 합쳐 항상 한 번의 308로 정본 도달):
 * 1) post.boardType이 활성 커뮤니티 보드(STORY/HUMOR/LIFE2/MENOPAUSE)면 그 보드 slug가 정본.
 *    WEEKLY(숨김·목록 라우트 없음)·JOB·MAGAZINE은 보드 교정 대상에서 제외 — 기존 동작 보존.
 * 2) post.slug가 있으면 slug가 정본 식별자(CUID 접근 → slug 교정, 기존 가드 승계).
 * 3) 둘 다 어긋나도 중간 URL 없이 최종 정본으로 1회 redirect.
 */
import { ACTIVE_COMMUNITY_BOARD_SLUG } from '@/lib/board-registry'

export function resolveCommunityCanonicalPath(input: {
  /** URL의 boardSlug 세그먼트 */
  boardSlug: string
  /** URL의 postId 세그먼트 (slug 또는 CUID, decode 완료본) */
  postId: string
  post: { boardType: string; slug: string | null }
}): string | null {
  const canonicalBoard =
    ACTIVE_COMMUNITY_BOARD_SLUG[input.post.boardType as keyof typeof ACTIVE_COMMUNITY_BOARD_SLUG]
    ?? input.boardSlug // 활성 커뮤니티 보드가 아니면(WEEKLY/JOB/MAGAZINE) URL 보드 유지
  const canonicalId = input.post.slug ?? input.postId

  if (canonicalBoard === input.boardSlug && canonicalId === input.postId) return null
  return `/community/${canonicalBoard}/${canonicalId}`
}
