'use server'

import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { getAdminSession } from '@/lib/admin-auth'

async function requireAdmin() {
  const session = await getAdminSession()
  if (!session) throw new Error('관리자 인증이 필요합니다.')
  return session
}

export async function adminApproveQueueItem(queueId: string) {
  const admin = await requireAdmin()

  const item = await prisma.adminQueue.findUnique({ where: { id: queueId } })
  if (!item) throw new Error('승인 항목을 찾을 수 없습니다.')
  if (item.status !== 'PENDING') throw new Error('대기 중인 항목만 처리할 수 있습니다.')

  await prisma.adminQueue.update({
    where: { id: queueId },
    data: {
      status: 'APPROVED',
      resolvedBy: admin.adminId,
      resolvedAt: new Date(),
    },
  })

  await prisma.adminAuditLog.create({
    data: {
      adminId: admin.adminId,
      action: 'ADMIN_QUEUE_APPROVE',
      targetType: 'ADMIN_QUEUE',
      targetId: queueId,
      before: JSON.stringify({ status: 'PENDING' }),
      after: JSON.stringify({ status: 'APPROVED' }),
    },
  })

  revalidatePath('/admin/queue')
}

export async function adminRejectQueueItem(queueId: string, reason?: string) {
  const admin = await requireAdmin()

  const item = await prisma.adminQueue.findUnique({ where: { id: queueId } })
  if (!item) throw new Error('승인 항목을 찾을 수 없습니다.')
  if (item.status !== 'PENDING') throw new Error('대기 중인 항목만 처리할 수 있습니다.')

  await prisma.adminQueue.update({
    where: { id: queueId },
    data: {
      status: 'REJECTED',
      resolvedBy: admin.adminId,
      resolvedAt: new Date(),
      payload: {
        ...(item.payload as object ?? {}),
        rejectionReason: reason,
      },
    },
  })

  await prisma.adminAuditLog.create({
    data: {
      adminId: admin.adminId,
      action: 'ADMIN_QUEUE_REJECT',
      targetType: 'ADMIN_QUEUE',
      targetId: queueId,
      before: JSON.stringify({ status: 'PENDING' }),
      after: JSON.stringify({ status: 'REJECTED', reason }),
      note: reason,
    },
  })

  revalidatePath('/admin/queue')
}
