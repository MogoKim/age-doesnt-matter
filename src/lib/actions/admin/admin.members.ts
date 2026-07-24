'use server'

import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { getAdminSession } from '@/lib/admin-auth'
import type { Grade, UserStatus } from '@/generated/prisma/client'
import { BOARD_URL_PREFIX } from '@/lib/board-registry'

export type UserPostItem = {
  id: string
  title: string
  boardType: string
  status: string
  likeCount: number
  commentCount: number
  createdAt: Date
  slug: string | null
}

export type UserCommentItem = {
  id: string
  content: string
  status: string
  createdAt: Date
  parentId: string | null
  post: { id: string; title: string; boardType: string; slug: string | null }
}

async function requireAdmin() {
  const session = await getAdminSession()
  if (!session) throw new Error('관리자 인증이 필요합니다.')
  return session
}

// BoardType → 서비스 페이지 경로 매핑 (SSoT: board-registry — 구 로컬 중복 정의 제거)
const BOARD_PATHS: Record<string, string> = BOARD_URL_PREFIX

/** 게시글 상태 변경 시 서비스 페이지 캐시 무효화 */
function revalidateServicePaths(boardType?: string | null, postId?: string) {
  const boardPath = boardType ? BOARD_PATHS[boardType] : null
  if (boardPath) {
    revalidatePath(boardPath)
    if (postId) revalidatePath(`${boardPath}/${postId}`)
  }
  revalidatePath('/')
  revalidatePath('/best')
  revalidatePath('/search')
}

export async function adminUpdateUserStatus(
  userId: string,
  status: UserStatus,
  suspendDays?: number
) {
  const admin = await requireAdmin()

  const existingUser = await prisma.user.findUnique({ where: { id: userId } })

  const data: Record<string, unknown> = { status }
  if (status === 'SUSPENDED' && suspendDays) {
    const until = new Date()
    until.setDate(until.getDate() + suspendDays)
    data.suspendedUntil = until
  }
  if (status === 'ACTIVE') {
    data.suspendedUntil = null
  }

  await prisma.user.update({
    where: { id: userId },
    data,
  })

  // 차단 해제(ACTIVE 복원) 시 — BANNED였던 경우에만 글/댓글 복구
  if (status === 'ACTIVE' && existingUser?.status === 'BANNED') {
    const userPosts = await prisma.post.findMany({
      where: { authorId: userId, status: 'HIDDEN' },
      select: { boardType: true },
    })
    await prisma.post.updateMany({
      where: { authorId: userId, status: 'HIDDEN' },
      data: { status: 'PUBLISHED' },
    })
    await prisma.comment.updateMany({
      where: { authorId: userId, status: 'HIDDEN' },
      data: { status: 'ACTIVE' },
    })
    const boardTypes = [...new Set(userPosts.map((p) => p.boardType))]
    for (const bt of boardTypes) revalidateServicePaths(bt)
  }

  // 영구 차단 시 기존 글/댓글 전체 숨김 + 서비스 캐시 무효화
  if (status === 'BANNED') {
    const userPosts = await prisma.post.findMany({
      where: { authorId: userId, status: 'PUBLISHED' },
      select: { boardType: true },
    })
    await prisma.post.updateMany({
      where: { authorId: userId, status: 'PUBLISHED' },
      data: { status: 'HIDDEN' },
    })
    await prisma.comment.updateMany({
      where: { authorId: userId, status: 'ACTIVE' },
      data: { status: 'HIDDEN' },
    })
    const boardTypes = [...new Set(userPosts.map((p) => p.boardType))]
    for (const bt of boardTypes) revalidateServicePaths(bt)
  }

  // 제재 시 사용자에게 알림 발송
  if (status !== 'ACTIVE') {
    const messages: Record<string, string> = {
      SUSPENDED: `계정이 ${suspendDays}일간 정지되었습니다.`,
      BANNED: '계정이 영구 차단되었습니다.',
    }
    if (messages[status]) {
      await prisma.notification.create({
        data: {
          userId,
          type: 'SYSTEM',
          content: messages[status],
        },
      })
    }
  }

  await prisma.adminAuditLog.create({
    data: {
      adminId: admin.adminId,
      action: `USER_${status}`,
      targetType: 'USER',
      targetId: userId,
      before: existingUser ? { status: existingUser.status, suspendedUntil: existingUser.suspendedUntil } : undefined,
      after: data as Record<string, string | number | boolean | Date | null>,
      note: suspendDays ? `${suspendDays}일 정지` : undefined,
    },
  })

  revalidatePath('/admin/members')
}

export async function adminUpdateUserGrade(userId: string, grade: Grade) {
  const admin = await requireAdmin()

  const existingUser = await prisma.user.findUnique({ where: { id: userId } })

  await prisma.user.update({
    where: { id: userId },
    data: { grade },
  })

  await prisma.adminAuditLog.create({
    data: {
      adminId: admin.adminId,
      action: 'USER_GRADE_CHANGE',
      targetType: 'USER',
      targetId: userId,
      before: existingUser ? { grade: existingUser.grade } : undefined,
      after: { grade },
    },
  })

  revalidatePath('/admin/members')
}

export async function adminGetUserPosts(
  userId: string,
  cursor?: string,
  limit = 20
): Promise<{ posts: UserPostItem[]; hasMore: boolean }> {
  await requireAdmin()
  const take = limit + 1
  const rows = await prisma.post.findMany({
    where: { authorId: userId },
    orderBy: { createdAt: 'desc' },
    take,
    ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    select: {
      id: true,
      title: true,
      boardType: true,
      status: true,
      likeCount: true,
      commentCount: true,
      createdAt: true,
      slug: true,
    },
  })
  const hasMore = rows.length > limit
  return { posts: hasMore ? rows.slice(0, limit) : rows, hasMore }
}

export async function adminGetUserComments(
  userId: string,
  cursor?: string,
  limit = 20
): Promise<{ comments: UserCommentItem[]; hasMore: boolean }> {
  await requireAdmin()
  const take = limit + 1
  const rows = await prisma.comment.findMany({
    where: { authorId: userId },
    orderBy: { createdAt: 'desc' },
    take,
    ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    select: {
      id: true,
      content: true,
      status: true,
      createdAt: true,
      parentId: true,
      post: { select: { id: true, title: true, boardType: true, slug: true } },
    },
  })
  const hasMore = rows.length > limit
  return { comments: hasMore ? rows.slice(0, limit) : rows, hasMore }
}
