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
  await requireAdmin()
  await prisma.popup.create({
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
  revalidatePath('/admin/popups')
}

export async function updatePopup(id: string, input: Partial<CreatePopupInput>) {
  await requireAdmin()
  const data: Record<string, unknown> = { ...input }
  if (input.startDate) data.startDate = new Date(input.startDate)
  if (input.endDate) data.endDate = new Date(input.endDate)

  await prisma.popup.update({
    where: { id },
    data,
  })
  revalidatePath('/admin/popups')
}

export async function togglePopupActive(id: string, isActive: boolean) {
  await requireAdmin()
  await prisma.popup.update({
    where: { id },
    data: { isActive },
  })
  revalidatePath('/admin/popups')
}

export async function deletePopup(id: string) {
  await requireAdmin()
  await prisma.popup.delete({ where: { id } })
  revalidatePath('/admin/popups')
}

export async function getPopupList() {
  return prisma.popup.findMany({
    orderBy: [{ isActive: 'desc' }, { priority: 'desc' }, { createdAt: 'desc' }],
    take: 100,
  })
}
