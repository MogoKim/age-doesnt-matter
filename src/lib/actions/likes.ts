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
