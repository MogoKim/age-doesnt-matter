import { describe, it, expect } from 'vitest'
import { buildCommentAnchorUrl, buildNotificationLinkUrl } from '@/lib/notifications/link'

/**
 * [C5] 댓글 앵커 URL — 알림 클릭 시 글 상단이 아니라 그 댓글 위치로 이동.
 * 수신 측(CommentItem id="comment-{id}" + CommentSection hash 스크롤)은 이미 구현돼 있고,
 * 여기서는 "보내는 쪽 URL"이 그 규격과 맞는지를 잠근다.
 */
describe('buildCommentAnchorUrl — 댓글 앵커 URL 생성', () => {
  it('slug 있음 → /community/stories/{slug}#comment-{id} (canonical slug 우선)', () => {
    expect(
      buildCommentAnchorUrl({ boardType: 'STORY', slug: '실버-사업-한다면', postId: 'cmPOST', commentId: 'cmC1' }),
    ).toBe('/community/stories/실버-사업-한다면#comment-cmC1')
  })

  it('slug 없음(null) → /community/stories/{postId}#comment-{id} CUID fallback', () => {
    expect(
      buildCommentAnchorUrl({ boardType: 'STORY', slug: null, postId: 'cmPOST', commentId: 'cmC1' }),
    ).toBe('/community/stories/cmPOST#comment-cmC1')
  })

  it('board prefix가 board-registry 기준과 일치 (HUMOR/LIFE2/MENOPAUSE)', () => {
    expect(buildCommentAnchorUrl({ boardType: 'HUMOR', slug: 's1', postId: 'p', commentId: 'c' })).toBe(
      '/community/humor/s1#comment-c',
    )
    expect(buildCommentAnchorUrl({ boardType: 'LIFE2', slug: 's2', postId: 'p', commentId: 'c' })).toBe(
      '/community/life2/s2#comment-c',
    )
    expect(buildCommentAnchorUrl({ boardType: 'MENOPAUSE', slug: '갱년기-불면-경험', postId: 'p', commentId: 'c' })).toBe(
      '/community/menopause/갱년기-불면-경험#comment-c',
    )
  })

  it('JOB(항상 slug null) → /jobs/{CUID}#comment-{id}', () => {
    expect(
      buildCommentAnchorUrl({ boardType: 'JOB', slug: null, postId: 'jobcuid', commentId: 'c' }),
    ).toBe('/jobs/jobcuid#comment-c')
  })

  it('boardType 미상/null → stories fallback prefix로 안전 처리', () => {
    expect(buildCommentAnchorUrl({ boardType: null, slug: 'sx', postId: 'p', commentId: 'c' })).toBe(
      '/community/stories/sx#comment-c',
    )
    expect(buildCommentAnchorUrl({ boardType: 'NOT_A_BOARD', slug: 'sx', postId: 'p', commentId: 'c' })).toBe(
      '/community/stories/sx#comment-c',
    )
  })

  it('commentId 없음(null/undefined/빈 문자열) → null 반환 (호출부가 기존 글 URL로 fallback)', () => {
    expect(buildCommentAnchorUrl({ boardType: 'STORY', slug: 's', postId: 'p', commentId: null })).toBeNull()
    expect(buildCommentAnchorUrl({ boardType: 'STORY', slug: 's', postId: 'p', commentId: undefined })).toBeNull()
    expect(buildCommentAnchorUrl({ boardType: 'STORY', slug: 's', postId: 'p', commentId: '' })).toBeNull()
  })

  it('postId 없음 → null 반환', () => {
    expect(buildCommentAnchorUrl({ boardType: 'STORY', slug: 's', postId: null, commentId: 'c' })).toBeNull()
  })

  it('앵커 URL의 글 경로 부분 = buildNotificationLinkUrl 결과와 동일 (경로 규칙 이원화 방지)', () => {
    const input = { boardType: 'HUMOR', slug: 'my-slug', postId: 'cmPOST' }
    const anchor = buildCommentAnchorUrl({ ...input, commentId: 'cmC1' })
    const plain = buildNotificationLinkUrl({ ...input, linkUrl: null })
    expect(anchor).toBe(`${plain}#comment-cmC1`)
  })
})

describe('buildNotificationLinkUrl — 기존 동작 불변 회귀', () => {
  it('저장된 linkUrl(앵커 포함)이 최우선 — 조회 시 앵커가 그대로 살아나온다', () => {
    expect(
      buildNotificationLinkUrl({
        linkUrl: '/community/stories/my-slug#comment-cmC1',
        postId: 'cmPOST',
        boardType: 'STORY',
        slug: 'my-slug',
      }),
    ).toBe('/community/stories/my-slug#comment-cmC1')
  })

  it('linkUrl 없으면 기존대로 postId 기반 글 URL (앵커 없음)', () => {
    expect(
      buildNotificationLinkUrl({ linkUrl: null, postId: 'cmPOST', boardType: 'STORY', slug: 'my-slug' }),
    ).toBe('/community/stories/my-slug')
  })

  it('postId 없음 → 알림 목록 fallback', () => {
    expect(
      buildNotificationLinkUrl({ linkUrl: null, postId: null, boardType: null, slug: null }),
    ).toBe('/my/notifications')
  })
})
