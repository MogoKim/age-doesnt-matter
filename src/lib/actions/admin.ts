'use server'

import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { getAdminSession } from '@/lib/admin-auth'
import type {
  AdSlot,
  AdType,
  BannedWordCategory,
  Grade,
  PostStatus,
  ReportAction,
  UserStatus,
} from '@/generated/prisma/client'

async function requireAdmin() {
  const session = await getAdminSession()
  if (!session) throw new Error('관리자 인증이 필요합니다.')
  return session
}

// ─── 콘텐츠 액션 ───

export async function adminUpdatePostStatus(postId: string, status: PostStatus) {
  const admin = await requireAdmin()

  await prisma.post.update({
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

// ─── 히어로 배너 ───

export async function adminCreateBanner(data: {
  title: string
  description?: string
  imageUrl: string
  linkUrl?: string
  startDate: string
  endDate: string
  priority?: number
}) {
  const admin = await requireAdmin()

  const banner = await prisma.banner.create({
    data: {
      title: data.title,
      description: data.description,
      imageUrl: data.imageUrl,
      linkUrl: data.linkUrl,
      startDate: new Date(data.startDate),
      endDate: new Date(data.endDate),
      priority: data.priority ?? 0,
    },
  })

  await prisma.adminAuditLog.create({
    data: {
      adminId: admin.adminId,
      action: 'BANNER_CREATE',
      targetType: 'BANNER',
      targetId: banner.id,
    },
  })

  revalidatePath('/admin/banners')
}

export async function adminUpdateBanner(
  bannerId: string,
  data: {
    title?: string
    description?: string
    imageUrl?: string
    linkUrl?: string
    startDate?: string
    endDate?: string
    priority?: number
    isActive?: boolean
  }
) {
  const admin = await requireAdmin()

  await prisma.banner.update({
    where: { id: bannerId },
    data: {
      ...data,
      ...(data.startDate && { startDate: new Date(data.startDate) }),
      ...(data.endDate && { endDate: new Date(data.endDate) }),
    },
  })

  await prisma.adminAuditLog.create({
    data: {
      adminId: admin.adminId,
      action: 'BANNER_UPDATE',
      targetType: 'BANNER',
      targetId: bannerId,
    },
  })

  revalidatePath('/admin/banners')
}

export async function adminDeleteBanner(bannerId: string) {
  const admin = await requireAdmin()

  await prisma.banner.delete({ where: { id: bannerId } })

  await prisma.adminAuditLog.create({
    data: {
      adminId: admin.adminId,
      action: 'BANNER_DELETE',
      targetType: 'BANNER',
      targetId: bannerId,
    },
  })

  revalidatePath('/admin/banners')
}

// ─── 광고 배너 ───

export async function adminCreateAdBanner(data: {
  slot: AdSlot
  adType: AdType
  title?: string
  imageUrl?: string
  htmlCode?: string
  clickUrl?: string
  startDate: string
  endDate: string
  priority?: number
}) {
  const admin = await requireAdmin()

  const ad = await prisma.adBanner.create({
    data: {
      slot: data.slot,
      adType: data.adType,
      title: data.title,
      imageUrl: data.imageUrl,
      htmlCode: data.htmlCode,
      clickUrl: data.clickUrl,
      startDate: new Date(data.startDate),
      endDate: new Date(data.endDate),
      priority: data.priority ?? 0,
    },
  })

  await prisma.adminAuditLog.create({
    data: {
      adminId: admin.adminId,
      action: 'AD_CREATE',
      targetType: 'AD',
      targetId: ad.id,
    },
  })

  revalidatePath('/admin/banners')
}

export async function adminUpdateAdBanner(
  adId: string,
  data: {
    title?: string
    imageUrl?: string
    htmlCode?: string
    clickUrl?: string
    startDate?: string
    endDate?: string
    priority?: number
    isActive?: boolean
  }
) {
  const admin = await requireAdmin()

  await prisma.adBanner.update({
    where: { id: adId },
    data: {
      ...data,
      ...(data.startDate && { startDate: new Date(data.startDate) }),
      ...(data.endDate && { endDate: new Date(data.endDate) }),
    },
  })

  await prisma.adminAuditLog.create({
    data: {
      adminId: admin.adminId,
      action: 'AD_UPDATE',
      targetType: 'AD',
      targetId: adId,
    },
  })

  revalidatePath('/admin/banners')
}

export async function adminDeleteAdBanner(adId: string) {
  const admin = await requireAdmin()

  await prisma.adBanner.delete({ where: { id: adId } })

  await prisma.adminAuditLog.create({
    data: {
      adminId: admin.adminId,
      action: 'AD_DELETE',
      targetType: 'AD',
      targetId: adId,
    },
  })

  revalidatePath('/admin/banners')
}

// ─── 금지어 ───

export async function adminCreateBannedWord(word: string, category: BannedWordCategory) {
  const admin = await requireAdmin()

  const entry = await prisma.bannedWord.create({
    data: { word, category },
  })

  await prisma.adminAuditLog.create({
    data: {
      adminId: admin.adminId,
      action: 'BANNED_WORD_CREATE',
      targetType: 'BOARD_CONFIG',
      targetId: entry.id,
      after: { word, category },
    },
  })

  revalidatePath('/admin/settings')
}

export async function adminDeleteBannedWord(wordId: string) {
  const admin = await requireAdmin()

  await prisma.bannedWord.delete({ where: { id: wordId } })

  await prisma.adminAuditLog.create({
    data: {
      adminId: admin.adminId,
      action: 'BANNED_WORD_DELETE',
      targetType: 'BOARD_CONFIG',
      targetId: wordId,
    },
  })

  revalidatePath('/admin/settings')
}

export async function adminToggleBannedWord(wordId: string, isActive: boolean) {
  const admin = await requireAdmin()

  await prisma.bannedWord.update({
    where: { id: wordId },
    data: { isActive },
  })

  await prisma.adminAuditLog.create({
    data: {
      adminId: admin.adminId,
      action: isActive ? 'BANNED_WORD_ACTIVATE' : 'BANNED_WORD_DEACTIVATE',
      targetType: 'BOARD_CONFIG',
      targetId: wordId,
    },
  })

  revalidatePath('/admin/settings')
}

// ─── 게시판 설정 ───

export async function adminUpdateBoardConfig(
  configId: string,
  data: {
    displayName?: string
    description?: string
    categories?: string[]
    writeGrade?: Grade
    isActive?: boolean
    hotThreshold?: number
    fameThreshold?: number
  }
) {
  const admin = await requireAdmin()

  await prisma.boardConfig.update({
    where: { id: configId },
    data,
  })

  await prisma.adminAuditLog.create({
    data: {
      adminId: admin.adminId,
      action: 'BOARD_CONFIG_UPDATE',
      targetType: 'BOARD_CONFIG',
      targetId: configId,
      after: JSON.parse(JSON.stringify(data)),
    },
  })

  revalidatePath('/admin/settings')
}
