'use server'

import { revalidatePath } from 'next/cache'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function markNotificationRead(notificationId: string): Promise<{ error?: string }> {
  const session = await auth()
  if (!session?.user?.id) return { error: '로그인이 필요합니다' }

  await prisma.notification.updateMany({
    where: { id: notificationId, userId: session.user.id },
    data: { isRead: true },
  })

  revalidatePath('/my/notifications')
  return {}
}

/** 알림 클릭 기록 — 읽음 처리 + 최초 클릭 시각(clickedAt). 공지 클릭(행동) 성과 집계용. */
export async function recordNotificationClick(notificationId: string): Promise<{ error?: string }> {
  const session = await auth()
  if (!session?.user?.id) return { error: '로그인이 필요합니다' }

  // clickedAt이 비어있을 때만 최초 클릭 시각 기록(+읽음). 이미 클릭됐으면 no-op.
  await prisma.notification.updateMany({
    where: { id: notificationId, userId: session.user.id, clickedAt: null },
    data: { isRead: true, clickedAt: new Date() },
  })

  revalidatePath('/my/notifications')
  return {}
}

export async function markAllNotificationsRead(): Promise<{ error?: string }> {
  const session = await auth()
  if (!session?.user?.id) return { error: '로그인이 필요합니다' }

  await prisma.notification.updateMany({
    where: { userId: session.user.id, isRead: false },
    data: { isRead: true },
  })

  revalidatePath('/my/notifications')
  return {}
}
