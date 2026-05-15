'use server'

import { prisma } from '@/lib/prisma'
import { revalidatePath } from 'next/cache'
import type { PopupType, PopupTarget } from '@/generated/prisma/client'
import { getAdminSession } from '@/lib/admin-auth'

async function requireAdmin() {
  const session = await getAdminSession()
  if (!session) throw new Error('관리자 인증이 필요합니다.')
  return session
}

interface CreatePopupInput {
  type: PopupType
  target: PopupTarget
  targetPaths: string[]
  title: string | null
  content: string | null
  imageUrl: string | null
  linkUrl: string | null
  buttonText: string | null
  startDate: string
  endDate: string
  priority: number
  isActive: boolean
  showOncePerDay: boolean
  hideForDays: number | null
}

export async function createPopup(input: CreatePopupInput) {
  const admin = await requireAdmin()

  if (new Date(input.startDate) >= new Date(input.endDate)) {
    throw new Error('종료일은 시작일보다 이후여야 합니다.')
  }

  const created = await prisma.popup.create({
    data: {
      type: input.type,
      target: input.target,
      targetPaths: input.targetPaths,
      title: input.title,
      content: input.content,
      imageUrl: input.imageUrl,
      linkUrl: input.linkUrl,
      buttonText: input.buttonText,
      startDate: new Date(input.startDate),
      endDate: new Date(input.endDate),
      priority: input.priority,
      isActive: input.isActive,
      showOncePerDay: input.showOncePerDay,
      hideForDays: input.hideForDays,
    },
  })

  await prisma.adminAuditLog.create({
    data: {
      adminId: admin.adminId,
      action: 'POPUP_CREATE',
      targetType: 'POPUP',
      targetId: created.id,
      after: {
        type: input.type,
        target: input.target,
        title: input.title,
        isActive: input.isActive,
        startDate: input.startDate,
        endDate: input.endDate,
      },
    },
  })

  revalidatePath('/admin/popups')
}

export async function updatePopup(id: string, input: Partial<CreatePopupInput>) {
  const admin = await requireAdmin()

  if (input.startDate && input.endDate && new Date(input.startDate) >= new Date(input.endDate)) {
    throw new Error('종료일은 시작일보다 이후여야 합니다.')
  }

  const existing = await prisma.popup.findUnique({ where: { id } })

  const data: Record<string, unknown> = { ...input }
  if (input.startDate) data.startDate = new Date(input.startDate)
  if (input.endDate) data.endDate = new Date(input.endDate)

  await prisma.popup.update({ where: { id }, data })

  await prisma.adminAuditLog.create({
    data: {
      adminId: admin.adminId,
      action: 'POPUP_UPDATE',
      targetType: 'POPUP',
      targetId: id,
      before: existing
        ? {
            title: existing.title,
            isActive: existing.isActive,
            startDate: existing.startDate.toISOString(),
            endDate: existing.endDate.toISOString(),
          }
        : undefined,
      after: data as Record<string, string | number | boolean | null>,
    },
  })

  revalidatePath('/admin/popups')
}

export async function togglePopupActive(id: string, isActive: boolean) {
  const admin = await requireAdmin()

  await prisma.popup.update({ where: { id }, data: { isActive } })

  await prisma.adminAuditLog.create({
    data: {
      adminId: admin.adminId,
      action: isActive ? 'POPUP_ACTIVATE' : 'POPUP_DEACTIVATE',
      targetType: 'POPUP',
      targetId: id,
      before: { isActive: !isActive },
      after: { isActive },
    },
  })

  revalidatePath('/admin/popups')
}

export async function deletePopup(id: string) {
  const admin = await requireAdmin()

  const existing = await prisma.popup.findUnique({ where: { id } })

  await prisma.popup.delete({ where: { id } })

  await prisma.adminAuditLog.create({
    data: {
      adminId: admin.adminId,
      action: 'POPUP_DELETE',
      targetType: 'POPUP',
      targetId: id,
      before: existing
        ? { title: existing.title, type: existing.type, isActive: existing.isActive }
        : undefined,
    },
  })

  revalidatePath('/admin/popups')
}

export async function getPopupList() {
  await requireAdmin()
  return prisma.popup.findMany({
    orderBy: [{ isActive: 'desc' }, { priority: 'desc' }, { createdAt: 'desc' }],
    take: 100,
  })
}
