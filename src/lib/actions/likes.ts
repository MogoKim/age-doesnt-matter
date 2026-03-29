'use server'

import { revalidatePath } from 'next/cache'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

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
    await prisma.$transaction([
      prisma.like.delete({ where: { id: existing.id } }),
      prisma.post.update({
        where: { id: postId },
        data: { likeCount: { decrement: 1 } },
      }),
    ])
    revalidatePath(`/community`)
    return { toggled: false }
  }

  await prisma.$transaction([
    prisma.like.create({
      data: { userId, postId },
    }),
    prisma.post.update({
      where: { id: postId },
      data: { likeCount: { increment: 1 } },
    }),
  ])

  // 공감 알림 — 글 작성자에게 (본인 제외)
  const post = await prisma.post.findUnique({
    where: { id: postId },
    select: { authorId: true, likeCount: true },
  })
  if (post && post.authorId !== userId) {
    // 공감 묶음 알림: 5의 배수마다 알림 생성
    if (post.likeCount % 5 === 0 || post.likeCount === 1) {
      const content = post.likeCount === 1
        ? '회원님의 글에 첫 공감이 달렸어요'
        : `회원님의 글에 ${post.likeCount}명이 공감했어요`
      await prisma.notification.create({
        data: {
          userId: post.authorId,
          type: 'LIKE',
          content,
          postId,
          fromUserId: userId,
        },
      }).catch(() => {})
    }
  }

  // HOT 승격 체크
  if (post && post.likeCount >= 10) {
    await prisma.post.updateMany({
      where: { id: postId, promotionLevel: 'NORMAL' },
      data: { promotionLevel: 'HOT' },
    }).catch(() => {})
  }
  // HALL_OF_FAME 승격 체크
  if (post && post.likeCount >= 50) {
    await prisma.post.updateMany({
      where: { id: postId, promotionLevel: { in: ['NORMAL', 'HOT'] } },
      data: { promotionLevel: 'HALL_OF_FAME' },
    }).catch(() => {})
  }

  // lastEngagedAt 업데이트
  await prisma.post.update({
    where: { id: postId },
    data: { lastEngagedAt: new Date() },
  }).catch(() => {})

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
    await prisma.$transaction([
      prisma.like.delete({ where: { id: existing.id } }),
      prisma.comment.update({
        where: { id: commentId },
        data: { likeCount: { decrement: 1 } },
      }),
    ])
    return { toggled: false }
  }

  await prisma.$transaction([
    prisma.like.create({
      data: { userId, commentId },
    }),
    prisma.comment.update({
      where: { id: commentId },
      data: { likeCount: { increment: 1 } },
    }),
  ])
  return { toggled: true }
}
