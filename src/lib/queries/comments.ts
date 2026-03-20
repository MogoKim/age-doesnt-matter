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

  const rows = await prisma.comment.findMany({
    where: { postId, parentId: null },
    select: {
      id: true,
      content: true,
      likeCount: true,
      status: true,
      createdAt: true,
      author: {
        select: { id: true, nickname: true, grade: true, profileImage: true },
      },
      replies: {
        where: { status: { not: 'HIDDEN' } },
        select: {
          id: true,
          content: true,
          likeCount: true,
          status: true,
          createdAt: true,
          author: {
            select: { id: true, nickname: true, grade: true, profileImage: true },
          },
        },
        orderBy: { createdAt: 'asc' },
      },
    },
    orderBy,
  })

  // 좋아요 상태 일괄 조회
  const allCommentIds = rows.flatMap((r) => [r.id, ...r.replies.map((re) => re.id)])
  let likedSet = new Set<string>()

  if (userId && allCommentIds.length > 0) {
    const likes = await prisma.like.findMany({
      where: { userId, commentId: { in: allCommentIds } },
      select: { commentId: true },
    })
    likedSet = new Set(likes.map((l) => l.commentId!))
  }

  function toComment(row: typeof rows[number] | typeof rows[number]['replies'][number]): CommentItem {
    const isDeleted = row.status === 'DELETED'
    return {
      id: row.id,
      content: isDeleted ? '삭제된 댓글입니다.' : row.content,
      author: isDeleted ? null : toUserSummary(row.author),
      likeCount: row.likeCount,
      isLiked: likedSet.has(row.id),
      isDeleted,
      createdAt: row.createdAt.toISOString(),
      replies: 'replies' in row ? row.replies.map(toComment) : [],
    }
  }

  return rows
    .filter((r) => r.status !== 'HIDDEN' || r.replies.length > 0)
    .map(toComment)
}
