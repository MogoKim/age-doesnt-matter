'use server'

import { prisma } from '@/lib/prisma'
import { verifyTurnstile } from '@/lib/turnstile'
import { revalidatePath, revalidateTag } from 'next/cache'
import bcrypt from 'bcryptjs'
import { calculateTrendingScore } from '@/lib/utils/trending'
import { notifyUser } from '@/lib/notify'
import { BOARD_TYPE_TO_SLUG } from '@/types/api'
import { normalizeCommentBody, toNotificationPreview } from '@/lib/comment-normalize'
import { revalidatePostComments } from '@/lib/queries/comments'

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
  // 줄바꿈 정규화(CRLF→LF·3+연속→2·trim). 내부 줄바꿈 보존. XSS는 표시단 텍스트 렌더(자동 escape)로 방어.
  const trimmedContent = normalizeCommentBody(content)

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
    // slug: 캐시 무효화 대상 경로/태그를 정본 URL 기준으로도 만들기 위해 함께 조회 (추가 쿼리 없음)
    select: { id: true, boardType: true, slug: true },
  })
  if (!post) return { error: '존재하지 않는 게시글입니다' }

  let parentAuthorId: string | null = null
  if (parentId) {
    const parent = await prisma.comment.findUnique({
      where: { id: parentId },
      select: {
        postId: true,
        parentId: true,
        authorId: true,
        status: true,
      },
    })

    if (!parent || parent.postId !== postId || parent.status !== 'ACTIVE') {
      return { error: '존재하지 않는 댓글입니다' }
    }
    if (parent.parentId) {
      return { error: '대댓글에는 답글을 달 수 없습니다' }
    }

    parentAuthorId = parent.authorId
  }

  const guestPasswordHash = await bcrypt.hash(guestPassword, 10)

  let comment: { id: string }
  try {
    comment = await prisma.$transaction(async (tx) => {
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

      return created
    })
  } catch (error) {
    console.error('[guest-comments] createGuestComment failed', error)
    return { error: '댓글 등록 중 오류가 발생했어요. 잠시 후 다시 시도해 주세요' }
  }

  // 비회원 답글 → 부모(회원) 댓글 작성자에게 종 알림 + OS 푸시.
  // notifyUser가 봇 수신자(providerId 비숫자)는 자동 제외 → 봇 댓글에 단 답글은 알림 안 감.
  if (parentAuthorId) {
    void notifyUser(parentAuthorId, {
      type: 'COMMENT',
      bellContent: `${trimmedNickname}(비회원)님이 회원님의 댓글에 답글을 남겼어요`,
      postId,
      push: {
        title: '새 답글이 달렸어요',
        body: `${trimmedNickname}(비회원): ${toNotificationPreview(trimmedContent)}`,
        url: `/community/${BOARD_TYPE_TO_SLUG[post.boardType]}/${postId}`,
        tag: `comment-${postId}`,
      },
      campaign: 'comment',
    })
  }

  void (async () => {
    const p = await prisma.post.findUnique({
      where: { id: postId },
      select: { likeCount: true, commentCount: true, viewCount: true, createdAt: true },
    })
    if (p) await prisma.post.update({
      where: { id: postId },
      data: { trendingScore: calculateTrendingScore(p.likeCount, p.commentCount, p.viewCount, p.createdAt) },
    })
  })().catch(() => {})

  revalidatePath('/community')
  revalidatePostComments(postId, post)
  // 홈 노출 갱신 — 이번 변경 범위 밖(홈 무효화 축소는 별도 PR)이라 그대로 둔다.
  revalidateTag('home-trending')
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
  const trimmedContent = normalizeCommentBody(content)
  if (!trimmedContent || trimmedContent.length > 500) {
    return { error: '댓글 내용은 1~500자로 입력해 주세요' }
  }

  const { ok, error } = await verifyGuestPassword(commentId, password)
  if (!ok) return { error }

  // update 결과로 글 정보를 함께 받아 무효화 범위를 이 글 하나로 좁힌다 (추가 쿼리 없음)
  const updated = await prisma.comment.update({
    where: { id: commentId },
    data: { content: trimmedContent },
    select: { postId: true, post: { select: { boardType: true, slug: true } } },
  })

  revalidatePath('/community')
  revalidatePostComments(updated.postId, updated.post)
  return {}
}

export async function deleteGuestComment(
  commentId: string,
  password: string,
): Promise<GuestCommentResult> {
  const { ok, error } = await verifyGuestPassword(commentId, password)
  if (!ok) return { error }

  // 트랜잭션에서 이미 조회하던 댓글에 글 정보를 얹어 돌려받는다 — 무효화 범위를 이 글 하나로 좁히기 위함
  const target = await prisma.$transaction(async (tx) => {
    const comment = await tx.comment.findUnique({
      where: { id: commentId },
      select: { postId: true, post: { select: { boardType: true, slug: true } } },
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
    return comment
  })

  revalidatePath('/community')
  if (target) revalidatePostComments(target.postId, target.post)
  return {}
}
