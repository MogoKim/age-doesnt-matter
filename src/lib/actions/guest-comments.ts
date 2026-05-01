'use server'

import { prisma } from '@/lib/prisma'
import { verifyTurnstile } from '@/lib/turnstile'
import { revalidatePath } from 'next/cache'
import bcrypt from 'bcryptjs'

interface GuestCommentResult {
  error?: string
  id?: string
}

interface CreateGuestCommentParams {
  postId: string
  parentId?: string
  content: string
  guestNickname: string
  guestPassword: string
  turnstileToken: string
}

export async function createGuestComment({
  postId,
  parentId,
  content,
  guestNickname,
  guestPassword,
  turnstileToken,
}: CreateGuestCommentParams): Promise<GuestCommentResult> {
  const isHuman = await verifyTurnstile(turnstileToken)
  if (!isHuman) return { error: '봇으로 판단되어 작성이 거부되었어요' }

  const trimmedNickname = guestNickname.trim()
  const trimmedContent = content.trim()

  if (!trimmedNickname || trimmedNickname.length > 10) {
    return { error: '닉네임은 1~10자로 입력해 주세요' }
  }
  if (!guestPassword || guestPassword.length < 4 || guestPassword.length > 8) {
    return { error: '비밀번호는 4~8자로 입력해 주세요' }
  }
  if (!trimmedContent || trimmedContent.length > 500) {
    return { error: '댓글 내용은 1~500자로 입력해 주세요' }
  }

  const nicknameExists = await prisma.user.findUnique({
    where: { nickname: trimmedNickname },
    select: { id: true },
  })
  if (nicknameExists) return { error: '이미 사용 중인 닉네임이에요' }

  const post = await prisma.post.findUnique({
    where: { id: postId, status: 'PUBLISHED' },
    select: { id: true },
  })
  if (!post) return { error: '존재하지 않는 게시글입니다' }

  const guestPasswordHash = await bcrypt.hash(guestPassword, 10)

  const comment = await prisma.$transaction(async (tx) => {
    const created = await tx.comment.create({
      data: {
        postId,
        parentId: parentId ?? null,
        content: trimmedContent,
        guestNickname: trimmedNickname,
        guestPasswordHash,
        authorId: null,
      },
      select: { id: true },
    })

    await tx.post.update({
      where: { id: postId },
      data: { commentCount: { increment: 1 }, lastEngagedAt: new Date() },
    })

    if (parentId) {
      const parent = await tx.comment.findUnique({
        where: { id: parentId },
        select: { authorId: true },
      })
      if (parent?.authorId) {
        await tx.notification.create({
          data: {
            userId: parent.authorId,
            type: 'COMMENT',
            content: `${trimmedNickname}(비회원)님이 회원님의 댓글에 답글을 남겼어요`,
            postId,
            fromUserId: null,
          },
        })
      }
    }

    return created
  })

  revalidatePath('/community')
  return { id: comment.id }
}

async function verifyGuestPassword(
  commentId: string,
  password: string,
): Promise<{ ok: boolean; error?: string }> {
  const comment = await prisma.comment.findUnique({
    where: { id: commentId },
    select: {
      guestPasswordHash: true,
      guestPasswordAttempts: true,
      guestLockedUntil: true,
      authorId: true,
    },
  })

  if (!comment) return { ok: false, error: '존재하지 않는 댓글입니다' }
  if (comment.authorId) return { ok: false, error: '회원 댓글은 이 방법으로 수정할 수 없어요' }
  if (!comment.guestPasswordHash) return { ok: false, error: '비밀번호가 설정되지 않은 댓글이에요' }

  if (comment.guestLockedUntil && comment.guestLockedUntil > new Date()) {
    const remaining = Math.ceil((comment.guestLockedUntil.getTime() - Date.now()) / 1000)
    return { ok: false, error: `잠시 후 다시 시도해 주세요 (${remaining}초 후)` }
  }

  const isMatch = await bcrypt.compare(password, comment.guestPasswordHash)

  if (!isMatch) {
    const newAttempts = (comment.guestPasswordAttempts ?? 0) + 1
    const lockUntil = newAttempts >= 3 ? new Date(Date.now() + 60_000) : null
    await prisma.comment.update({
      where: { id: commentId },
      data: { guestPasswordAttempts: newAttempts, guestLockedUntil: lockUntil },
    })
    if (lockUntil) {
      return { ok: false, error: '비밀번호를 3회 틀리셨어요. 1분 후 다시 시도해 주세요' }
    }
    return { ok: false, error: '비밀번호가 맞지 않아요' }
  }

  if ((comment.guestPasswordAttempts ?? 0) > 0) {
    await prisma.comment.update({
      where: { id: commentId },
      data: { guestPasswordAttempts: 0, guestLockedUntil: null },
    })
  }

  return { ok: true }
}

export async function editGuestComment(
  commentId: string,
  content: string,
  password: string,
): Promise<GuestCommentResult> {
  const trimmedContent = content.trim()
  if (!trimmedContent || trimmedContent.length > 500) {
    return { error: '댓글 내용은 1~500자로 입력해 주세요' }
  }

  const { ok, error } = await verifyGuestPassword(commentId, password)
  if (!ok) return { error }

  await prisma.comment.update({
    where: { id: commentId },
    data: { content: trimmedContent },
  })

  revalidatePath('/community')
  return {}
}

export async function deleteGuestComment(
  commentId: string,
  password: string,
): Promise<GuestCommentResult> {
  const { ok, error } = await verifyGuestPassword(commentId, password)
  if (!ok) return { error }

  await prisma.$transaction(async (tx) => {
    const comment = await tx.comment.findUnique({
      where: { id: commentId },
      select: { postId: true },
    })
    await tx.comment.update({
      where: { id: commentId },
      data: { status: 'DELETED' },
    })
    if (comment?.postId) {
      await tx.post.update({
        where: { id: comment.postId },
        data: { commentCount: { decrement: 1 } },
      })
    }
  })

  revalidatePath('/community')
  return {}
}
