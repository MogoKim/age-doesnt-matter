import { prisma } from '@/lib/prisma'

// ─── 감사 로그 ───

export async function getAuditLogs(filters: {
  action?: string
  search?: string
  cursor?: string
}) {
  const where: Record<string, unknown> = {}
  if (filters.action) where.action = filters.action
  if (filters.search) {
    where.OR = [
      { targetId: { contains: filters.search, mode: 'insensitive' } },
      { action: { contains: filters.search, mode: 'insensitive' } },
    ]
  }

  const logs = await prisma.adminAuditLog.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: 30,
    ...(filters.cursor
      ? { cursor: { id: filters.cursor }, skip: 1 }
      : {}),
    include: {
      admin: { select: { nickname: true, email: true } },
    },
  })

  return {
    logs,
    hasMore: logs.length === 30,
  }
}

// ─── DailyBrief ───

export async function getDailyBrief(date?: Date) {
  const target = date ?? new Date()
  target.setHours(0, 0, 0, 0)
  return prisma.dailyBrief.findFirst({
    where: { date: { gte: target, lt: new Date(target.getTime() + 86400000) } },
    orderBy: { createdAt: 'desc' },
  })
}

export async function getDailyBriefs(days = 7) {
  const since = new Date()
  since.setDate(since.getDate() - days)
  since.setHours(0, 0, 0, 0)
  return prisma.dailyBrief.findMany({
    where: { date: { gte: since } },
    orderBy: { date: 'desc' },
  })
}
