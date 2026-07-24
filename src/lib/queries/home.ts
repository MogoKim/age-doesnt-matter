import { unstable_cache } from 'next/cache'
import { prisma } from '@/lib/prisma'
// BoardType → URL 접두사 (SSoT: board-registry — 구 로컬 중복 정의 제거)
import { BOARD_URL_PREFIX } from '@/lib/board-registry'

export interface ActivityPulseData {
  activeCount: number
  recentActivities: Array<{ title: string; href: string }>
}

async function _getActivityPulseData(): Promise<ActivityPulseData> {
  try {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000)
    const [activeCount, recentPosts] = await Promise.all([
      prisma.post.count({
        where: { createdAt: { gte: oneHourAgo }, status: 'PUBLISHED' },
      }),
      prisma.post.findMany({
        where: { createdAt: { gte: oneHourAgo }, status: 'PUBLISHED' },
        orderBy: { createdAt: 'desc' },
        take: 3,
        select: { id: true, title: true, boardType: true },
      }),
    ])
    return {
      activeCount,
      recentActivities: recentPosts.map((p) => ({
        title: p.title,
        href: `${BOARD_URL_PREFIX[p.boardType] ?? '/community'}/${p.id}`,
      })),
    }
  } catch {
    return { activeCount: 0, recentActivities: [] }
  }
}
export const getActivityPulseData = unstable_cache(
  _getActivityPulseData,
  ['activity-pulse-data'],
  { revalidate: 60 },
)

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
