import { prisma } from '@/lib/prisma'

export interface NoticeHistoryItem {
  id: string
  title: string
  body: string
  url: string
  sentBell: number
  sentPush: number
  readCount: number   // isRead=true (클릭 또는 '모두 읽음') — 근사
  clickCount: number  // clickedAt 있음 — 실제 클릭(행동)
  createdAt: string
}

/** 전체 공지 발송 이력 + 성과(읽음/클릭) 집계. 최신순. */
export async function getNoticeHistory(limit = 30): Promise<NoticeHistoryItem[]> {
  const notices = await prisma.notice.findMany({
    orderBy: { createdAt: 'desc' },
    take: limit,
    select: { id: true, title: true, body: true, url: true, sentBell: true, sentPush: true, createdAt: true },
  })
  if (notices.length === 0) return []

  const ids = notices.map(n => n.id)
  const [reads, clicks] = await Promise.all([
    prisma.notification.groupBy({
      by: ['noticeId'],
      where: { noticeId: { in: ids }, isRead: true },
      _count: { _all: true },
    }),
    prisma.notification.groupBy({
      by: ['noticeId'],
      where: { noticeId: { in: ids }, clickedAt: { not: null } },
      _count: { _all: true },
    }),
  ])
  const readMap = new Map(reads.map(r => [r.noticeId, r._count._all]))
  const clickMap = new Map(clicks.map(c => [c.noticeId, c._count._all]))

  return notices.map(n => ({
    id: n.id,
    title: n.title,
    body: n.body,
    url: n.url,
    sentBell: n.sentBell,
    sentPush: n.sentPush,
    readCount: readMap.get(n.id) ?? 0,
    clickCount: clickMap.get(n.id) ?? 0,
    createdAt: n.createdAt.toISOString(),
  }))
}
