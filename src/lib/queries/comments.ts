import { revalidatePath, revalidateTag, unstable_cache } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { GRADE_INFO } from '@/lib/grade'
import { postDetailCacheTag } from '@/lib/queries/posts/posts.base'
import { BOARD_TYPE_TO_SLUG } from '@/types/api'
import type { BoardType, CommentItem, UserSummary, Grade } from '@/types/api'

function toUserSummary(user: {
  id: string
  nickname: string
  grade: string
  profileImage: string | null
}): UserSummary {
  const grade = user.grade as Grade
  return {
    id: user.id,
    nickname: user.nickname,
    grade,
    gradeEmoji: GRADE_INFO[grade]?.emoji ?? '🌱',
    profileImage: user.profileImage,
  }
}

/** 게시글의 댓글 목록 조회 (트리 구조) */
async function _getCommentsByPostId(
  postId: string,
  userId?: string,
  sort: 'latest' | 'oldest' = 'oldest',
): Promise<CommentItem[]> {
  const orderBy = sort === 'latest' ? { createdAt: 'desc' as const } : { createdAt: 'asc' as const }

  const [rows, likesResult] = await Promise.all([
    prisma.comment.findMany({
      where: { postId, parentId: null, status: { not: 'DELETED' } },
      select: {
        id: true,
        content: true,
        likeCount: true,
        status: true,
        createdAt: true,
        authorId: true,
        guestNickname: true,
        author: {
          select: { id: true, nickname: true, grade: true, profileImage: true, status: true },
        },
        replies: {
          where: { status: { notIn: ['HIDDEN', 'DELETED'] } },
          select: {
            id: true,
            content: true,
            likeCount: true,
            status: true,
            createdAt: true,
            authorId: true,
            guestNickname: true,
            author: {
              select: { id: true, nickname: true, grade: true, profileImage: true, status: true },
            },
          },
          orderBy: { createdAt: 'asc' },
        },
      },
      orderBy,
    }),
    userId
      ? prisma.like.findMany({
          where: { userId, comment: { postId } },
          select: { commentId: true },
        })
      : Promise.resolve([]),
  ])

  const likedSet = new Set(likesResult.map((l) => l.commentId!))

  const EDIT_WINDOW_MS = 10 * 60 * 1000

  function toComment(row: typeof rows[number] | typeof rows[number]['replies'][number]): CommentItem {
    const isDeleted = row.status === 'DELETED'
    const isGuest = !row.authorId
    const isOwn = !!userId && !!row.author && row.author.id === userId
    const canEdit = isOwn && !isDeleted && (Date.now() - row.createdAt.getTime() < EDIT_WINDOW_MS)
    return {
      id: row.id,
      content: isDeleted ? '삭제된 댓글입니다.' : row.content,
      author: isDeleted || !row.author ? null : toUserSummary(row.author),
      guestNickname: row.guestNickname ?? undefined,
      isGuest,
      likeCount: row.likeCount,
      isLiked: likedSet.has(row.id),
      isDeleted,
      isOwn: isOwn && !isDeleted,
      canEdit,
      createdAt: row.createdAt.toISOString(),
      replies: 'replies' in row ? row.replies.map(toComment) : [],
    }
  }

  return rows
    .filter((r) => r.status !== 'HIDDEN' || r.replies.length > 0)
    .map(toComment)
}

/**
 * 글 단위 댓글 캐시 태그.
 *
 * 전역 태그 'comments-by-post'는 그대로 유지한다(광역 무효화가 필요한 경로 호환).
 * 다만 댓글 작성·수정·삭제 경로는 이 글 단위 태그만 무효화해서, 댓글 1건 때문에
 * 다른 글 9천여 건의 댓글 캐시까지 함께 날아가던 문제를 없앤다.
 *
 * 인자는 항상 Post.id(CUID)다 — Comment.postId가 FK라 slug로는 조회 자체가 성립하지 않는다.
 * (호출부: CommentsLoader가 resolvedId = post.id를 넘긴다)
 */
export function commentsCacheTag(postId: string): string {
  return `comments-post-${postId}`
}

/**
 * unstable_cache의 tags는 정적이라, 글 단위 태그를 붙이려면 호출 시점에 캐시 함수를 만들어야 한다.
 * 캐시 키는 keyParts + 인자 직렬화로 결정되므로 (postId, userId, sort)별 분리는 기존과 동일하다.
 * 댓글 작성/수정/삭제 시 글 단위 태그로 즉시 무효화 → TTL은 봇 순회 대비 상한.
 */
export function getCommentsByPostId(
  postId: string,
  userId?: string,
  sort: 'latest' | 'oldest' = 'oldest',
): Promise<CommentItem[]> {
  return unstable_cache(
    _getCommentsByPostId,
    ['comments-by-post', postId],
    { revalidate: 300, tags: ['comments-by-post', commentsCacheTag(postId)] },
  )(postId, userId, sort)
}

/**
 * DiscussionForumPosting JSON-LD 전용 경량 조회 — ACTIVE 최상위 댓글만(HIDDEN/DELETED 제외),
 * 화면 노출 닉네임·본문·작성일만. 답글/좋아요/프로필 미조회. 상한 limit개.
 * getCommentsByPostId(트리·표시용)와 별개 — HIDDEN이 JSON-LD에 새지 않게 status='ACTIVE'로 엄격 필터.
 */
async function _getForumCommentsForJsonLd(
  postId: string,
  limit: number,
): Promise<Array<{ authorName: string; text: string; datePublished: string }>> {
  const rows = await prisma.comment.findMany({
    where: { postId, parentId: null, status: 'ACTIVE' },
    select: { content: true, createdAt: true, guestNickname: true, author: { select: { nickname: true } } },
    orderBy: { createdAt: 'asc' },
    take: limit,
  })
  return rows
    .map((r) => ({
      authorName: (r.author?.nickname ?? r.guestNickname ?? '').trim(),
      text: (r.content ?? '').trim(),
      datePublished: r.createdAt.toISOString(),
    }))
    .filter((c) => c.authorName && c.text)
}

/**
 * JSON-LD용 댓글도 같은 글의 댓글에서 파생되므로 동일한 글 단위 태그를 함께 단다.
 * 이렇게 해야 댓글이 바뀔 때 화면 목록과 JSON-LD가 같은 시점에 함께 갱신되고,
 * 글 단위 무효화에서 누락되지 않는다.
 */
export function getForumCommentsForJsonLd(
  postId: string,
  limit: number,
): Promise<Array<{ authorName: string; text: string; datePublished: string }>> {
  return unstable_cache(
    _getForumCommentsForJsonLd,
    ['forum-comments-jsonld', postId],
    { revalidate: 300, tags: ['comments-by-post', commentsCacheTag(postId)] },
  )(postId, limit)
}

/** 캐시 무효화에 필요한 글 정보 — 경로(boardSlug)와 정본 키(slug) */
export interface PostCacheRef {
  boardType: BoardType
  slug: string | null
}

/**
 * 댓글이 바뀐 **그 글 하나만** 무효화한다. 회원/비회원 댓글 경로가 공용으로 쓴다.
 *
 * 이전에는 revalidatePath('/community/[boardSlug]/[postId]', 'page')로 라우트 패턴 전체를,
 * revalidateTag('comments-by-post'|'post-detail')로 전역 태그를 지웠다. 그래서 댓글 1건마다
 * 게시글 9천여 건의 상세·댓글 캐시가 통째로 날아가 콜드 렌더가 반복됐다.
 *
 * 태그 정의(commentsCacheTag·postDetailCacheTag) 바로 옆에 두는 이유: 무효화 대상이 캐시에 붙인
 * 태그와 어긋나면 즉시성이 조용히 깨진다. 한 곳에서 같이 바뀌도록 붙여 둔다.
 *
 * CUID와 slug 두 키를 모두 지우는 이유: 상세 페이지는 정본 URL(slug)로 getPostDetail을 호출하고
 * opengraph-image·/api/posts/[postId]는 CUID로 호출해 캐시 엔트리가 둘로 나뉠 수 있다.
 * 한쪽만 지우면 댓글 수가 옛 값으로 남는다.
 */
export function revalidatePostComments(postId: string, post: PostCacheRef | null): void {
  revalidateTag(commentsCacheTag(postId))
  revalidateTag(postDetailCacheTag(postId))

  if (post?.slug) {
    revalidateTag(commentsCacheTag(post.slug))
    revalidateTag(postDetailCacheTag(post.slug))
  }

  const boardSlug = post ? BOARD_TYPE_TO_SLUG[post.boardType] : undefined
  if (boardSlug) {
    revalidatePath(`/community/${boardSlug}/${postId}`)
    if (post?.slug) revalidatePath(`/community/${boardSlug}/${post.slug}`)
  }
}
