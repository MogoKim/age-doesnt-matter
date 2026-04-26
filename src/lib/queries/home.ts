import { prisma } from '@/lib/prisma'

export interface UserCounts {
  todayPosts: number
  newComments: number
  receivedLikes: number
}

/**
 * 회원 홈 활동 현황 3종 — MyActivity 컴포넌트용
 * 에러 시 0 폴백 (레이아웃 깨짐 방지)
 */
export async function getUserCounts(userId: string): Promise<UserCounts> {
  try {
    const todayStart = new Date()
    todayStart.setHours(0, 0, 0, 0)

    const [todayPosts, newComments, receivedLikes] = await Promise.all([
      // 오늘 내가 쓴 글
      prisma.post.count({
        where: { authorId: userId, createdAt: { gte: todayStart } },
      }),
      // 내 글에 달린 읽지 않은 댓글 (Notification 기반)
      prisma.notification.count({
        where: { userId, type: 'COMMENT', isRead: false },
      }),
      // 내 글에 달린 읽지 않은 공감 (Notification 기반)
      prisma.notification.count({
        where: { userId, type: 'LIKE', isRead: false },
      }),
    ])

    return { todayPosts, newComments, receivedLikes }
  } catch {
    return { todayPosts: 0, newComments: 0, receivedLikes: 0 }
  }
}
