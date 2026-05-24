import { prisma } from '@/lib/prisma'
import { unstable_cache } from 'next/cache'
import type { BotStatus, BotType } from '@/generated/prisma/client'

// ─── 최근 BotLog (대시보드용) ───

type DashboardBotState = 'active' | 'error' | 'dormant'

const DASHBOARD_BOT_TYPES: BotType[] = [
  'JOB',
  'HUMOR',
  'STORY',
  'THREAD',
  'CEO',
  'CTO',
  'CMO',
  'CPO',
  'CDO',
  'CFO',
  'COO',
  'SEED',
  'CAFE_CRAWLER',
  'QA',
]

function getKstTodayStart(): Date {
  const now = new Date()
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000)
  return new Date(Date.UTC(kst.getUTCFullYear(), kst.getUTCMonth(), kst.getUTCDate(), -9, 0, 0, 0))
}

function formatKstDateTime(date: Date): string {
  return new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

function formatAge(date: Date): string {
  const diffMs = Date.now() - date.getTime()
  const minutes = Math.max(0, Math.floor(diffMs / 60000))
  if (minutes < 60) return `${minutes}분 전`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}시간 전`
  const days = Math.floor(hours / 24)
  return `${days}일 전`
}

function safeJsonParse(value: string | null): unknown {
  if (!value) return null
  try {
    return JSON.parse(value)
  } catch {
    return value
  }
}

function pickString(value: unknown, keys: string[]): string | null {
  if (!value || typeof value !== 'object') return null
  const record = value as Record<string, unknown>
  for (const key of keys) {
    const item = record[key]
    if (typeof item === 'string' && item.trim()) return item.trim()
  }
  return null
}

function summarizeFailure(log: {
  action: string | null
  details: string | null
  logData: unknown
  botType: BotType
}): string | null {
  if (log.botType === 'CTO' && log.action === 'AUTH_FAILURE') {
    const details = safeJsonParse(log.details)
    const reason = pickString(details, ['reason', 'error', 'detail', 'message'])
    return reason ? `GitHub Actions Secrets 확인 필요 · ${reason}` : 'GitHub Actions Secrets 확인 필요'
  }

  const parsedDetails = safeJsonParse(log.details)
  const detailReason = pickString(parsedDetails, ['reason', 'error', 'detail', 'message'])
  if (detailReason) return detailReason

  const logDataReason = pickString(log.logData, ['reason', 'error', 'message'])
  if (logDataReason) return logDataReason

  return log.action
}

export const getRecentBotLogs = unstable_cache(
  async () => {
    const today = getKstTodayStart()
    const logs = (
      await Promise.all(
        DASHBOARD_BOT_TYPES.map((botType) =>
          prisma.botLog.findFirst({
            where: { botType },
            orderBy: { executedAt: 'desc' },
          })
        )
      )
    ).filter((log): log is NonNullable<typeof log> => log !== null)

    return logs.map((log) => {
      const state: DashboardBotState =
        log.status === 'FAILED'
          ? 'error'
          : log.executedAt >= today
            ? 'active'
            : 'dormant'

      return {
        ...log,
        dashboardState: state,
        executedAtLabel: formatKstDateTime(log.executedAt),
        ageLabel: formatAge(log.executedAt),
        failureSummary: log.status === 'FAILED' ? summarizeFailure(log) : null,
      }
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
