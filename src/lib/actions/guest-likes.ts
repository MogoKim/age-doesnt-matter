'use server'

import { cookies, headers } from 'next/headers'
import { createHash, randomUUID } from 'crypto'
import { prisma } from '@/lib/prisma'
import { revalidatePath, updateTag } from 'next/cache'
import { checkAndPromotePost } from '@/lib/actions/promotion'
import { calculateTrendingScore } from '@/lib/utils/trending'
import { after } from 'next/server'

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
    select: { id: true, boardType: true, commentCount: true },
  })
  if (!targetPost) return { error: '존재하지 않는 게시글입니다' }

  const newLikeCount = await prisma.$transaction(async (tx) => {
    await tx.guestLike.create({ data: { postId, ipHash, cookieId } })

    const updatedPost = await tx.post.update({
      where: { id: postId },
      data: { likeCount: { increment: 1 }, lastEngagedAt: new Date() },
      select: { likeCount: true },
    })

    return updatedPost.likeCount
  })

  // 🔴 `after()` 로 관리한다. 예전에는 `void fn(...).catch(...)` 였는데,
  //    그 형태는 응답 처리가 끝난 뒤에 `revalidateTag` 를 등록할 수 있고
  //    그렇게 등록된 무효화는 **요청의 캐시 처리에서 빠질 수 있다**(Next 16.3.4 재현).
  //    `after` 는 응답을 보낸 뒤에도 요청 수명 안에서 콜백을 돌려 그 등록을 살린다.
  //    ⚠️ `after(이미시작한Promise)` 나 콜백 안의 `void` 는 같은 문제가 남는다 — 반드시 await 한다.
  after(async () => {
    try {
      await checkAndPromotePost(postId, targetPost.boardType, newLikeCount, targetPost.commentCount)
    } catch (e) {
      console.error('[guest-likes] post promote 실패:', e)
    }
  })
  void (async () => {
    const p = await prisma.post.findUnique({
      where: { id: postId },
      select: { likeCount: true, commentCount: true, viewCount: true, createdAt: true },
    })
    if (!p) return
    const score = calculateTrendingScore(p.likeCount, p.commentCount, p.viewCount, p.createdAt)
    await prisma.post.update({ where: { id: postId }, data: { trendingScore: score } })
  })().catch(() => {})

  revalidatePath('/community')
  updateTag('home-trending')
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
