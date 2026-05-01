'use server'

import { cookies, headers } from 'next/headers'
import { createHash, randomUUID } from 'crypto'
import { prisma } from '@/lib/prisma'
import { revalidatePath } from 'next/cache'

interface GuestLikeResult {
  error?: string
  alreadyLiked?: boolean
  toggled?: boolean
}

async function getOrCreateGuestId(): Promise<string> {
  const cookieStore = await cookies()
  const existing = cookieStore.get('guest_like_id')?.value
  if (existing) return existing
  const newId = randomUUID()
  cookieStore.set('guest_like_id', newId, {
    maxAge: 60 * 60 * 24 * 365,
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
  })
  return newId
}

async function getIpHash(): Promise<string> {
  const headerStore = await headers()
  const ip =
    headerStore.get('x-forwarded-for')?.split(',')[0].trim() ??
    headerStore.get('x-real-ip') ??
    '0.0.0.0'
  const salt = process.env.GUEST_LIKE_SALT ?? 'unaeo-guest-like-salt'
  return createHash('sha256').update(`${ip}:${salt}`).digest('hex')
}

export async function toggleGuestPostLike(postId: string): Promise<GuestLikeResult> {
  const [cookieId, ipHash] = await Promise.all([getOrCreateGuestId(), getIpHash()])

  const existing = await prisma.guestLike.findFirst({
    where: { postId, OR: [{ ipHash }, { cookieId }] },
    select: { id: true },
  })
  if (existing) return { alreadyLiked: true }

  const targetPost = await prisma.post.findUnique({
    where: { id: postId, status: 'PUBLISHED' },
    select: { id: true },
  })
  if (!targetPost) return { error: '존재하지 않는 게시글입니다' }

  await prisma.$transaction(async (tx) => {
    await tx.guestLike.create({ data: { postId, ipHash, cookieId } })

    const updatedPost = await tx.post.update({
      where: { id: postId },
      data: { likeCount: { increment: 1 }, lastEngagedAt: new Date() },
      select: { likeCount: true },
    })

    const newCount = updatedPost.likeCount
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
  })

  revalidatePath('/community')
  return { toggled: true }
}

export async function toggleGuestCommentLike(commentId: string): Promise<GuestLikeResult> {
  const [cookieId, ipHash] = await Promise.all([getOrCreateGuestId(), getIpHash()])

  const existing = await prisma.guestLike.findFirst({
    where: { commentId, OR: [{ ipHash }, { cookieId }] },
    select: { id: true },
  })
  if (existing) return { alreadyLiked: true }

  await prisma.$transaction(async (tx) => {
    await tx.guestLike.create({ data: { commentId, ipHash, cookieId } })
    await tx.comment.update({
      where: { id: commentId },
      data: { likeCount: { increment: 1 } },
    })
  })

  return { toggled: true }
}
