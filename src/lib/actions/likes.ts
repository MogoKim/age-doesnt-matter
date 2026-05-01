'use server'

import { revalidatePath } from 'next/cache'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { checkAndPromote } from '@/lib/grade'

interface ToggleResult {
  error?: string
  toggled?: boolean
}

export async function togglePostLike(postId: string): Promise<ToggleResult> {
  const session = await auth()
  if (!session?.user?.id) {
    return { error: '로그인이 필요합니다' }
  }

  const userId = session.user.id

  const existing = await prisma.like.findUnique({
    where: { userId_postId: { userId, postId } },
  })

  if (existing) {
    // 취소 경로: receivedLikes 감소 포함 단일 트랜잭션
    await prisma.$transaction(async (tx) => {
      const cancelPost = await tx.post.findUnique({
        where: { id: postId },
        select: { authorId: true },
      })
      await tx.like.delete({ where: { id: existing.id } })
      await tx.post.update({
        where: { id: postId },
        data: { likeCount: { decrement: 1 } },
      })
      if (cancelPost && cancelPost.authorId !== userId) {
        await tx.user.update({
          where: { id: cancelPost.authorId },
          data: { receivedLikes: { decrement: 1 } },
        })
      }
    })
    revalidatePath(`/community`)
    return { toggled: false }
  }

  // 삭제/숨김된 글에는 좋아요 불가
  const targetPost = await prisma.post.findUnique({
    where: { id: postId, status: 'PUBLISHED' },
    select: { id: true, authorId: true },
  })
  if (!targetPost) return { error: '존재하지 않는 게시글입니다' }

  // 추가 경로: 모든 카운터 업데이트 + 알림 + 승격을 단일 트랜잭션으로
  const authorId = await prisma.$transaction(async (tx) => {
    await tx.like.create({ data: { userId, postId } })

    const updatedPost = await tx.post.update({
      where: { id: postId },
      data: {
        likeCount: { increment: 1 },
        lastEngagedAt: new Date(),
      },
      select: { likeCount: true, authorId: true },
    })

    const newCount = updatedPost.likeCount

    // HOT / HALL_OF_FAME 승격 (트랜잭션 내)
    if (newCount >= 50) {
      await tx.post.updateMany({
        where: { id: postId, promotionLevel: { in: ['NORMAL', 'HOT'] } },
        data: { promotionLevel: 'HALL_OF_FAME' },
      })
    } else if (newCount >= 10) {
      await tx.post.updateMany({
        where: { id: postId, promotionLevel: 'NORMAL' },
        data: { promotionLevel: 'HOT' },
      })
    }

    if (updatedPost.authorId !== userId) {
      // 글 작성자 receivedLikes 증가
      await tx.user.update({
        where: { id: updatedPost.authorId },
        data: { receivedLikes: { increment: 1 } },
      })

      // 공감 묶음 알림: 첫 공감 또는 5의 배수마다
      if (newCount % 5 === 0 || newCount === 1) {
        const content = newCount === 1
          ? '회원님의 글에 첫 공감이 달렸어요'
          : `회원님의 글에 ${newCount}명이 공감했어요`
        await tx.notification.create({
          data: {
            userId: updatedPost.authorId,
            type: 'LIKE',
            content,
            postId,
            fromUserId: userId,
          },
        })
      }
    }

    return updatedPost.authorId
  })

  // 등급 승격은 트랜잭션 외부 (실패해도 핵심 데이터 영향 없음)
  if (authorId !== userId) {
    void checkAndPromote(authorId).catch((e) =>
      console.error('[likes] grade promote 실패:', e),
    )
  }

  revalidatePath(`/community`)
  return { toggled: true }
}

export async function togglePostScrap(postId: string): Promise<ToggleResult> {
  const session = await auth()
  if (!session?.user?.id) {
    return { error: '로그인이 필요합니다' }
  }

  const userId = session.user.id

  const existing = await prisma.scrap.findUnique({
    where: { userId_postId: { userId, postId } },
  })

  if (existing) {
    await prisma.$transaction([
      prisma.scrap.delete({ where: { id: existing.id } }),
      prisma.post.update({
        where: { id: postId },
        data: { scrapCount: { decrement: 1 } },
      }),
    ])
    return { toggled: false }
  }

  await prisma.$transaction([
    prisma.scrap.create({
      data: { userId, postId },
    }),
    prisma.post.update({
      where: { id: postId },
      data: { scrapCount: { increment: 1 } },
    }),
  ])
  return { toggled: true }
}

export async function toggleCommentLike(commentId: string): Promise<ToggleResult> {
  const session = await auth()
  if (!session?.user?.id) {
    return { error: '로그인이 필요합니다' }
  }

  const userId = session.user.id

  const existing = await prisma.like.findUnique({
    where: { userId_commentId: { userId, commentId } },
  })

  if (existing) {
    // 취소 경로: receivedLikes 감소 포함 단일 트랜잭션
    await prisma.$transaction(async (tx) => {
      const cancelComment = await tx.comment.findUnique({
        where: { id: commentId },
        select: { authorId: true },
      })
      await tx.like.delete({ where: { id: existing.id } })
      await tx.comment.update({
        where: { id: commentId },
        data: { likeCount: { decrement: 1 } },
      })
      if (cancelComment && cancelComment.authorId && cancelComment.authorId !== userId) {
        await tx.user.update({
          where: { id: cancelComment.authorId },
          data: { receivedLikes: { decrement: 1 } },
        })
      }
    })
    return { toggled: false }
  }

  // 추가 경로: 모든 카운터 업데이트를 단일 트랜잭션으로
  const commentAuthorId = await prisma.$transaction(async (tx) => {
    await tx.like.create({ data: { userId, commentId } })
    await tx.comment.update({
      where: { id: commentId },
      data: { likeCount: { increment: 1 } },
    })

    const comment = await tx.comment.findUnique({
      where: { id: commentId },
      select: { authorId: true },
    })

    if (comment && comment.authorId && comment.authorId !== userId) {
      await tx.user.update({
        where: { id: comment.authorId },
        data: { receivedLikes: { increment: 1 } },
      })
    }

    return comment?.authorId
  })

  // 등급 승격은 트랜잭션 외부 (실패해도 핵심 데이터 영향 없음)
  if (commentAuthorId && commentAuthorId !== userId) {
    void checkAndPromote(commentAuthorId).catch((e) =>
      console.error('[likes] comment grade promote 실패:', e),
    )
  }

  return { toggled: true }
}

export async function incrementShareCount(postId: string): Promise<void> {
  await prisma.post.update({
    where: { id: postId },
    data: { shareCount: { increment: 1 } },
  })
}
