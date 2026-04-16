'use server'

import { revalidatePath } from 'next/cache'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import type { ReportReason } from '@/generated/prisma/client'

interface ReportResult {
  error?: string
}

const VALID_REASONS: ReportReason[] = [
  'PROFANITY',
  'POLITICS',
  'HATE',
  'SPAM',
  'ADULT',
  'OTHER',
]

export async function reportPost(
  postId: string,
  reason: ReportReason,
  description?: string,
): Promise<ReportResult> {
  const session = await auth()
  if (!session?.user?.id) {
    return { error: '로그인이 필요합니다' }
  }

  if (!VALID_REASONS.includes(reason)) {
    return { error: '올바른 신고 사유를 선택해 주세요' }
  }

  // 이미 신고했는지 확인
  const existing = await prisma.report.findFirst({
    where: { userId: session.user.id, postId },
  })
  if (existing) {
    return { error: '이미 신고한 게시글입니다' }
  }

  // 본인 글 신고 방지 + 삭제/숨김 글 신고 차단
  const post = await prisma.post.findUnique({
    where: { id: postId, status: 'PUBLISHED' },
    select: { authorId: true },
  })
  if (!post) {
    return { error: '존재하지 않는 게시글입니다' }
  }
  if (post.authorId === session.user.id) {
    return { error: '본인의 글은 신고할 수 없습니다' }
  }

  await prisma.$transaction([
    prisma.report.create({
      data: {
        userId: session.user.id,
        postId,
        reason,
        description: description?.trim().slice(0, 500) || null,
      },
    }),
    prisma.post.update({
      where: { id: postId },
      data: { reportCount: { increment: 1 } },
    }),
  ])

  // 신고 3회 누적 시 자동 숨김
  const updatedPost = await prisma.post.findUnique({
    where: { id: postId },
    select: { reportCount: true, authorId: true },
  })
  if (updatedPost && updatedPost.reportCount >= 3) {
    await prisma.$transaction([
      prisma.post.update({
        where: { id: postId },
        data: { status: 'HIDDEN' },
      }),
      prisma.notification.create({
        data: {
          userId: updatedPost.authorId,
          type: 'CONTENT_HIDDEN',
          content: '신고가 누적되어 글이 숨김 처리되었어요.',
          postId,
        },
      }),
    ])
  }

  revalidatePath('/community')
  return {}
}

export async function reportComment(
  commentId: string,
  reason: ReportReason,
  description?: string,
): Promise<ReportResult> {
  const session = await auth()
  if (!session?.user?.id) {
    return { error: '로그인이 필요합니다' }
  }

  if (!VALID_REASONS.includes(reason)) {
    return { error: '올바른 신고 사유를 선택해 주세요' }
  }

  const existing = await prisma.report.findFirst({
    where: { userId: session.user.id, commentId },
  })
  if (existing) {
    return { error: '이미 신고한 댓글입니다' }
  }

  const comment = await prisma.comment.findUnique({
    where: { id: commentId },
    select: { authorId: true },
  })
  if (!comment) {
    return { error: '존재하지 않는 댓글입니다' }
  }
  if (comment.authorId === session.user.id) {
    return { error: '본인의 댓글은 신고할 수 없습니다' }
  }

  await prisma.$transaction([
    prisma.report.create({
      data: {
        userId: session.user.id,
        commentId,
        reason,
        description: description?.trim().slice(0, 500) || null,
      },
    }),
    prisma.comment.update({
      where: { id: commentId },
      data: { reportCount: { increment: 1 } },
    }),
  ])

  // 신고 3회 누적 시 자동 숨김
  const updatedComment = await prisma.comment.findUnique({
    where: { id: commentId },
    select: { reportCount: true, authorId: true, postId: true },
  })
  if (updatedComment && updatedComment.reportCount >= 3) {
    await prisma.$transaction([
      prisma.comment.update({
        where: { id: commentId },
        data: { status: 'HIDDEN' },
      }),
      prisma.notification.create({
        data: {
          userId: updatedComment.authorId,
          type: 'CONTENT_HIDDEN',
          content: '신고가 누적되어 댓글이 숨김 처리되었어요.',
          postId: updatedComment.postId,
        },
      }),
    ])
  }

  revalidatePath('/community')
  return {}
}
