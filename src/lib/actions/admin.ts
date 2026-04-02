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

/** 광고 HTML 코드에서 위험한 태그/속성 제거 */
function sanitizeHtmlCode(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/on\w+\s*=\s*["'][^"']*["']/gi, '')
    .replace(/on\w+\s*=\s*[^\s>]*/gi, '')
    .replace(/javascript\s*:/gi, '')
    .replace(/<iframe[\s\S]*?<\/iframe>/gi, '')
    .replace(/<iframe[\s\S]*?\/?>/gi, '')
}

async function requireAdmin() {
  const session = await getAdminSession()
  if (!session) throw new Error('관리자 인증이 필요합니다.')
  return session
}

// BoardType → 서비스 페이지 경로 매핑
const BOARD_PATHS: Record<string, string> = {
  STORY: '/community/stories',
  HUMOR: '/community/humor',
  MAGAZINE: '/magazine',
  JOB: '/jobs',
}

/** 게시글 상태 변경 시 서비스 페이지 캐시 무효화 */
function revalidateServicePaths(boardType?: string | null, postId?: string) {
  const boardPath = boardType ? BOARD_PATHS[boardType] : null
  if (boardPath) {
    revalidatePath(boardPath)
    if (postId) revalidatePath(`${boardPath}/${postId}`)
  }
  revalidatePath('/')
  revalidatePath('/best')
}

// ─── 콘텐츠 액션 ───

export async function adminUpdatePostStatus(postId: string, status: PostStatus) {
  const admin = await requireAdmin()

  const existing = await prisma.post.findUnique({ where: { id: postId } })

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
      before: existing ? JSON.stringify({ status: existing.status }) : undefined,
      after: JSON.stringify({ status }),
    },
  })

  revalidateServicePaths(existing?.boardType, postId)
  revalidatePath('/admin/content')
}

export async function adminTogglePin(postId: string, isPinned: boolean) {
  const admin = await requireAdmin()

  const existing = await prisma.post.findUnique({ where: { id: postId } })

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
      before: existing ? JSON.stringify({ isPinned: existing.isPinned }) : undefined,
      after: JSON.stringify({ isPinned }),
    },
  })

  revalidateServicePaths(existing?.boardType, postId)
  revalidatePath('/admin/content')
}

export async function adminBulkAction(
  postIds: string[],
  action: 'HIDDEN' | 'DELETED'
) {
  const admin = await requireAdmin()

  const posts = await prisma.post.findMany({
    where: { id: { in: postIds } },
    select: { boardType: true },
  })

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

  const boardTypes = [...new Set(posts.map((p) => p.boardType))]
  for (const bt of boardTypes) revalidateServicePaths(bt)
  revalidatePath('/admin/content')
}

// ─── 회원 액션 ───

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
      before: existingUser ? JSON.stringify({ status: existingUser.status, suspendedUntil: existingUser.suspendedUntil }) : undefined,
      after: JSON.stringify(data),
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
      before: existingUser ? JSON.stringify({ grade: existingUser.grade }) : undefined,
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

  const existingReport = await prisma.report.findUnique({ where: { id: reportId } })

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
      revalidateServicePaths(report.post?.boardType, report.postId)
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
      before: existingReport ? JSON.stringify({ status: existingReport.status, action: existingReport.action }) : undefined,
      after: JSON.stringify({ status: 'RESOLVED', action }),
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

  const start = new Date(data.startDate)
  const end = new Date(data.endDate)
  if (isNaN(start.getTime()) || isNaN(end.getTime())) {
    throw new Error('올바른 날짜 형식이 아닙니다.')
  }
  if (start >= end) {
    throw new Error('시작일은 종료일보다 이전이어야 합니다.')
  }

  const banner = await prisma.banner.create({
    data: {
      title: data.title,
      description: data.description,
      imageUrl: data.imageUrl,
      linkUrl: data.linkUrl,
      startDate: start,
      endDate: end,
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

  if (data.startDate && data.endDate) {
    const start = new Date(data.startDate)
    const end = new Date(data.endDate)
    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      throw new Error('올바른 날짜 형식이 아닙니다.')
    }
    if (start >= end) {
      throw new Error('시작일은 종료일보다 이전이어야 합니다.')
    }
  }

  const existing = await prisma.banner.findUnique({ where: { id: bannerId } })

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
      before: existing ? JSON.stringify(existing) : undefined,
      after: JSON.stringify(data),
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

  const sanitizedHtmlCode = data.htmlCode ? sanitizeHtmlCode(data.htmlCode) : data.htmlCode

  const ad = await prisma.adBanner.create({
    data: {
      slot: data.slot,
      adType: data.adType,
      title: data.title,
      imageUrl: data.imageUrl,
      htmlCode: sanitizedHtmlCode,
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

  const existing = await prisma.adBanner.findUnique({ where: { id: adId } })

  const sanitizedHtmlCode = data.htmlCode ? sanitizeHtmlCode(data.htmlCode) : data.htmlCode

  await prisma.adBanner.update({
    where: { id: adId },
    data: {
      ...data,
      htmlCode: sanitizedHtmlCode,
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
      before: existing ? JSON.stringify(existing) : undefined,
      after: JSON.stringify(data),
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

  const existingConfig = await prisma.boardConfig.findUnique({ where: { id: configId } })

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
      before: existingConfig ? JSON.stringify(existingConfig) : undefined,
      after: JSON.parse(JSON.stringify(data)),
    },
  })

  revalidatePath('/admin/settings')
}
