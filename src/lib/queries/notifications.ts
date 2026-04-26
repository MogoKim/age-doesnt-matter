import { unstable_cache } from 'next/cache'
import { prisma } from '@/lib/prisma'

/**
 * 미읽은 알림 수 — 30초 캐시 (레이아웃에서 전 페이지 사용)
 * 에러 시 0 반환 (폴백)
 */
export const getCachedUnreadCount = unstable_cache(
  async (userId: string): Promise<number> => {
    try {
      return await prisma.notification.count({
        where: { userId, isRead: false },
      })
    } catch {
      return 0
    }
  },
  ['unread-notification-count'],
  { revalidate: 30, tags: ['notifications'] }
)
