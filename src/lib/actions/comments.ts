'use server'

import { revalidatePath, revalidateTag } from 'next/cache'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { checkBannedWords } from '@/lib/banned-words'
import { sanitizeHtml } from '@/lib/sanitize'
import { checkAndPromote } from '@/lib/grade'
import { checkAndPromotePost } from '@/lib/actions/promotion'
import { calculateTrendingScore } from '@/lib/utils/trending'
import { pushService } from '@/lib/push/service'
import { BOARD_TYPE_TO_SLUG } from '@/types/api'
import { getWriteBlockReason } from '@/lib/sanctions'

interface CommentResult {
  error?: string
}

export async function createComment(
  postId: string,
  content: string,
  parentId?: string,
): Promise<CommentResult> {
  const session = await auth()
  if (!session?.user?.id) {
    return { error: '로그인이 필요합니다' }
  }

  // 제재(정지/차단) 유저는 세션이 살아있어도 작성 차단
  const blockReason = await getWriteBlockReason(session.user.id)
  if (blockReason) {
    return { error: blockReason }
  }

  const trimmed = content.trim()
  if (!trimmed) {
    return { error: '댓글 내용을 입력해 주세요' }
  }

  if (trimmed.length > 500) {
    return { error: '댓글은 500자 이내로 입력해 주세요' }
  }

  // 금지어 검사
  const banned = await checkBannedWords(trimmed)
  if (banned) {
    return { error: '사용할 수 없는 표현이 포함되어 있습니다.' }
  }

  // 게시글 존재 확인
  const post = await prisma.post.findUnique({
    where: { id: postId, status: 'PUBLISHED' },
    select: { id: true, boardType: true, authorId: true, likeCount: true },
  })
  if (!post) {
    return { error: '존재하지 않는 게시글입니다' }
  }

  // 대댓글인 경우 부모 댓글 확인
  let parentAuthorId: string | null = null
  if (parentId) {
    const parent = await prisma.comment.findUnique({
      where: { id: parentId, postId, status: 'ACTIVE' },
      select: { id: true, parentId: true, authorId: true },
    })
    if (!parent) {
      return { error: '존재하지 않는 댓글입니다' }
    }
    // 대대댓글 방지 (1단계만 허용)
    if (parent.parentId) {
      return { error: '대댓글에는 답글을 달 수 없습니다' }
    }
    parentAuthorId = parent.authorId
  }

  const safeContent = sanitizeHtml(trimmed)

  const [, updatedPost] = await prisma.$transaction([
    prisma.comment.create({
      data: {
        postId,
        authorId: session.user.id,
        content: safeContent,
        parentId: parentId || null,
      },
    }),
    prisma.post.update({
      where: { id: postId },
      data: { commentCount: { increment: 1 } },
      select: { commentCount: true },
    }),
    prisma.user.update({
      where: { id: session.user.id },
      data: { commentCount: { increment: 1 } },
    }),
  ])
  void checkAndPromote(session.user.id).catch(() => {})
  void checkAndPromotePost(postId, post.boardType, post.likeCount, updatedPost.commentCount).catch(() => {})

  // lastEngagedAt + trendingScore 업데이트 (fire-and-forget)
  void (async () => {
    const p = await prisma.post.findUnique({
      where: { id: postId },
      select: { likeCount: true, commentCount: true, viewCount: true, createdAt: true },
    })
    if (!p) return
    const score = calculateTrendingScore(p.likeCount, p.commentCount, p.viewCount, p.createdAt)
    await prisma.post.update({
      where: { id: postId },
      data: { lastEngagedAt: new Date(), trendingScore: score },
    })
  })().catch(() => {})

  // 알림 생성 (본인에게는 보내지 않음)
  const nickname = session.user.nickname ?? '회원'

  const postUrl = `/community/${BOARD_TYPE_TO_SLUG[post.boardType]}/${postId}`

  if (parentId && parentAuthorId && parentAuthorId !== session.user.id) {
    // 대댓글 → 부모 댓글 작성자에게 알림
    void prisma.notification.create({
      data: {
        userId: parentAuthorId,
        type: 'COMMENT',
        content: `${nickname}님이 회원님의 댓글에 답글을 남겼어요`,
        postId,
        fromUserId: session.user.id,
      },
    }).catch(() => {})
    void pushService.notify(parentAuthorId, {
      title: '새 답글이 달렸어요',
      body: `${nickname}: ${trimmed.slice(0, 50)}`,
      url: postUrl,
      tag: `comment-${postId}`,
    }, 'comment').catch(() => {})
  } else if (post.authorId !== session.user.id) {
    // 댓글 → 게시글 작성자에게 알림
    void prisma.notification.create({
      data: {
        userId: post.authorId,
        type: 'COMMENT',
        content: `${nickname}님이 회원님의 글에 댓글을 남겼어요`,
        postId,
        fromUserId: session.user.id,
      },
    }).catch(() => {})
    void pushService.notify(post.authorId, {
      title: '새 댓글이 달렸어요',
      body: `${nickname}: ${trimmed.slice(0, 50)}`,
      url: postUrl,
      tag: `comment-${postId}`,
    }, 'comment').catch(() => {})
  }

  revalidatePath('/community/[boardSlug]/[postId]', 'page')
  revalidateTag('comments-by-post')
  revalidateTag('post-detail')
  return {}
}

const EDIT_WINDOW_MS = 10 * 60 * 1000 // 10분

export async function editComment(
  commentId: string,
  newContent: string,
): Promise<CommentResult> {
  const session = await auth()
  if (!session?.user?.id) return { error: '로그인이 필요합니다' }

  const trimmed = newContent.trim()
  if (!trimmed) return { error: '댓글 내용을 입력해 주세요' }
  if (trimmed.length > 500) return { error: '댓글은 500자 이내로 입력해 주세요' }

  const banned = await checkBannedWords(trimmed)
  if (banned) return { error: '사용할 수 없는 표현이 포함되어 있습니다.' }

  const comment = await prisma.comment.findUnique({
    where: { id: commentId },
    select: { authorId: true, createdAt: true, status: true },
  })
  if (!comment || comment.status !== 'ACTIVE') {
    return { error: '존재하지 않는 댓글입니다' }
  }
  if (comment.authorId !== session.user.id) {
    return { error: '본인의 댓글만 수정할 수 있습니다' }
  }
  if (Date.now() - comment.createdAt.getTime() > EDIT_WINDOW_MS) {
    return { error: '댓글은 작성 후 10분 이내에만 수정할 수 있습니다' }
  }

  await prisma.comment.update({
    where: { id: commentId },
    data: { content: sanitizeHtml(trimmed) },
  })

  revalidatePath('/community/[boardSlug]/[postId]', 'page')
  revalidateTag('comments-by-post')
  return {}
}

export async function deleteComment(commentId: string): Promise<CommentResult> {
  const session = await auth()
  if (!session?.user?.id) return { error: '로그인이 필요합니다' }

  const comment = await prisma.comment.findUnique({
    where: { id: commentId },
    select: { authorId: true, postId: true, status: true, _count: { select: { replies: true } } },
  })
  if (!comment || comment.status !== 'ACTIVE') {
    return { error: '존재하지 않는 댓글입니다' }
  }
  if (comment.authorId !== session.user.id) {
    return { error: '본인의 댓글만 삭제할 수 있습니다' }
  }

  await prisma.$transaction([
    prisma.comment.update({
      where: { id: commentId },
      data: { status: 'DELETED' },
    }),
    prisma.post.update({
      where: { id: comment.postId },
      data: { commentCount: { decrement: 1 } },
    }),
    // 작성자 commentCount 감소 (생성 시 increment와 대칭 — 기존 누락분)
    prisma.user.update({
      where: { id: session.user.id },
      data: { commentCount: { decrement: 1 } },
    }),
  ])

  void (async () => {
    const p = await prisma.post.findUnique({
      where: { id: comment.postId },
      select: { likeCount: true, commentCount: true, viewCount: true, createdAt: true },
    })
    if (!p) return
    const score = calculateTrendingScore(p.likeCount, p.commentCount, p.viewCount, p.createdAt)
    await prisma.post.update({
      where: { id: comment.postId },
      data: { trendingScore: score },
    })
  })().catch(() => {})

  revalidatePath('/community/[boardSlug]/[postId]', 'page')
  revalidateTag('comments-by-post')
  return {}
}
