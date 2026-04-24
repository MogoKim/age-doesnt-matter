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
