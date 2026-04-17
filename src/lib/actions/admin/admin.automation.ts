'use server'

import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { getAdminSession } from '@/lib/admin-auth'

async function requireAdmin() {
  const session = await getAdminSession()
  if (!session) throw new Error('관리자 인증이 필요합니다.')
  return session
}

export async function adminSetAutomationStatus(active: boolean) {
  const admin = await requireAdmin()

  await prisma.adminAuditLog.create({
    data: {
      adminId: admin.adminId,
      action: 'AUTOMATION_TOGGLE',
      targetType: 'AGENT',
      targetId: 'automation',
      after: { active },
      note: active ? '자동화 재개' : '자동화 긴급정지',
    },
  })

  revalidatePath('/admin')
}
