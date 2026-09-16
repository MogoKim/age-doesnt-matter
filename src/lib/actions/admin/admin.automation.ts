'use server'

import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { requireAdminSession as requireAdmin } from '@/lib/admin-auth'


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
