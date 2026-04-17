'use server'

import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { getAdminSession } from '@/lib/admin-auth'
import type { ReportAction } from '@/generated/prisma/client'

async function requireAdmin() {
  const session = await getAdminSession()
  if (!session) throw new Error('관리자 인증이 필요합니다.')
  return session
}

// BoardType → 서비스 페이지 경로 매핑
const BOARD_PATHS: Record<string, string> = {
  STORY: '/community/stories',
  HUMOR: '/community/humor',
  LIFE2: '/community/life2',
  MAGAZINE: '/magazine',
  JOB: '/jobs',
  WEEKLY: '/community/weekly',
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
  revalidatePath('/search')
}

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
