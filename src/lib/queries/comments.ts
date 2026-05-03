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
export async function getCommentsByPostId(
  postId: string,
  userId?: string,
  sort: 'latest' | 'oldest' = 'latest',
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
          select: { id: true, nickname: true, grade: true, profileImage: true },
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
              select: { id: true, nickname: true, grade: true, profileImage: true },
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
