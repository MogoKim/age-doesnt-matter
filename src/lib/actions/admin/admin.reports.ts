'use server'

import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { requireAdminSession as requireAdmin } from '@/lib/admin-auth'
import type { ReportAction } from '@/generated/prisma/client'
import { revalidateJobPost } from '@/lib/cache/job-cache'
import { revalidateServicePaths } from './revalidate'



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
      if (report.post?.boardType === 'JOB') revalidateJobPost(report.postId)
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
      before: existingReport ? { status: existingReport.status, action: existingReport.action } : undefined,
      after: { status: 'RESOLVED', action },
    },
  })

  revalidatePath('/admin/reports')
}
