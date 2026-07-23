/**
 * 커뮤니티 상세글 DiscussionForumPosting JSON-LD 빌더 (순수 — DB/SDK 의존 없음, 테스트 대상)
 *
 * 배경: GSC "토론 포럼 구조화 데이터 누락" 권장. 커뮤니티 글은 기사(Article)보다 포럼/토론에 가까워
 *       Article → DiscussionForumPosting 교체(병행 아님). Breadcrumb은 page에서 별도 유지.
 * 필수(Google): author.name / datePublished / text(또는 image). 나머지는 권장.
 */

export interface DfpComment {
  /** 화면 노출 닉네임 (회원 nickname 또는 게스트 guestNickname) */
  authorName: string
  text: string
  /** ISO 문자열 */
  datePublished: string
}

export interface DiscussionForumInput {
  title: string
  /** 본문 HTML 제거한 평문 */
  text: string
  authorName: string
  /** ISO 문자열 */
  datePublished: string
  /** ISO 문자열 */
  dateModified: string
  url: string
  image?: string | null
  likeCount: number
  viewCount: number
  commentCount: number
  publisherName: string
  publisherUrl: string
  /** ACTIVE 최상위 댓글(호출부에서 이미 ACTIVE 필터 + 매핑). 빌더에서 상한 적용 */
  comments: DfpComment[]
}

/** JSON-LD comment[]에 넣을 최대 댓글 수 (HTML 비대 방지) */
export const DFP_COMMENT_LIMIT = 10

interface InteractionCounter {
  '@type': 'InteractionCounter'
  interactionType: string
  userInteractionCount: number
}

export function buildDiscussionForumJsonLd(i: DiscussionForumInput): Record<string, unknown> {
  const interactionStatistic: InteractionCounter[] = [
    { '@type': 'InteractionCounter', interactionType: 'https://schema.org/LikeAction', userInteractionCount: Math.max(0, i.likeCount ?? 0) },
    { '@type': 'InteractionCounter', interactionType: 'https://schema.org/ViewAction', userInteractionCount: Math.max(0, i.viewCount ?? 0) },
    { '@type': 'InteractionCounter', interactionType: 'https://schema.org/CommentAction', userInteractionCount: Math.max(0, i.commentCount ?? 0) },
  ]

  // 이름·본문이 있는 ACTIVE 댓글만, 상한 적용
  const comments = (i.comments ?? [])
    .filter((c) => c.authorName?.trim() && c.text?.trim())
    .slice(0, DFP_COMMENT_LIMIT)
    .map((c) => ({
      '@type': 'Comment',
      author: { '@type': 'Person', name: c.authorName },
      text: c.text,
      datePublished: c.datePublished,
    }))

  return {
    '@context': 'https://schema.org',
    '@type': 'DiscussionForumPosting',
    headline: i.title,
    text: i.text,
    url: i.url,
    datePublished: i.datePublished,
    dateModified: i.dateModified,
    author: { '@type': 'Person', name: i.authorName },
    ...(i.image ? { image: i.image } : {}),
    publisher: { '@type': 'Organization', name: i.publisherName, url: i.publisherUrl },
    interactionStatistic,
    // 댓글 없는 글은 comment 필드 생략
    ...(comments.length ? { comment: comments } : {}),
  }
}
