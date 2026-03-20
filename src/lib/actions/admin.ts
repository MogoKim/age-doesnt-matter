'use server'

import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { getAdminSession } from '@/lib/admin-auth'
import type { PostStatus, ReportAction, UserStatus, Grade } from '@/generated/prisma/client'

async function requireAdmin() {
  const session = await getAdminSession()
  if (!session) throw new Error('관리자 인증이 필요합니다.')
  return session
}

// ─── 콘텐츠 액션 ───

export async function adminUpdatePostStatus(postId: string, status: PostStatus) {
  const admin = await requireAdmin()

  const post = await prisma.post.update({
    where: { id: postId },
    data: { status },
  })

  await prisma.adminAuditLog.create({
    data: {
      adminId: admin.adminId,
      action: `POST_${status}`,
      targetType: 'POST',
      targetId: postId,
    },
  })

  revalidatePath('/admin/content')
}

export async function adminTogglePin(postId: string, isPinned: boolean) {
  const admin = await requireAdmin()

  await prisma.post.update({
    where: { id: postId },
    data: { isPinned },
  })

  await prisma.adminAuditLog.create({
    data: {
      adminId: admin.adminId,
      action: isPinned ? 'POST_PIN' : 'POST_UNPIN',
      targetType: 'POST',
      targetId: postId,
    },
  })

  revalidatePath('/admin/content')
}

export async function adminBulkAction(
  postIds: string[],
  action: 'HIDDEN' | 'DELETED'
) {
  const admin = await requireAdmin()

  await prisma.post.updateMany({
    where: { id: { in: postIds } },
    data: { status: action },
  })

  for (const postId of postIds) {
    await prisma.adminAuditLog.create({
      data: {
        adminId: admin.adminId,
        action: `BULK_${action}`,
        targetType: 'POST',
        targetId: postId,
      },
    })
  }

  revalidatePath('/admin/content')
}

// ─── 회원 액션 ───

export async function adminUpdateUserStatus(
  userId: string,
  status: UserStatus,
  suspendDays?: number
) {
  const admin = await requireAdmin()

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
      note: suspendDays ? `${suspendDays}일 정지` : undefined,
    },
  })

  revalidatePath('/admin/members')
}

export async function adminUpdateUserGrade(userId: string, grade: Grade) {
  const admin = await requireAdmin()

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
      after: { grade },
    },
  })

  revalidatePath('/admin/members')
}

// ─── 신고 처리 ───

export async function adminProcessReport(
  reportId: string,
  action: ReportAction
) {
  const admin = await requireAdmin()

  const report = await prisma.report.update({
    where: { id: reportId },
    data: {
      status: 'RESOLVED',
      action,
      processedBy: admin.adminId,
      processedAt: new Date(),
    },
    include: { post: true, comment: true },
  })

  // 신고 액션에 따른 후속 처리
  if (action === 'DELETED' || action === 'HIDDEN') {
    if (report.postId) {
      await prisma.post.update({
        where: { id: report.postId },
        data: { status: action === 'DELETED' ? 'DELETED' : 'HIDDEN' },
      })
    }
    if (report.commentId) {
      await prisma.comment.update({
        where: { id: report.commentId },
        data: { status: action === 'DELETED' ? 'DELETED' : 'HIDDEN' },
      })
    }
  }

  await prisma.adminAuditLog.create({
    data: {
      adminId: admin.adminId,
      action: `REPORT_${action}`,
      targetType: 'REPORT',
      targetId: reportId,
    },
  })

  revalidatePath('/admin/reports')
}
