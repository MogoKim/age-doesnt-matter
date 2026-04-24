import { prisma } from '@/lib/prisma'
import { unstable_cache } from 'next/cache'
import type { BotStatus, BotType } from '@/generated/prisma/client'

// ─── 최근 BotLog (대시보드용) ───

export const getRecentBotLogs = unstable_cache(
  async () => {
    return prisma.botLog.findMany({
      orderBy: { executedAt: 'desc' },
      take: 10,
      distinct: ['botType'],
    })
  },
  ['admin-recent-bot-logs'],
  { revalidate: 300 }
)

// ─── BotLog 상세 ───

export interface BotLogFilterOptions {
  botType?: BotType
  status?: BotStatus
  since?: Date
  limit?: number
  cursor?: string
}

export async function getBotLogsDetail(options: BotLogFilterOptions = {}) {
  const { botType, status, since, limit = 50, cursor } = options
  const logs = await prisma.botLog.findMany({
    where: {
      ...(botType && { botType }),
      ...(status && { status }),
      ...(since && { executedAt: { gte: since } }),
      ...(cursor && { executedAt: { lt: new Date(cursor) } }),
    },
    orderBy: { executedAt: 'desc' },
    take: limit + 1,
  })
  const hasMore = logs.length > limit
  if (hasMore) logs.pop()
  return { logs, hasMore }
}

export async function getBotLogStats() {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const [todayCount, successCount, failedCount, totalTimeResult] = await Promise.all([
    prisma.botLog.count({ where: { executedAt: { gte: today } } }),
    prisma.botLog.count({ where: { executedAt: { gte: today }, status: 'SUCCESS' } }),
    prisma.botLog.count({ where: { executedAt: { gte: today }, status: 'FAILED' } }),
    prisma.botLog.aggregate({ _avg: { executionTimeMs: true }, where: { executedAt: { gte: today } } }),
  ])
  return {
    todayCount,
    successCount,
    failedCount,
    avgExecutionMs: Math.round(totalTimeResult._avg.executionTimeMs ?? 0),
  }
}

// ─── 자동화 상태 조회 ───

export async function getAutomationStatus(): Promise<boolean> {
  const latest = await prisma.adminAuditLog.findFirst({
    where: { action: 'AUTOMATION_TOGGLE' },
    orderBy: { createdAt: 'desc' },
  })
  if (!latest || !latest.after) return true
  const after = latest.after as { active?: boolean }
  return after.active !== false
}
