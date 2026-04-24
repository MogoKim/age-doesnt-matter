import { NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import { prisma } from '@/lib/prisma'
import { HANDLER_REGISTRY, type HandlerMeta } from '@/lib/agent-registry'

export const dynamic = 'force-dynamic'

type DisplayStatus = 'active' | 'warning' | 'failed' | 'dispatch' | 'local' | 'unknown'

interface HandlerStatus extends HandlerMeta {
  lastStatus: string | null
  lastRun: string | null    // ISO string
  itemCount: number
  displayStatus: DisplayStatus
}

function toDisplayStatus(
  type: HandlerMeta['type'],
  lastStatus: string | null,
  lastRun: Date | null,
): DisplayStatus {
  if (type === 'DISPATCH') return 'dispatch'
  if (type === 'LOCAL') return 'local'
  if (!lastRun) return 'unknown'

  const hoursSince = (Date.now() - lastRun.getTime()) / (1000 * 60 * 60)

  if (lastStatus === 'SUCCESS') return hoursSince <= 26 ? 'active' : 'unknown'
  if (lastStatus === 'FAILED') return 'failed'
  if (lastStatus === 'PARTIAL') return 'warning'
  return 'unknown'
}

export async function GET() {
  const session = await getAdminSession()
  if (!session) {
    return NextResponse.json({ error: '어드민 로그인이 필요합니다' }, { status: 401 })
  }

  // 최근 48시간 BotLog — 핸들러별 최신 실행 상태 파악
  const fortyEightHoursAgo = new Date(Date.now() - 48 * 60 * 60 * 1000)
  const recentLogs = await prisma.botLog.findMany({
    where: { executedAt: { gte: fortyEightHoursAgo } },
    select: { botType: true, action: true, status: true, executedAt: true, itemCount: true },
    orderBy: { executedAt: 'desc' },
    take: 3000,
  })

  // 최신 항목만 유지 (orderBy desc이므로 첫 번째가 최신)
  const logMap = new Map<string, { status: string; executedAt: Date; itemCount: number }>()
  for (const log of recentLogs) {
    const key = `${log.botType}:${log.action ?? '__none__'}`
    if (!logMap.has(key)) {
      logMap.set(key, {
        status: log.status,
        executedAt: log.executedAt,
        itemCount: log.itemCount,
      })
    }
  }

  const handlers: HandlerStatus[] = HANDLER_REGISTRY.map((h) => {
    const logKey = `${h.botType}:${h.action ?? '__none__'}`
    const log = logMap.get(logKey)

    return {
      ...h,
      lastStatus: log?.status ?? null,
      lastRun: log?.executedAt.toISOString() ?? null,
      itemCount: log?.itemCount ?? 0,
      displayStatus: toDisplayStatus(h.type, log?.status ?? null, log?.executedAt ?? null),
    }
  })

  const summary = handlers.reduce(
    (acc, h) => {
      acc.total++
      if (h.displayStatus === 'active')   acc.active++
      else if (h.displayStatus === 'warning') acc.warning++
      else if (h.displayStatus === 'failed')  acc.failed++
      else if (h.displayStatus === 'dispatch') acc.dispatch++
      else if (h.displayStatus === 'local')   acc.local++
      else acc.unknown++
      return acc
    },
    { total: 0, active: 0, warning: 0, failed: 0, dispatch: 0, local: 0, unknown: 0 },
  )

  return NextResponse.json({
    generatedAt: new Date().toISOString(),
    summary,
    handlers,
  })
}
