import { unstable_cache } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { GRADE_INFO } from '@/lib/grade'
import type { CommentItem, UserSummary, Grade } from '@/types/api'

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
export const getCommentsByPostId = unstable_cache(
  _getCommentsByPostId,
  ['comments-by-post'],
  // 댓글 작성/수정/삭제 시 revalidateTag('comments-by-post')로 즉시 무효화 → TTL은 봇 순회 대비 상한
  { revalidate: 300, tags: ['comments-by-post'] },
)

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

export const getForumCommentsForJsonLd = unstable_cache(
  _getForumCommentsForJsonLd,
  ['forum-comments-jsonld'],
  { revalidate: 300, tags: ['comments-by-post'] },
)
