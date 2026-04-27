import { prisma } from '@/lib/prisma'

// BoardType → URL 접두사 (my.ts의 BOARD_URL_PREFIX와 동일)
const BOARD_URL_PREFIX: Record<string, string> = {
  STORY: '/community/stories',
  HUMOR: '/community/humor',
  LIFE2: '/community/life2',
  WEEKLY: '/community/weekly',
  MAGAZINE: '/magazine',
  JOB: '/jobs',
}

export interface ActivityPulseData {
  activeCount: number
  recentActivities: Array<{ title: string; href: string }>
}

/**
 * 홈 ActivityPulse용 — 최근 1시간 게시글 현황
 * unstable_cache 60초 권장 (page.tsx에서 래핑)
 */
export async function getActivityPulseData(): Promise<ActivityPulseData> {
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
